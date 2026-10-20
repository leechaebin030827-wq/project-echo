"""Repack the supplied LightCable GLB with display-sized embedded textures.

Usage: python3 scripts/optimize-lightcable.py SOURCE.glb OUTPUT.glb
Requires only macOS sips; the source model is never modified.
"""

import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def pad(data, fill=b"\0"):
    return data + fill * ((-len(data)) % 4)


def optimize(source, destination):
    data = source.read_bytes()
    magic, version, length = struct.unpack_from("<III", data)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError("Expected a complete GLB 2.0 file")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != JSON_CHUNK:
        raise ValueError("Missing JSON chunk")
    document = json.loads(data[20:20 + json_length])
    binary_header = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<II", data, binary_header)
    if binary_type != BIN_CHUNK:
        raise ValueError("Missing binary chunk")
    binary = data[binary_header + 8:binary_header + 8 + binary_length]
    if len(document["buffers"]) != 1:
        raise ValueError("Expected one embedded GLB buffer")

    replacement = {}
    with tempfile.TemporaryDirectory(prefix="lightcable-opt-") as temp:
        temp = Path(temp)
        for index, image in enumerate(document.get("images", [])):
            view_index = image["bufferView"]
            view = document["bufferViews"][view_index]
            start = view.get("byteOffset", 0)
            original = temp / f"image-{index}.png"
            original.write_bytes(binary[start:start + view["byteLength"]])
            converted = temp / f"image-{index}.jpg"
            maximum = 1024 if index in (2, 5, 8) else 2048
            quality = 88 if index in (0, 3, 6) else 84
            subprocess.run([
                "sips", "-s", "format", "jpeg", "-s", "formatOptions", str(quality),
                "-Z", str(maximum), str(original),
                "--out", str(converted),
            ], check=True, capture_output=True)
            replacement[view_index] = converted.read_bytes()
            image["mimeType"] = "image/jpeg"

    output = bytearray()
    for index, view in enumerate(document["bufferViews"]):
        output.extend(b"\0" * ((-len(output)) % 4))
        start = view.get("byteOffset", 0)
        payload = replacement.get(index, binary[start:start + view["byteLength"]])
        view["byteOffset"] = len(output)
        view["byteLength"] = len(payload)
        output.extend(payload)
    document["buffers"][0]["byteLength"] = len(output)
    json_data = pad(json.dumps(document, separators=(",", ":")).encode(), b" ")
    binary_data = pad(bytes(output))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(
        struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_data) + 8 + len(binary_data))
        + struct.pack("<II", len(json_data), JSON_CHUNK) + json_data
        + struct.pack("<II", len(binary_data), BIN_CHUNK) + binary_data
    )
    print(f"{source.stat().st_size / 1048576:.1f} MiB -> {destination.stat().st_size / 1048576:.1f} MiB")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    optimize(Path(sys.argv[1]), Path(sys.argv[2]))
