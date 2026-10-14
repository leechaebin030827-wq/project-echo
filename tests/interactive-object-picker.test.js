import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { InteractiveObjectPicker } from '../src/interaction/InteractiveObjectPicker.js';

const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) };
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

test('Cooler accepts a nearby fin gap, but not the surrounding scene', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -0.5), new THREE.Vector3(1, 1, 0.5));
  const cooler = { name: 'Cooler', bounds, meshes: [] };
  const picker = new InteractiveObjectPicker(canvas, camera, () => [cooler]);

  assert.equal(picker.pick(138, 100), cooler); // x = 1.9, outside the raw bounds
  assert.ok(Number.isFinite(picker.lastHitDistance));
  assert.equal(picker.pick(160, 100), null); // x = 3, outside the tolerance
});

test('the larger pick tolerance does not apply to other objects', () => {
  const region = {
    name: 'Data Center',
    bounds: new THREE.Box3(new THREE.Vector3(-1, -1, -0.5), new THREE.Vector3(1, 1, 0.5)),
    meshes: [],
  };
  const picker = new InteractiveObjectPicker(canvas, camera, () => [region]);

  assert.equal(picker.pick(138, 100), null);
  assert.equal(picker.lastHitDistance, Infinity);
});
