import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { smoothCharacterHeadNormals } from '../src/characters/HeadSurfaceSmoothing.js';

test('head shading joins split vertices without changing non-head shading', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 0, 0, 1, 0, 0, 0, 1,
    2, 0, 0, 3, 0, 0, 2, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 1, 0, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0,
  ], 3));
  const joints = Array.from({ length: 9 }, (_, vertex) => [vertex < 6 ? 0 : 1, 0, 0, 0]).flat();
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(
    Array.from({ length: 9 }, () => [1, 0, 0, 0]).flat(), 4,
  ));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.skeleton = { bones: [{ name: 'Head' }, { name: 'Spine' }] };

  assert.equal(smoothCharacterHeadNormals(mesh), true);
  const normal = geometry.getAttribute('normal');
  for (let component = 0; component < 3; component += 1) {
    assert.ok(Math.abs(normal.getComponent(0, component) - normal.getComponent(3, component)) < 1e-6);
  }
  assert.deepEqual([0, 1, 2].map((component) => normal.getComponent(6, component)), [0, 1, 0]);
  geometry.dispose();
  mesh.material.dispose();
});
