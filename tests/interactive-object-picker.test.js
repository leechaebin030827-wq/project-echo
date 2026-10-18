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

test('an exported click volume selects its visible object without rendering the volume', () => {
  const region = {
    name: 'Billboard',
    meshes: [],
    pickBounds: new THREE.Box3(
      new THREE.Vector3(-1, -1, -0.5),
      new THREE.Vector3(1, 1, 0.5),
    ),
  };
  const picker = new InteractiveObjectPicker(canvas, camera, () => [region]);
  assert.equal(picker.pick(100, 100), region);
  assert.equal(picker.pick(150, 100), null);
});

test('an exported click cube, not its visible mesh, controls hover and click', () => {
  const marker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1));
  marker.updateMatrixWorld(true);
  const visible = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1));
  visible.position.x = 3;
  visible.updateMatrixWorld(true);
  const region = {
    name: 'Money',
    meshes: [visible],
    bounds: new THREE.Box3().setFromObject(visible),
    pickMarker: marker,
    pickBounds: new THREE.Box3().setFromObject(marker),
  };
  const picker = new InteractiveObjectPicker(canvas, camera, () => [region]);

  assert.equal(picker.pick(100, 100, false), region);
  assert.equal(picker.pick(100, 100), region);
  assert.equal(picker.pick(160, 100, false), null);
  assert.equal(picker.pick(160, 100), null);
});

test('hover uses a rotated click cube envelope while click keeps its exact shape', () => {
  const marker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1));
  marker.rotation.z = Math.PI / 4;
  marker.updateMatrixWorld(true);
  const region = {
    name: 'Flag', meshes: [], pickMarker: marker,
    pickBounds: new THREE.Box3().setFromObject(marker),
  };
  const picker = new InteractiveObjectPicker(canvas, camera, () => [region]);
  assert.equal(picker.pick(126, 74, false), region);
  assert.equal(picker.pick(126, 74), null);
});

test('a camera inside the cooler click cube cannot make the whole screen hover Cooler', () => {
  const insideCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  insideCamera.position.set(0, 0, 0);
  insideCamera.lookAt(0, 0, -1);
  const coolerMarker = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
  coolerMarker.updateMatrixWorld(true);
  const otherMarker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1));
  otherMarker.position.z = -9;
  otherMarker.updateMatrixWorld(true);
  const cooler = {
    name: 'Cooler', meshes: [], pickMarker: coolerMarker,
    pickBounds: new THREE.Box3().setFromObject(coolerMarker),
  };
  const billboard = {
    name: 'Billboard', meshes: [], pickMarker: otherMarker,
    pickBounds: new THREE.Box3().setFromObject(otherMarker),
  };
  const picker = new InteractiveObjectPicker(canvas, insideCamera, () => [cooler, billboard]);

  assert.equal(picker.pick(100, 100, false), billboard);
  assert.equal(picker.pick(100, 100), billboard);
  assert.equal(picker.pick(10, 100, false), null);
  assert.equal(picker.pick(190, 100, false), null);
});

test('the legacy cooler hover margin is ignored when it surrounds the camera', () => {
  const insideCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  insideCamera.position.set(0, 0, 0);
  insideCamera.lookAt(0, 0, -1);
  const cooler = {
    name: 'Cooler', meshes: [],
    bounds: new THREE.Box3(
      new THREE.Vector3(-1, -1, -2), new THREE.Vector3(1, 1, -0.5),
    ),
  };
  const picker = new InteractiveObjectPicker(canvas, insideCamera, () => [cooler]);
  assert.equal(picker.pick(100, 100, false), null);
  assert.equal(picker.lastHitDistance, Infinity);
});

test('a nearby oversized cooler cube does not block a different visible object', () => {
  const nearCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  nearCamera.position.set(0, 0, 0);
  nearCamera.lookAt(0, 0, -1);
  const coolerMarker = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 8));
  coolerMarker.position.z = -8;
  coolerMarker.updateMatrixWorld(true);
  const otherMarker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1));
  otherMarker.position.z = -14;
  otherMarker.updateMatrixWorld(true);
  const cooler = {
    name: 'Cooler', pickMarker: coolerMarker,
    pickBounds: new THREE.Box3().setFromObject(coolerMarker),
    bounds: new THREE.Box3(
      new THREE.Vector3(2, -2, -10), new THREE.Vector3(4, 2, -6),
    ),
  };
  const billboard = {
    name: 'Billboard', pickMarker: otherMarker,
    pickBounds: new THREE.Box3().setFromObject(otherMarker),
    bounds: new THREE.Box3().setFromObject(otherMarker),
  };
  const picker = new InteractiveObjectPicker(canvas, nearCamera, () => [cooler, billboard]);
  assert.equal(picker.pick(100, 100, false), billboard);
  assert.equal(picker.pick(100, 100), billboard);
  assert.equal(picker.pick(170, 100, false), cooler);
});
