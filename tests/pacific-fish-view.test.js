import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  computeFishViewPose, getSurfaceEchoMotion, LightCableWorld,
} from '../src/world/pacific/LightCableWorld.js';

test('fish viewpoint stays outside the subject and keeps an unobstructed gaze on ECHO', () => {
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
  const view = target.clone().sub(position);
  const centerOffset = center.clone().sub(position);
  const alongRay = centerOffset.dot(view) / view.lengthSq();
  const closestOnRay = position.clone().addScaledVector(view, alongRay);
  const clearance = center.distanceTo(closestOnRay);
  assert.ok(clearance > pose.radius * 1.2, 'selected fish should clear the camera-to-ECHO sightline');
  assert.ok(target.equals(cableTarget), 'camera should keep its gaze on the advancing ECHO');
});

test('surface ECHO accelerates into the water and eases into swimming', () => {
  const early = getSurfaceEchoMotion(1);
  const late = getSurfaceEchoMotion(3);
  const impact = getSurfaceEchoMotion(3.7);
  const justUnder = getSurfaceEchoMotion(3.72);
  const swimming = getSurfaceEchoMotion(5.1);
  assert.ok(early.height > late.height && late.height > impact.height);
  assert.ok(justUnder.height < impact.height, 'ECHO should keep moving through the surface');
  assert.equal(impact.swimBlend, 0);
  assert.ok(swimming.swimBlend > .9);
  assert.ok(swimming.pitch > impact.pitch, 'ECHO should level out while sinking');
});

test('fish hover proxy keeps following the same moving fish after a view click', () => {
  const world = Object.create(LightCableWorld.prototype);
  world.pickMatrix = new THREE.Matrix4();
  const matrices = [new THREE.Matrix4().makeTranslation(1, 2, 3)];
  const instances = {
    getMatrixAt(index, target) { target.copy(matrices[index]); },
  };
  const hoverMatrix = new THREE.Matrix4();
  const hoverMesh = {
    visible: false,
    instanceMatrix: { needsUpdate: false },
    setMatrixAt(index, matrix) { hoverMatrix.copy(matrix); },
  };
  world.fish = [{ instances, hoverMesh }];
  world.hoveredCreature = null;
  world.creatureHoverMesh = null;
  const fish = { kind: 'fish', groupIndex: 0, index: 0 };
  world.setCreatureHover(fish);
  assert.equal(hoverMatrix.elements[12], 1);
  matrices[0].makeTranslation(7, 2, 3);
  hoverMesh.instanceMatrix.needsUpdate = false;
  world.setCreatureHover(fish);
  assert.equal(hoverMatrix.elements[12], 7);
  assert.equal(hoverMesh.visible, true);
  assert.equal(hoverMesh.instanceMatrix.needsUpdate, true);
});
