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
  if (name === 'Flag') {
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
