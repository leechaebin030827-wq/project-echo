import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { computeFishViewPose } from '../src/world/pacific/LightCableWorld.js';

test('fish viewpoint stays in front of the model and can keep looking at the cable', () => {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(3, -4, 8),
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0),
    ),
    new THREE.Vector3(2, 2, 2),
  );
  const sphere = new THREE.Sphere(new THREE.Vector3(), 0.5);
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  const cableTarget = new THREE.Vector3(12, -5, 1);

  const pose = computeFishViewPose(matrix, sphere, position, target, cableTarget);

  const center = sphere.center.clone().applyMatrix4(matrix);
  assert.ok(position.x > center.x + pose.radius, 'camera should clear the fish head');
  assert.ok(target.equals(cableTarget), 'camera should keep its gaze on the cable');
});
