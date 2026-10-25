import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleBillboardScan, sampleDataCenterSweep, sampleInteractiveShot, sampleMoneyOrbit,
} from '../src/camera/InteractiveCameraShots.js';
import * as THREE from 'three';
import { CinematicCameraController } from '../src/camera/CinematicCameraController.js';
import { EXPERIENCE_STATES } from '../src/config.js';

test('ordinary interactive subjects push in, track sideways, and pull back', () => {
  for (const subject of ['Data Center', 'Timer']) {
    const start = sampleInteractiveShot(subject, 0);
    const close = sampleInteractiveShot(subject, 1.8);
    const late = sampleInteractiveShot(subject, 12);
    assert.equal(start.distance, 1);
    assert.ok(close.distance < 0.9, `${subject} should move closer`);
    assert.ok(Math.abs(close.side) > 0.01, `${subject} should track sideways`);
    assert.ok(late.distance > close.distance, `${subject} should move back out`);
  }
});

test('billboard camera reads the graphic from left to right before revealing it whole', () => {
  const left = sampleBillboardScan(2);
  const right = sampleBillboardScan(8);
  const full = sampleBillboardScan(12);
  assert.ok(left.across < -0.2);
  assert.ok(right.across > 0.3);
  assert.ok(left.cameraAcross < -0.24 && right.cameraAcross > 0.3);
  assert.ok(left.distance < 0.85 && right.distance < 0.85);
  assert.ok(left.tilt < 0 && right.tilt > 0);
  assert.equal(full.across, 0);
  assert.equal(full.cameraAcross, 0);
  assert.ok(full.distance > 1);
});

test('data center receives one bounded facade sweep', () => {
  const left = sampleDataCenterSweep(2);
  const right = sampleDataCenterSweep(8.6);
  assert.ok(left.angle < 0 && right.angle > 0);
  assert.ok(right.angle < 0.5);
  assert.ok(right.distance >= left.distance);
});

test('flag pushes in and pulls back from a low view', () => {
  const close = sampleInteractiveShot('Flag', 2.2);
  const wide = sampleInteractiveShot('Flag', 8);
  assert.ok(close.distance < 0.8 && wide.distance > 1);
});

test('money camera stays in front while opening wide enough for nearby visitors', () => {
  const beginning = sampleMoneyOrbit(0);
  const closeLeft = sampleMoneyOrbit(4);
  const wide = sampleMoneyOrbit(13);
  const later = sampleMoneyOrbit(24);
  assert.ok(Math.abs(beginning.angle) < 1e-10);
  assert.equal(beginning.distance, 1);
  assert.equal(beginning.targetBlend, 0);
  assert.ok(closeLeft.angle < -0.25);
  assert.ok(closeLeft.distance < 0.85);
  assert.ok(wide.distance > 1.2);
  assert.ok(Math.abs(later.angle - wide.angle) > 0.05);
});

test('billboard and money films preserve the arrival frame before moving', () => {
  for (const name of ['Billboard', 'Money']) {
    const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 1000);
    camera.position.set(4, 7, 22);
    const controller = new CinematicCameraController(camera, {});
    controller.state = EXPERIENCE_STATES.ECHO_ORBIT;
    controller.target.set(0, 2, 0);
    const region = {
      name, center: new THREE.Vector3(0, 5, 0),
      bounds: new THREE.Box3(new THREE.Vector3(-8, 0, -2), new THREE.Vector3(8, 10, 2)),
      size: new THREE.Vector3(16, 10, 4), radius: 9,
      meshes: [], interestCenter: new THREE.Vector3(1, 5, 0),
    };
    const duration = controller.focusInteractiveObject(region);
    controller.update(duration);
    const arrivalPosition = camera.position.clone();
    const arrivalTarget = controller.target.clone();
    controller.applyInteractiveFilm(0);
    assert.ok(camera.position.distanceTo(arrivalPosition) < 1e-5, `${name} position jumps`);
    assert.ok(controller.target.distanceTo(arrivalTarget) < 1e-5, `${name} target jumps`);
  }
});

test('cooler approach begins at the current camera and settles close above the machinery', () => {
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 1000);
  camera.position.set(1, 4, 21);
  const controller = new CinematicCameraController(camera, {});
  controller.state = EXPERIENCE_STATES.ECHO_ORBIT;
  controller.target.set(0, 2, 0);
  const region = {
    name: 'Cooler', center: new THREE.Vector3(0, 2, 0),
    bounds: new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 5, 3)),
    size: new THREE.Vector3(6, 5, 6), radius: 4,
  };
  const duration = controller.focusInteractiveObject(region);
  assert.deepEqual(controller.transition.fromPosition.toArray(), [1, 4, 21]);
  assert.ok(controller.transition.destination.distanceTo(region.center) < 15);
  assert.ok(controller.transition.destination.y > region.bounds.max.y);
  assert.ok(duration >= 2.1);
});

test('ritual portraits glide between faces without a one-frame camera teleport', () => {
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 1000);
  camera.position.set(0, 5, 18);
  const controller = new CinematicCameraController(camera, {});
  controller.echoCenter.set(0, 1, 0);
  controller.target.set(0, 1, 0);
  controller.state = EXPERIENCE_STATES.ECHO_ORBIT;
  const entities = Array.from({ length: 6 }, (_, index) => {
    const angle = index / 6 * Math.PI * 2;
    const position = new THREE.Vector3(Math.cos(angle) * 5, 0, Math.sin(angle) * 5);
    return {
      root: { position },
      getHeadWorldPosition(target) { return target.copy(position).add(new THREE.Vector3(0, 1.55, 0)); },
    };
  });
  assert.equal(controller.startEchoRitualSpin(entities), true);
  const frame = 1 / 60;
  let largestStep = 0;
  let previous = camera.position.clone();
  for (let index = 0; index < 260; index += 1) {
    controller.update(frame);
    largestStep = Math.max(largestStep, camera.position.distanceTo(previous));
    previous.copy(camera.position);
  }
  assert.ok(largestStep < 0.45, `ritual camera step was ${largestStep.toFixed(3)}`);
});
