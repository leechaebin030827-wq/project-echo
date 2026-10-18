import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CinematicCameraController } from '../src/camera/CinematicCameraController.js';

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
  controller.focusInteractiveObject(region);
  return { region, transition: controller.transition };
};

test('flag focus raises the camera and aims at the flag mesh center', () => {
  const flag = focusPose('Flag');
  const regular = focusPose('Billboard');
  assert.ok(flag.transition.destination.y > regular.transition.destination.y + 2);
  assert.ok(flag.transition.destinationTarget.distanceTo(flag.region.center) < 1e-6);
});
