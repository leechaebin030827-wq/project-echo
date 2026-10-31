import fs from 'node:fs';

for (const filename of process.argv.slice(2)) {
  const file = fs.readFileSync(filename);
  const jsonBytes = file.readUInt32LE(12);
  const gltf = JSON.parse(file.toString('utf8', 20, 20 + jsonBytes));
  const binaryStart = 20 + jsonBytes + 8;
  const primitive = gltf.meshes[0].primitives[0];
  const vertices = gltf.accessors[primitive.attributes.POSITION];
  const indices = gltf.accessors[primitive.indices];
  const positionView = gltf.bufferViews[vertices.bufferView];
  const indexView = gltf.bufferViews[indices.bufferView];
  const positionStart = binaryStart + positionView.byteOffset + (vertices.byteOffset ?? 0);
  const indexStart = binaryStart + indexView.byteOffset + (indices.byteOffset ?? 0);
  const parent = new Int32Array(vertices.count);
  for (let index = 0; index < parent.length; index += 1) parent[index] = index;
  const find = (value) => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const indexAt = (offset) => file.readUInt32LE(indexStart + offset * 4);
  for (let offset = 0; offset < indices.count; offset += 3) {
    const a = indexAt(offset);
    union(a, indexAt(offset + 1));
    union(a, indexAt(offset + 2));
  }
  const groups = new Map();
  for (let index = 0; index < vertices.count; index += 1) {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, {
      vertices: 0,
      triangles: 0,
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    });
    const group = groups.get(root);
    group.vertices += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = file.readFloatLE(positionStart + index * 12 + axis * 4);
      group.min[axis] = Math.min(group.min[axis], value);
      group.max[axis] = Math.max(group.max[axis], value);
    }
  }
  for (let offset = 0; offset < indices.count; offset += 3) {
    groups.get(find(indexAt(offset))).triangles += 1;
  }
  const sorted = [...groups.values()].sort((a, b) => b.triangles - a.triangles);
  console.log(JSON.stringify({
    file: filename,
    components: groups.size,
    major: sorted.slice(0, 30).map((group) => ({
      vertices: group.vertices,
      triangles: group.triangles,
      center: group.min.map((value, axis) => Number(((value + group.max[axis]) / 2).toFixed(3))),
      size: group.min.map((value, axis) => Number((group.max[axis] - value).toFixed(3))),
    })),
  }, null, 2));
}
