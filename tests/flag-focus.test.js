import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CinematicCameraController } from '../src/camera/CinematicCameraController.js';
import { EXPERIENCE_STATES } from '../src/config.js';

const focusPose = (name) => {
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 500);
  camera.position.set(0, 15, 14);
  const controller = new CinematicCameraController(camera, {});
  controller.target.set(0, 4, 0);
  const bounds = new THREE.Box3(
    new THREE.Vector3(16.5, 1.6, -3.2),
    new THREE.Vector3(19.5, 8, -0.4),
  );
  const region = {
    name,
    bounds,
    center: bounds.getCenter(new THREE.Vector3()),
    size: bounds.getSize(new THREE.Vector3()),
    radius: 3.6,
  };
  if (name === 'Flag' || name === 'Finland') {
    region.cameraMode = 'flag';
    region.focusTarget = region.center.clone();
    region.focusTarget.y = bounds.max.y - region.size.y * 0.22;
  }
  controller.focusInteractiveObject(region);
  return { region, transition: controller.transition };
};

test('flag focus rises slightly while keeping the flag below the aim point', () => {
  const flag = focusPose('Flag');
  const previousHeight = Math.max(flag.region.bounds.min.y + 1.8,
    flag.region.focusTarget.y - Math.max(2.8, flag.region.size.y * 0.42));
  assert.ok(flag.transition.destination.y > previousHeight + 1);
  assert.ok(flag.transition.destination.y < flag.region.focusTarget.y);
  assert.ok(flag.transition.destinationTarget.distanceTo(flag.region.focusTarget) < 1e-6);
});

for (const name of ['Flag', 'Finland']) test(`${name} retreats and scans left, right, then left again`, () => {
  const { region } = focusPose(name);
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 500);
  camera.position.set(23, 7, 6);
  camera.lookAt(region.focusTarget);
  const controller = new CinematicCameraController(camera, {});
  controller.target.copy(region.focusTarget);
  controller.interactiveFocus = region;
  controller.transition = null;
  controller.setState(EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS);
  controller.interactiveFilm = { region, elapsed: 0 };
  const startingPosition = camera.position.clone();
  const startingRotation = camera.quaternion.clone();

  controller.worldSize.set(75, 14, 58);
  controller.startFlagWorldSweep([new THREE.Vector3(0, 4, 0)]);
  controller.applyInteractiveFilm(0);
  assert.ok(camera.position.distanceTo(startingPosition) < 1e-6);
  assert.ok(camera.quaternion.angleTo(startingRotation) < 1e-6);

  controller.interactiveFilm.elapsed = 0.75;
  controller.applyInteractiveFilm(0);
  const midpoint = camera.position.clone();
  assert.ok(midpoint.distanceTo(startingPosition) > 1);
  assert.ok(controller.target.distanceTo(region.focusTarget) > 1);

  controller.interactiveFilm.elapsed = 1.5;
  controller.applyInteractiveFilm(0);
  const leftPosition = camera.position.clone();
  const leftTarget = controller.target.clone();
  assert.ok(leftPosition.distanceTo(startingPosition) > 4);
  assert.ok(leftPosition.distanceTo(startingPosition) > midpoint.distanceTo(startingPosition));
  controller.interactiveFilm.elapsed = 4.7;
  controller.applyInteractiveFilm(0);
  assert.ok(camera.position.distanceTo(leftPosition) > 1);
  const rightPosition = camera.position.clone();
  const rightTarget = controller.target.clone();
  controller.interactiveFilm.elapsed = 7.9;
  controller.applyInteractiveFilm(0);
  assert.ok(controller.target.distanceTo(leftTarget) < 1e-6);
  assert.ok(camera.position.distanceTo(leftPosition) < 1e-6);
  controller.interactiveFilm.elapsed = 11.1;
  controller.applyInteractiveFilm(0);
  assert.ok(controller.target.distanceTo(rightTarget) < 1e-6);
  assert.ok(camera.position.distanceTo(rightPosition) < 1e-6);
  assert.ok(camera.quaternion.angleTo(startingRotation) > 0.3);
});
