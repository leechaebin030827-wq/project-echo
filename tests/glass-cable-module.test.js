import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { CABLE_GAP_METERS, cableSpacing } from '../src/world/pacific/EndlessCablePath.js';
import {
  createGlassCableModule, GLASS_CABLE_FRAME_LENGTH, GLASS_CABLE_SPAN,
  GLASS_CABLE_WIDTH, GLASS_CABLE_HEIGHT,
} from '../src/world/pacific/GlassCableModule.js';

test('the cable has a continuous round glass wall with spaced circular frames', () => {
  const module = createGlassCableModule();
  const [glass, frame, edge] = module.parts;
  glass.geometry.computeBoundingBox();
  const bounds = glass.geometry.boundingBox;
  assert.ok(Math.abs(bounds.max.x - bounds.min.x - GLASS_CABLE_SPAN) < 1e-5);
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - GLASS_CABLE_HEIGHT) < 1e-5);
  assert.ok(Math.abs(bounds.max.z - bounds.min.z - GLASS_CABLE_WIDTH) < 1e-5);
  const positions = glass.geometry.attributes.position;
  const normals = glass.geometry.attributes.normal;
  let diagonalNormals = 0;
  for (let index = 0; index < positions.count; index += 1) {
    const radialDistance = Math.hypot(positions.getY(index), positions.getZ(index));
    assert.ok(Math.abs(radialDistance - GLASS_CABLE_WIDTH / 2) < 1e-4);
    if (Math.abs(normals.getY(index)) > .25 && Math.abs(normals.getZ(index)) > .25) {
      diagonalNormals += 1;
    }
  }
  assert.ok(diagonalNormals > 32);
  assert.equal(glass.material.transparent, true);
  assert.equal(glass.material.depthWrite, false);
  assert.ok(glass.material.opacity > .2 && glass.material.opacity < .4);
  assert.equal(typeof glass.material.onBeforeCompile, 'function');
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
