import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Keep the artist's original GLB untouched. This re-encodes only its large
// embedded texture atlas so the first CT2 placement is practical to preview.
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  throw new Error('Usage: node scripts/prepare-south-africa-model.mjs input.glb output.glb');
}

const source = fs.readFileSync(input);
if (source.toString('ascii', 0, 4) !== 'glTF' || source.readUInt32LE(4) !== 2) {
  throw new Error('Expected a GLB version 2 file.');
}
const jsonLength = source.readUInt32LE(12);
const jsonStart = 20;
const gltf = JSON.parse(source.toString('utf8', jsonStart, jsonStart + jsonLength));
const binHeader = jsonStart + jsonLength;
const binStart = binHeader + 8;
const geometryEnd = gltf.bufferViews[gltf.images[0].bufferView].byteOffset;
const parts = [source.subarray(binStart, binStart + geometryEnd)];
let byteLength = geometryEnd;

for (let index = 0; index < gltf.images.length; index += 1) {
  const view = gltf.bufferViews[gltf.images[index].bufferView];
  const image = source.subarray(binStart + view.byteOffset, binStart + view.byteOffset + view.byteLength);
  const resolution = index === 2 ? 1024 : 2048;
  const codec = gltf.images[index].mimeType === 'image/png' ? 'png' : 'mjpeg';
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', codec, '-i', 'pipe:0',
    '-vf', `scale=${resolution}:${resolution}:flags=lanczos`,
    '-q:v', index === 0 ? '3' : '4', '-frames:v', '1', '-f', 'mjpeg', 'pipe:1',
  ], { input: image, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.toString() || 'ffmpeg texture resize failed.');
  view.byteOffset = byteLength;
  view.byteLength = result.stdout.length;
  gltf.images[index].mimeType = 'image/jpeg';
  parts.push(result.stdout);
  byteLength += result.stdout.length;
  const padding = (4 - byteLength % 4) % 4;
  if (padding) {
    parts.push(Buffer.alloc(padding));
    byteLength += padding;
  }
}

gltf.buffers[0].byteLength = byteLength;
const json = Buffer.from(JSON.stringify(gltf));
const jsonPadding = (4 - json.length % 4) % 4;
const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
const binChunk = Buffer.concat(parts);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.write('JSON', 4, 'ascii');
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(binChunk.length, 0);
binaryHeader.write('BIN\0', 4, 'ascii');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binChunk]));
console.log(`Prepared ${output}: ${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MiB`);
