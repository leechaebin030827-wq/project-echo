import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openSync, readSync, closeSync } from 'node:fs';

function modelSummary(path) {
  const handle = openSync(new URL(path, import.meta.url), 'r');
  try {
    const header = Buffer.alloc(20);
    readSync(handle, header, 0, 20, 0);
    assert.equal(header.toString('ascii', 0, 4), 'glTF');
    const jsonLength = header.readUInt32LE(12);
    const data = Buffer.alloc(jsonLength);
    readSync(handle, data, 0, jsonLength, 20);
    const document = JSON.parse(data.toString('utf8'));
    const byName = new Map();
    for (const node of document.nodes) {
      if (node.mesh === undefined) continue;
      const primitives = document.meshes[node.mesh].primitives;
      const triangles = primitives.reduce((sum, primitive) => (
        sum + document.accessors[primitive.indices].count / 3
      ), 0);
      const bounds = primitives.map((primitive) => document.accessors[primitive.attributes.POSITION]);
      byName.set(node.name, { triangles, bounds });
    }
    return byName;
  } finally {
    closeSync(handle);
  }
}

test('Pacific runtime GLB retains required authored pieces at a practical triangle count', () => {
  const authored = modelSummary('../public/models/LightCable.optimized.glb');
  const runtime = modelSummary('../public/models/LightCable.runtime.glb');
  for (const name of ['LightCable', 'SeaBottom', ...Array.from({ length: 5 }, (_, index) => `Fish${index + 1}`),
    ...Array.from({ length: 5 }, (_, index) => `Plant${index + 1}`)]) {
    assert.ok(runtime.has(name), `${name} missing from runtime model`);
    assert.ok(runtime.get(name).triangles < authored.get(name).triangles * .16,
      `${name} is too heavy for repeated instancing`);
  }
  const cableBounds = runtime.get('LightCable').bounds;
  const minX = Math.min(...cableBounds.map((accessor) => accessor.min[0]));
  const maxX = Math.max(...cableBounds.map((accessor) => accessor.max[0]));
  assert.ok(maxX - minX > 1.75 && maxX - minX < 2.05);
});
