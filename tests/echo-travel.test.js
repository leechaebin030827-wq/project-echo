import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { EchoTravelAnimator, getEchoLaunchPose } from '../src/world/EchoTravelAnimator.js';
import { CinematicCameraController } from '../src/camera/CinematicCameraController.js';
import { EXPERIENCE_STATES } from '../src/config.js';

test('ECHO lowers into a planted pose, extends on takeoff, then folds during ascent', () => {
  const height = 80;
  const start = getEchoLaunchPose(0, height);
  assert.deepEqual(start, { lift: 0, crouch: 1, tuck: 0, groundContact: 1 });
  const initial = getEchoLaunchPose(0.02, height);
  assert.equal(initial.lift, 0);
  assert.ok(initial.crouch > 0.9);
  assert.equal(initial.tuck, 0);
  assert.equal(initial.groundContact, 1);
  const pushOff = getEchoLaunchPose(0.1, height);
  assert.ok(pushOff.lift > initial.lift);
  assert.ok(pushOff.lift < 3);
  assert.ok(pushOff.crouch < initial.crouch);
  assert.equal(pushOff.groundContact, 1);
  assert.equal(pushOff.tuck, 0);
  const rising = getEchoLaunchPose(0.28, height);
  assert.equal(rising.groundContact, 0);
  assert.ok(rising.lift > pushOff.lift);
  assert.equal(rising.crouch, 0);
  assert.equal(rising.tuck, 0);
  const airborne = getEchoLaunchPose(0.5, height);
  assert.ok(airborne.lift > pushOff.lift);
  assert.equal(airborne.groundContact, 0);
  assert.ok(airborne.tuck > rising.tuck && airborne.tuck < 1);
  assert.deepEqual(getEchoLaunchPose(1, height), {
    lift: height, crouch: 0, tuck: 1, groundContact: 0,
  });
});

test('the shipped ECHO rig crouches with planted feet and outward, downward knees', () => {
  const binary = readFileSync(new URL('../public/models/EchoMeshyRig.glb', import.meta.url));
  const jsonLength = binary.readUInt32LE(12);
  const { nodes: definitions } = JSON.parse(binary.subarray(20, 20 + jsonLength).toString());
  const nodes = definitions.map((definition) => {
    const bone = new THREE.Bone();
    bone.name = definition.name;
    bone.position.fromArray(definition.translation ?? [0, 0, 0]);
    bone.quaternion.fromArray(definition.rotation ?? [0, 0, 0, 1]);
    return bone;
  });
  definitions.forEach((definition, index) => {
    definition.children?.forEach((child) => nodes[index].add(nodes[child]));
  });
  const actor = nodes.find((node) => node.name === 'ECHO_Rig');
  const animator = new EchoTravelAnimator(new THREE.Scene(), { dataset: {} });
  animator.actor = actor;
  animator.body = nodes.find((node) => node.name === 'Body');
  animator.legs = [1, 2, 3, 4].map((index) => {
    const id = String(index).padStart(2, '0');
    const lower = nodes.find((node) => node.name === `Leg_${id}_Lower`);
    return {
      upper: nodes.find((node) => node.name === `Leg_${id}_Upper`),
      lower,
      foot: nodes.find((node) => node.name === `Leg_${id}_Foot`),
      lowerScale: lower.scale.clone(),
    };
  });
  animator.scene.add(actor);
  animator.captureGroundPose();
  animator.body.position.y -= 0.22;
  actor.updateMatrixWorld(true);
  for (const leg of animator.legs) {
    animator.solveGroundedLeg(leg, 1);
    actor.updateMatrixWorld(true);
    const hip = leg.upper.getWorldPosition(new THREE.Vector3());
    const knee = leg.lower.getWorldPosition(new THREE.Vector3());
    const foot = leg.foot.getWorldPosition(new THREE.Vector3());
    const outward = hip.clone().sub(actor.position).setY(0).normalize();
    assert.ok(foot.distanceTo(leg.groundFoot) < 0.001);
    assert.ok(knee.clone().sub(hip).setY(0).dot(outward) > 0.05);
    assert.ok(knee.y <= hip.y);
  }
});

test('the sky spin moves the camera in while holding ECHO at the same center', () => {
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 500);
  camera.position.set(18, 81, 0);
  const controller = new CinematicCameraController(camera, {});
  controller.echoSphere = { radius: 4 };
  controller.target.set(0, 80, 0);
  controller.holdWorldLoading();
  controller.startWorldSpinFocus(2.2);
  assert.equal(controller.state, EXPERIENCE_STATES.WORLD_LOADING);
  assert.ok(controller.transition.destination.distanceTo(controller.target) < 13);
  controller.transition.startedAt -= 2200;
  controller.update(0.016);
  assert.ok(camera.position.distanceTo(controller.target) < 13);
  assert.ok(controller.target.distanceTo(new THREE.Vector3(0, 80, 0)) < 0.001);
  assert.equal(controller.transition, null);
  const afterFocus = camera.position.clone();
  controller.update(0.5);
  assert.ok(camera.position.distanceTo(afterFocus) > 0.1);
  assert.ok(controller.target.distanceTo(new THREE.Vector3(0, 80, 0)) < 0.001);
});

test('the launch camera gradually shifts from looking down to looking up at ECHO', () => {
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 500);
  camera.position.set(5.5, 1.5, 0);
  const controller = new CinematicCameraController(camera, {});
  controller.echoCenter.set(0, 0, 0);
  controller.echoSize.set(4, 4, 4);
  controller.echoSphere = { radius: 4 };
  controller.target.set(0, 0, 0);
  controller.startWorldJumpAscent(4.2, 80);
  const pitch = () => Math.atan2(
    controller.target.y - camera.position.y,
    Math.hypot(controller.target.x - camera.position.x, controller.target.z - camera.position.z),
  );
  const startPitch = pitch();
  controller.transition.startedAt = performance.now() - 2100;
  controller.update(0);
  const halfwayPitch = pitch();
  controller.transition.startedAt = performance.now() - 4200;
  controller.update(0);
  const finalPitch = pitch();
  assert.ok(startPitch < 0);
  assert.ok(halfwayPitch > startPitch);
  assert.ok(finalPitch > halfwayPitch);
  assert.ok(finalPitch > THREE.MathUtils.degToRad(25));
  assert.ok(camera.position.y < controller.target.y);
});

test('after the ascent the camera returns to a near-frontal ECHO view', () => {
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 500);
  camera.position.set(18, 69, 0);
  const controller = new CinematicCameraController(camera, {});
  controller.echoSphere = { radius: 4 };
  controller.echoSize.set(4, 4, 4);
  controller.target.set(0, 80, 0);
  controller.holdWorldLoading();
  controller.startWorldSpinFocus(2.2);
  controller.transition.startedAt = performance.now() - 2200;
  controller.update(0);
  const pitch = Math.atan2(
    controller.target.y - camera.position.y,
    Math.hypot(controller.target.x - camera.position.x, controller.target.z - camera.position.z),
  );
  assert.ok(Math.abs(pitch) < THREE.MathUtils.degToRad(6));
});
