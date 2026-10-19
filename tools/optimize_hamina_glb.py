"""Repack a supplied Hamina GLB with smaller embedded textures.

Usage: python optimize_hamina_glb.py SOURCE.glb public/models/Hamina.glb
The source is read only. Geometry, UVs, node names, and interaction volumes stay intact.
"""

import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image


def pad4(data, byte=b"\0"):
    return data + byte * ((-len(data)) % 4)


def main(source, target):
    with source.open("rb") as stream:
        magic, version, total = struct.unpack("<4sII", stream.read(12))
        if magic != b"glTF" or version != 2:
            raise ValueError("Expected a binary glTF 2.0 file")
        json_length, json_type = struct.unpack("<II", stream.read(8))
        if json_type != 0x4E4F534A:
            raise ValueError("Missing JSON chunk")
        document = json.loads(stream.read(json_length))
        binary_length, binary_type = struct.unpack("<II", stream.read(8))
        if binary_type != 0x004E4942:
            raise ValueError("Missing BIN chunk")
        binary = stream.read(binary_length)
        if stream.tell() != total:
            raise ValueError("Unexpected GLB length")

    image_views = {image["bufferView"]: index for index, image in enumerate(document["images"])
                   if "bufferView" in image}
    new_binary = bytearray()
    saved = 0
    for view_index, view in enumerate(document["bufferViews"]):
        start = view.get("byteOffset", 0)
        payload = binary[start:start + view["byteLength"]]
        if view_index in image_views:
            image = document["images"][image_views[view_index]]
            with Image.open(io.BytesIO(payload)) as bitmap:
                bitmap.load()
                bitmap.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                has_alpha = "A" in bitmap.getbands() and bitmap.getchannel("A").getextrema()[0] < 255
                output = io.BytesIO()
                if has_alpha:
                    bitmap.convert("RGBA").save(output, "PNG", optimize=True, compress_level=8)
                    image["mimeType"] = "image/png"
                else:
                    bitmap.convert("RGB").save(output, "JPEG", quality=84, subsampling=0,
                                               optimize=True, progressive=True)
                    image["mimeType"] = "image/jpeg"
                optimized = output.getvalue()
                if len(optimized) < len(payload):
                    saved += len(payload) - len(optimized)
                    payload = optimized
        new_binary.extend(b"\0" * ((-len(new_binary)) % 4))
        view["byteOffset"] = len(new_binary)
        view["byteLength"] = len(payload)
        new_binary.extend(payload)

    document["buffers"][0]["byteLength"] = len(new_binary)
    json_bytes = pad4(json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode(), b" ")
    bin_bytes = pad4(bytes(new_binary))
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as stream:
        stream.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)))
        stream.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        stream.write(json_bytes)
        stream.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
        stream.write(bin_bytes)
    print(f"{source.stat().st_size:,} -> {target.stat().st_size:,} bytes; textures saved {saved:,}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
