import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { InteractiveFocusLight } from '../src/world/shared/InteractiveFocusLight.js';

test('interactive focus light follows the camera, illuminates the target, and fades out', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 2, 0);
  const region = {
    center: new THREE.Vector3(0, 2, 0),
    size: new THREE.Vector3(4, 3, 2),
    radius: 2.5,
  };
  const focus = new InteractiveFocusLight(scene);

  for (let frame = 0; frame < 90; frame += 1) focus.update(camera, region, 1 / 60);
  assert.ok(focus.light.intensity > 90);
  assert.ok(focus.light.position.distanceTo(camera.position) < 1);
  assert.ok(focus.light.target.position.distanceTo(region.center) < 0.3);
  assert.equal(focus.light.castShadow, false);

  camera.position.x = 5;
  focus.update(camera, region, 1 / 60);
  assert.ok(focus.light.position.x > 4);
  const litIntensity = focus.light.intensity;
  for (let frame = 0; frame < 90; frame += 1) focus.update(camera, null, 1 / 60);
  assert.ok(focus.light.intensity < litIntensity * 0.01);
  focus.dispose();
  assert.equal(focus.light.parent, null);
  assert.equal(focus.light.target.parent, null);
});

test('Kobe poster focus uses a narrow soft beam that scans across the printed surface', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 9 / 16);
  camera.position.set(3.2, 1.5, 3.2);
  camera.lookAt(0, 1.5, 0);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4));
  poster.position.set(0, 1.5, 0);
  poster.updateMatrixWorld(true);
  const region = {
    cameraMode: 'kobe-poster',
    center: poster.position.clone(),
    focusTarget: poster.position.clone(),
    size: new THREE.Vector3(2, 1.4, 0.1),
    focusSize: new THREE.Vector3(2, 1.4, 0.1),
    radius: 1.25,
    focusRadius: 1.25,
    meshes: [poster],
  };
  const focus = new InteractiveFocusLight(scene);

  focus.update(camera, region, 1 / 60, region.center, 0);
  const firstTarget = focus.light.target.position.clone();
  focus.update(camera, region, 1 / 60, region.center, 4);

  assert.ok(focus.light.angle <= 0.25);
  assert.ok(focus.light.penumbra >= 0.9);
  assert.ok(focus.light.intensity < 20);
  assert.ok(focus.light.target.position.distanceTo(firstTarget) > 0.25);
  assert.ok(Math.abs(focus.light.target.position.x) < 1);
  assert.ok(Math.abs(focus.light.target.position.y - 1.5) < 0.7);
  focus.dispose();
  poster.geometry.dispose();
});
