"""Check the ECHO FACE material and second-UV contract of a face-ready GLB."""
import argparse
import json
import math
import struct
from pathlib import Path


def glb(path):
    raw = path.read_bytes()
    magic, version, declared = struct.unpack_from('<4sII', raw)
    assert (magic, version, declared) == (b'glTF', 2, len(raw))
    json_size = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20 + json_size])
    binary_size = struct.unpack_from('<I', raw, 20 + json_size)[0]
    binary = raw[28 + json_size:28 + json_size + binary_size]
    return document, binary


def uv_points(document, binary, index):
    accessor = document['accessors'][index]
    view = document['bufferViews'][accessor['bufferView']]
    assert accessor['componentType'] == 5126 and accessor['type'] == 'VEC2'
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', 8)
    return [struct.unpack_from('<ff', binary, start + i * stride)
            for i in range(accessor['count'])]


parser = argparse.ArgumentParser()
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
document, binary = glb(args.input)
face_ids = [i for i, m in enumerate(document['materials']) if m.get('name') == 'FACE']
assert len(face_ids) == 1, 'Exactly one FACE material is required'
face_material = document['materials'][face_ids[0]]
assert face_material['pbrMetallicRoughness']['baseColorTexture']['texCoord'] == 1
primitives = [p for m in document['meshes'] for p in m['primitives']]
face_primitives = [p for p in primitives if p.get('material') == face_ids[0]]
assert len(face_primitives) == 1, 'Expected one FACE primitive'
required = {'POSITION', 'NORMAL', 'TEXCOORD_0', 'TEXCOORD_1', 'JOINTS_0', 'WEIGHTS_0'}
assert all(required <= p['attributes'].keys() for p in primitives)
assert len(document.get('skins', [])) == 1 and len(document['skins'][0]['joints']) == 24
clips = {a['name'] for a in document.get('animations', [])}
assert clips == {'Idle', 'Casual_Walk_inplace', 'All_Night_Dance'}
points = uv_points(document, binary, face_primitives[0]['attributes']['TEXCOORD_1'])
assert all(math.isfinite(u) and math.isfinite(v) and -1e-5 <= u <= 1 + 1e-5
           and -1e-5 <= v <= 1 + 1e-5 for u, v in points)
face_triangles = document['accessors'][face_primitives[0]['indices']]['count'] // 3
assert face_triangles >= 300, 'FACE mesh is too small for ECHO'
report = {
    'input': str(args.input), 'passed': True, 'face_material': 'FACE',
    'face_texture_texcoord': 1, 'face_uv_layer_in_blender': 'FACE_UV',
    'face_uv_export_attribute': 'TEXCOORD_1',
    'face_primitive_count': len(face_primitives),
    'face_triangle_count': face_triangles,
    'face_vertex_count': len(points),
    'face_uv_bounds': {'min_u': min(u for u, _ in points),
                       'max_u': max(u for u, _ in points),
                       'min_v': min(v for _, v in points),
                       'max_v': max(v for _, v in points)},
    'total_triangle_count': sum(document['accessors'][p['indices']]['count'] // 3
                                for p in primitives),
    'bone_count': len(document['skins'][0]['joints']),
    'clips': sorted(clips),
    'all_primitives_have_position_normal_uv0_uv1_joints_weights': True,
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
