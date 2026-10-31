import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';

const [input, output, ratioText = '.25', toleranceText = '.001'] = process.argv.slice(2);
const ratio = Number(ratioText);
const tolerance = Number(toleranceText);
if (!input || !output || !(ratio > 0 && ratio < 1) || !(tolerance > 0)) {
  throw new Error('Usage: node scripts/simplify-south-africa-model.mjs input.glb output.glb [ratio] [tolerance]');
}

const source = fs.readFileSync(input);
if (source.toString('ascii', 0, 4) !== 'glTF' || source.readUInt32LE(4) !== 2) {
  throw new Error('Expected a GLB version 2 file.');
}
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
const binaryStart = 28 + jsonLength;
const primitive = gltf.meshes[0].primitives[0];
const indexAccessor = gltf.accessors[primitive.indices];
const positionAccessor = gltf.accessors[primitive.attributes.POSITION];
if (indexAccessor.componentType !== 5125 || positionAccessor.componentType !== 5126) {
  throw new Error('This optimizer expects uint32 indices and float32 positions.');
}

const floatView = (accessorIndex, components) => {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  return new Float32Array(source.buffer,
    source.byteOffset + binaryStart + view.byteOffset + (accessor.byteOffset ?? 0),
    accessor.count * components);
};
const indexView = gltf.bufferViews[indexAccessor.bufferView];
const indices = new Uint32Array(source.buffer,
  source.byteOffset + binaryStart + indexView.byteOffset + (indexAccessor.byteOffset ?? 0),
  indexAccessor.count);
const positions = floatView(primitive.attributes.POSITION, 3);

await MeshoptSimplifier.ready;
const targetCount = Math.floor(indices.length * ratio / 3) * 3;
const [simplified, error] = MeshoptSimplifier.simplify(
  indices, positions, 3, targetCount, tolerance, ['Prune'],
);
const compactIndices = simplified.slice();
const [remap, vertexCount] = MeshoptSimplifier.compactMesh(compactIndices);
const replacement = new Map();
replacement.set(indexAccessor.bufferView,
  Buffer.from(compactIndices.buffer, compactIndices.byteOffset, compactIndices.byteLength));
indexAccessor.count = compactIndices.length;
indexAccessor.min = [0];
indexAccessor.max = [vertexCount - 1];

for (const [semantic, components] of [['POSITION', 3], ['TEXCOORD_0', 2], ['NORMAL', 3]]) {
  const accessorIndex = primitive.attributes[semantic];
  const accessor = gltf.accessors[accessorIndex];
  const original = floatView(accessorIndex, components);
  const compact = new Float32Array(vertexCount * components);
  for (let oldIndex = 0; oldIndex < remap.length; oldIndex += 1) {
    const newIndex = remap[oldIndex];
    if (newIndex === 0xffffffff) continue;
    for (let component = 0; component < components; component += 1) {
      compact[newIndex * components + component] = original[oldIndex * components + component];
    }
  }
  replacement.set(accessor.bufferView, Buffer.from(compact.buffer));
  accessor.count = vertexCount;
}

const chunks = [];
let binaryLength = 0;
for (let index = 0; index < gltf.bufferViews.length; index += 1) {
  const view = gltf.bufferViews[index];
  const bytes = replacement.get(index) ?? source.subarray(
    binaryStart + view.byteOffset, binaryStart + view.byteOffset + view.byteLength,
  );
  view.byteOffset = binaryLength;
  view.byteLength = bytes.length;
  chunks.push(bytes);
  binaryLength += bytes.length;
  const padding = (4 - binaryLength % 4) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    binaryLength += padding;
  }
}
gltf.buffers[0].byteLength = binaryLength;
const json = Buffer.from(JSON.stringify(gltf));
const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
const binaryChunk = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binaryChunk.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.write('JSON', 4, 'ascii');
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(binaryChunk.length, 0);
binaryHeader.write('BIN\0', 4, 'ascii');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output,
  Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]));
console.log(JSON.stringify({
  inputTriangles: indices.length / 3,
  outputTriangles: compactIndices.length / 3,
  outputVertices: vertexCount,
  relativeError: error,
  outputMiB: +(fs.statSync(output).size / 1024 / 1024).toFixed(1),
}));
