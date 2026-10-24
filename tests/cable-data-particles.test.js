import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { CableDataParticles } from '../src/world/pacific/CableDataParticles.js';
import { CABLE_START_X } from '../src/world/pacific/EndlessCablePath.js';

test('cable data particles pass ECHO and remain selectable on screen', () => {
  const root = new THREE.Group();
  const particles = new CableDataParticles(root, () => .5);
  particles.update(0, 0, 0);
  const before = particles.items[0].distance;
  particles.update(1, 0, 0);
  assert.ok(particles.items[0].distance - before > 3.8);

  const camera = new THREE.PerspectiveCamera(52, 1, .1, 200);
  camera.position.set(CABLE_START_X + 31, -47.8, 0);
  camera.lookAt(CABLE_START_X + 60, -47.8, 0);
  camera.updateMatrixWorld();
  const point = new THREE.Vector3().fromArray(particles.positions, 0).project(camera);
  const rect = { left: 0, top: 0, width: 400, height: 400 };
  const selected = particles.pick(
    (point.x * .5 + .5) * rect.width,
    (-point.y * .5 + .5) * rect.height,
    rect, camera,
  );
  assert.ok(selected);
  particles.setHover(selected.index);
  const held = particles.items[selected.index].distance;
  particles.update(.5, 0, 0);
  assert.equal(particles.items[selected.index].distance, held);
});
