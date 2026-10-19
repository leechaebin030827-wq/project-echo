import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { smoothFaceNormals, subdivideFaceSurface } from '../src/face/FaceSurfaceSmoothing.js';

test('face subdivision keeps the silhouette, UVs, and normalized skinning', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, -1, 0, 1, -1, 0, 1, 1, 0.2, -1, 1, 0,
  ], 3));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1,
  ], 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
  ], 4));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const smoothed = subdivideFaceSurface(geometry);
  assert.equal(smoothed.index.count, geometry.index.count * 4);
  assert.equal(smoothed.getAttribute('position').count, 9);
  for (let vertex = 0; vertex < 4; vertex += 1) {
    for (const name of ['position', 'uv1']) {
      const before = geometry.getAttribute(name);
      const after = smoothed.getAttribute(name);
      for (let component = 0; component < before.itemSize; component += 1) {
        assert.equal(after.getComponent(vertex, component), before.getComponent(vertex, component));
      }
    }
  }
  const weights = smoothed.getAttribute('skinWeight');
  for (let vertex = 0; vertex < weights.count; vertex += 1) {
    const total = [0, 1, 2, 3].reduce((sum, component) => sum + weights.getComponent(vertex, component), 0);
    assert.ok(Math.abs(total - 1) < 1e-6);
  }
  geometry.dispose();
  smoothed.dispose();
});

test('face normals join coincident vertices across a UV seam', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 0, 0, 1, 0, 0, 0, 1,
  ], 3));
  smoothFaceNormals(geometry);
  const normal = geometry.getAttribute('normal');
  for (let component = 0; component < 3; component += 1) {
    assert.ok(Math.abs(normal.getComponent(0, component) - normal.getComponent(3, component)) < 1e-6);
  }
  geometry.dispose();
});
