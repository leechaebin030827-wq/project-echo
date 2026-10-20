import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSeabedGeometry, seabedHeight, SEABED_RECENTER_DISTANCE,
} from '../src/world/pacific/SeabedSurface.js';

test('the continuous seabed keeps the same surface when recycled', () => {
  for (const x of [-510, -103.8, 0, 38.2, 595]) {
    for (const z of [-170, -8.5, 0, 91]) {
      assert.ok(Math.abs(seabedHeight(x, z)
        - seabedHeight(x + SEABED_RECENTER_DISTANCE, z)) < 1e-10);
    }
  }
  const geometry = createSeabedGeometry();
  assert.ok(geometry.attributes.position.count > 5000);
  assert.ok(geometry.boundingSphere.radius > 500);
  geometry.dispose();
});
