import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Ps1VertexSnap } from '../src/world/shared/Ps1VertexSnap.js';

test('a static campus skips the shared vertex snap while other worlds retain it', () => {
  const snap = new Ps1VertexSnap();
  const campus = new THREE.Group();
  campus.userData.disableVertexSnap = true;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(8, 30), new THREE.MeshStandardMaterial());
  campus.add(road);
  const originalShaderHook = road.material.onBeforeCompile;
  snap.install(campus);
  assert.equal(road.material.onBeforeCompile, originalShaderHook);

  const otherWorld = new THREE.Group();
  const scenery = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  otherWorld.add(scenery);
  const otherHook = scenery.material.onBeforeCompile;
  snap.install(otherWorld);
  assert.notEqual(scenery.material.onBeforeCompile, otherHook);
});
