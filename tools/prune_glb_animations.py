"""Remove exporter-only animation clips while preserving the GLB binary payload."""
import argparse
import json
import struct
from pathlib import Path


def chunks(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and length == len(raw)
    offset = 12
    result = []
    while offset < len(raw):
        size, kind = struct.unpack_from('<I4s', raw, offset)
        offset += 8
        result.append((kind, raw[offset:offset + size]))
        offset += size
    assert offset == len(raw)
    return result


parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--target', type=Path, required=True)
args = parser.parse_args()

source = chunks(args.source)
target = chunks(args.target)
source_json = json.loads(next(data for kind, data in source if kind == b'JSON'))
target_json = json.loads(next(data for kind, data in target if kind == b'JSON'))
expected = {a['name'] for a in source_json['animations']}
found = {a['name'] for a in target_json['animations']}
assert expected <= found, f'Missing source clips: {expected - found}'
removed = found - expected
target_json['animations'] = [a for a in target_json['animations'] if a['name'] in expected]
assert len(target_json['animations']) == len(expected)
payload = json.dumps(target_json, separators=(',', ':')).encode()
payload += b' ' * (-len(payload) % 4)
rebuilt = [(kind, payload if kind == b'JSON' else data) for kind, data in target]
body = b''.join(struct.pack('<I4s', len(data), kind) + data for kind, data in rebuilt)
complete = struct.pack('<4sII', b'glTF', 2, 12 + len(body)) + body
temporary = args.target.with_suffix('.validated.part')
temporary.write_bytes(complete)
assert chunks(temporary)[0][0] == b'JSON'
temporary.replace(args.target)
print(json.dumps({'kept': sorted(expected), 'removed': sorted(removed),
                  'output': str(args.target), 'bytes': len(complete)}))
