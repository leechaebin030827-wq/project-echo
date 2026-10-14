import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GroupDanceDirector, findNearbyDanceMembers } from '../src/characters/GroupDanceDirector.js';
import { CharacterBehavior, NevadaRoamingBehavior } from '../src/characters/CharacterBehavior.js';
import { CinematicCameraController } from '../src/camera/CinematicCameraController.js';
import { CharacterPicker } from '../src/interaction/CharacterPicker.js';
import { EXPERIENCE_STATES } from '../src/config.js';

const character = (id, x, z) => ({
  id,
  root: { position: new THREE.Vector3(x, 0, z), rotation: { y: 0 } },
  height: 1.7,
  behavior: { state: 'walk' },
  focused: false,
  lookingUp: false,
  danceGroup: null,
  played: [],
  play(name) { this.played.push(name); },
});

test('dance requires a compact group of at least three, not a loose chain', () => {
  const compact = [character('A', 0, 0), character('B', 3, 0), character('C', 1.5, 2.5)];
  assert.deepEqual(findNearbyDanceMembers(compact), compact);
  const chain = [character('A', 0, 0), character('B', 4, 0), character('C', 8, 0)];
  assert.equal(findNearbyDanceMembers(chain), null);
});

test('nearby walkers dance together, then resume walking with a cooldown', () => {
  const members = [character('A', 0, 0), character('B', 3, 0), character('C', 1.5, 2.5)];
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 100);
  camera.position.set(0, 5, 12);
  const director = new GroupDanceDirector(camera);
  director.update(0.65, members);
  assert.equal(director.groups.length, 0);
  director.update(0.65, members);
  assert.equal(director.groups.length, 1);
  assert.ok(members.every((member) => member.danceGroup && member.played.at(-1) === 'dance'));
  director.update(13.1, members);
  assert.equal(director.groups.length, 0);
  assert.ok(members.every((member) => !member.danceGroup && member.played.at(-1) === 'walk'));
  director.update(1.3, members);
  assert.equal(director.groups.length, 0);
});

test('dance partners gather in a circle, face inward, then return to their own routes', () => {
  const members = [character('A', -2, 0), character('B', 0, 0), character('C', 2, 0)];
  const anchors = members.map((member) => member.root.position.clone());
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  const director = new GroupDanceDirector(camera);
  const group = director.start(members);
  director.update(2, members);
  for (const member of members) {
    assert.ok(member.root.position.distanceTo(group.center) > 1.5);
    const expected = Math.atan2(group.center.x - member.root.position.x,
      group.center.z - member.root.position.z);
    assert.ok(Math.abs(member.root.rotation.y - expected) < 0.01);
  }
  director.update(11.1, members);
  assert.equal(director.groups.length, 0);
  for (let index = 0; index < members.length; index += 1) {
    assert.ok(members[index].root.position.distanceTo(anchors[index]) < 0.001);
    assert.equal(members[index].played.at(-1), 'walk');
  }
});

test('both walking behaviors yield before stepping into another character', () => {
  const route = { length: 10 };
  const navigation = {
    getRoute: () => route,
    sampleRoute: (_route, distance, target) => target.set(distance, 0, 0),
  };
  const makeWalker = () => ({
    root: { position: new THREE.Vector3(), rotation: { y: 0 } },
    play() {},
  });
  const blocker = makeWalker();
  blocker.root.position.x = 1;
  const standard = makeWalker();
  const standardBehavior = new CharacterBehavior(standard, navigation, 0, () => 0.5);
  standardBehavior.distance = 0;
  standardBehavior.current.set(0, 0, 0);
  standard.root.position.set(0, 0, 0);
  standardBehavior.state = 'walk';
  standardBehavior.update(0.1, [standard, blocker]);
  assert.equal(standard.root.position.x, 0);
  assert.equal(standardBehavior.directionSign, -1);
  standardBehavior.state = 'walk';
  standardBehavior.update(0.1, [standard, blocker]);
  assert.ok(standard.root.position.x < 0);

  const roaming = makeWalker();
  const roamingBehavior = new NevadaRoamingBehavior(roaming, navigation, 0, () => 0.8);
  roamingBehavior.setStartDistance(0);
  roamingBehavior.state = 'walk';
  roamingBehavior.directionSign = 1;
  roamingBehavior.update(0.1, [roaming, blocker]);
  assert.equal(roaming.root.position.x, 0);
  assert.equal(roamingBehavior.directionSign, -1);
  roamingBehavior.state = 'walk';
  roamingBehavior.update(0.1, [roaming, blocker]);
  assert.ok(roaming.root.position.x < 0);
});

test('group camera moves smoothly between close face shots', () => {
  const members = [character('A', -2, 0), character('B', 0, 1), character('C', 2, 0)];
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 100);
  camera.position.set(0, 7, 14);
  camera.lookAt(0, 0, 0);
  const director = new GroupDanceDirector(camera);
  const group = director.start(members);
  director.view(group);
  director.update(2, members);
  const controller = new CinematicCameraController(camera, {});
  controller.target.set(0, 0, 0);
  controller.focusDanceGroup(group, members[0]);
  for (let step = 0; step < 60; step += 1) controller.update(0.05);
  assert.equal(controller.state, EXPERIENCE_STATES.GROUP_DANCE_FOCUS);
  assert.equal(controller.danceGroup, group);
  assert.equal(controller.danceHeroIndex, 0);
  const firstPosition = camera.position.clone();
  assert.ok(firstPosition.distanceTo(members[0].root.position) > 4);
  assert.ok(firstPosition.distanceTo(members[0].root.position) < 7);
  for (let step = 0; step < 55; step += 1) controller.update(0.05);
  assert.equal(controller.danceHeroIndex, 1);
  assert.ok(camera.position.distanceTo(firstPosition) > 0.1);
  assert.ok(camera.position.distanceTo(members[1].root.position) > 4);
  assert.ok(camera.position.distanceTo(members[1].root.position) < 7);
  const face = members[1].root.position.clone()
    .add(new THREE.Vector3(0, members[1].height * 0.78, 0)).project(camera);
  assert.ok(Math.abs(face.x) < 0.35 && face.y > 0.08 && face.y < 0.5);
  for (let step = 0; step < 44; step += 1) controller.update(0.05);
  assert.equal(controller.danceHeroIndex, 2);
  for (let step = 0; step < 44; step += 1) controller.update(0.05);
  assert.equal(controller.danceHeroIndex, -1);
  for (let step = 0; step < 20; step += 1) controller.update(0.05);
  assert.equal(controller.danceHeroIndex, -1);
  assert.ok(camera.position.distanceTo(group.center) > 5);
  for (let step = 0; step < 90; step += 1) controller.update(0.05);
  assert.equal(controller.danceSequenceComplete, true);
  assert.equal(controller.danceHeroIndex, -1);
  assert.equal(controller.danceShotStep, group.members.length);
  director.update(20, members);
  assert.equal(director.groups.length, 1);
  director.release(group);
  director.update(4.1, members);
  assert.equal(director.groups.length, 0);
});

test('wide dance circles use a distance that fits the group', () => {
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 100);
  const controller = new CinematicCameraController(camera, {});
  controller.danceViewDirection.set(0, 0, 1);
  const group = {
    center: new THREE.Vector3(), height: 1.7, radius: 3.7, focusRadius: 2.8,
  };
  const pose = controller.getDanceGroupPose(group);
  assert.ok(pose.position.z >= 6.4 && pose.position.z <= 13.5);
  assert.ok(pose.position.y >= 1.5 && pose.position.y <= 1.7);
});

test('a four-person circle gives the selected dancer a centered close shot', () => {
  const members = [character('A', -2, 0), character('B', 0, 2),
    character('C', 2, 0), character('D', 0, -2)];
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 100);
  camera.position.set(0, 5, 12);
  const director = new GroupDanceDirector(camera);
  const group = director.start(members);
  assert.ok(group.targets.every((point) => Math.hypot(
    point.x - group.center.x, point.z - group.center.z,
  ) < 1.7));
  const controller = new CinematicCameraController(camera, {});
  controller.focusDanceGroup(group, members[0]);
  const pose = controller.getDanceGroupPose(group);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  const face = members[0].root.position.clone().add(new THREE.Vector3(0, group.height * 0.78, 0))
    .project(camera);
  assert.ok(pose.position.distanceTo(group.targets[0]) > 4);
  assert.ok(pose.position.distanceTo(group.targets[0]) < 7);
  assert.ok(Math.abs(face.x) < 0.15 && face.y > 0.08 && face.y < 0.5);
});

test('dance portrait camera stays on the actual front of the face', () => {
  const member = character('A', 2, 0);
  member.getHeadWorldPosition = (target) => target.set(2, 1.45, 0);
  member.getFaceSurfaceDirection = (target) => target.set(0, 0, -1);
  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 100);
  camera.position.set(0, 5, 12);
  const controller = new CinematicCameraController(camera, {});
  controller.danceViewDirection.set(0, 0, 1);
  controller.danceHeroIndex = 0;
  const pose = controller.getDanceGroupPose({
    center: new THREE.Vector3(), members: [member], height: 1.7,
  });
  const towardCamera = pose.position.clone().sub(pose.target).setY(0).normalize();
  assert.ok(towardCamera.dot(new THREE.Vector3(0, 0, -1)) > 0.99);
  assert.ok(pose.position.distanceTo(pose.target) > 2.3);
});

test('the gathering can be selected between dancers from the orbit view', () => {
  const members = [character('A', -1.8, 0), character('B', 0, 0), character('C', 1.8, 0)];
  for (const member of members) {
    const root = new THREE.Group();
    root.position.copy(member.root.position);
    member.root = root;
  }
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 1, 0);
  const director = new GroupDanceDirector(camera);
  director.start(members);
  const picker = new CharacterPicker(
    { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) },
    camera,
    { entities: members, pickTargets: [], danceDirector: director, byId: new Map() },
  );
  assert.ok(members.includes(picker.pick(100, 100, false)));
  assert.ok(Number.isFinite(picker.lastHitDistance));
  assert.equal(picker.pick(195, 100, false), null);
});
