import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FixtureLights } from '../src/world/shared/FixtureLights.js';

test('point lights sit on the Light material surface and follow nearby fixtures', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const body = new THREE.MeshStandardMaterial({ name: 'Body' });
  const emitting = new THREE.MeshStandardMaterial({ name: 'Light' });
  const materials = [emitting, body, body, body, body, body];
  const first = new THREE.Mesh(geometry, materials);
  const second = new THREE.Mesh(geometry, materials);
  second.position.x = 10;
  scene.add(first, second);
  scene.updateMatrixWorld(true);

  const fixtures = new FixtureLights(scene, [first, second], {
    color: '#ffdca0', intensity: 12, distance: 7, maxLights: 1,
    focus: new THREE.Vector3(0, 0, 0),
  });
  assert.equal(fixtures.sources.length, 2);
  assert.deepEqual(fixtures.lights[0].position.toArray(), [0.5, 0, 0]);
  fixtures.update(new THREE.Vector3(10, 0, 0));
  assert.deepEqual(fixtures.lights[0].position.toArray(), [10.5, 0, 0]);
});
