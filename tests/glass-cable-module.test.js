import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { CABLE_GAP_METERS, cableSpacing } from '../src/world/pacific/EndlessCablePath.js';
import {
  createGlassCableModule, GLASS_CABLE_FRAME_LENGTH, GLASS_CABLE_SPAN,
  GLASS_CABLE_WIDTH, GLASS_CABLE_HEIGHT,
} from '../src/world/pacific/GlassCableModule.js';

test('the new cable has clear glass on all four sides with spaced frames', () => {
  const module = createGlassCableModule();
  const [glass, frame, edge] = module.parts;
  glass.geometry.computeBoundingBox();
  const bounds = glass.geometry.boundingBox;
  assert.ok(Math.abs(bounds.max.x - bounds.min.x - GLASS_CABLE_SPAN) < 1e-5);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - GLASS_CABLE_HEIGHT) < 1e-5);
  assert.ok(Math.abs(bounds.max.z - bounds.min.z - GLASS_CABLE_WIDTH) < 1e-5);
  const normals = glass.geometry.attributes.normal;
  let wallVertices = 0;
  let ceilingVertices = 0;
  for (let index = 0; index < normals.count; index += 1) {
    if (Math.abs(normals.getZ(index)) > .99) wallVertices += 1;
    if (Math.abs(normals.getY(index)) > .99) ceilingVertices += 1;
  }
  assert.ok(wallVertices >= 8 && ceilingVertices >= 8);
  assert.equal(glass.material.transparent, true);
  assert.equal(glass.material.depthWrite, false);
  assert.ok(glass.material.opacity < .16);
  assert.equal(module.frameLength, GLASS_CABLE_FRAME_LENGTH);
  const frameBounds = new THREE.Box3(
    new THREE.Vector3(-module.frameLength / 2, 0, 0),
    new THREE.Vector3(module.frameLength / 2, 0, 0),
  );
  assert.ok(Math.abs(cableSpacing(frameBounds) - GLASS_CABLE_SPAN) < 1e-5);
  assert.ok(Math.abs(GLASS_CABLE_SPAN - GLASS_CABLE_FRAME_LENGTH - CABLE_GAP_METERS) < 1e-5);
  for (const part of [glass, frame, edge]) {
    part.geometry.dispose();
    part.material.dispose();
  }
});
