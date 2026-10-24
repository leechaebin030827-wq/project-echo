import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { EXPERIENCE_STATES } from '../src/config.js';
import { ExperienceController } from '../src/app/ExperienceController.js';
import { PointerInteractionController } from '../src/interaction/PointerInteractionController.js';

test('Pacific hover uses the moving ECHO proxy instead of hidden land geometry', () => {
  const camera = new THREE.PerspectiveCamera(52, 1, .08, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -5);
  const echoTraveler = new THREE.Group();
  echoTraveler.position.set(0, 0, -5);
  echoTraveler.updateMatrixWorld(true);
  const context = {
    currentWorld: 'lightcable', worldTransitioning: false,
    cameraController: { state: EXPERIENCE_STATES.ECHO_ORBIT },
    lightCableWorld: { phase: 'cable', echoTraveler },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    camera,
    echoPointer: new THREE.Vector2(),
    echoRaycaster: new THREE.Raycaster(),
    echoHitSphere: new THREE.Sphere(new THREE.Vector3(), 1.2),
    echoHitPoint: new THREE.Vector3(),
  };
  assert.ok(Number.isFinite(ExperienceController.prototype.getEchoHitDistance.call(context, 50, 50)));
  assert.equal(ExperienceController.prototype.getEchoHitDistance.call(context, 5, 5), Infinity);
  context.lightCableWorld.phase = 'surface';
  assert.equal(ExperienceController.prototype.getEchoHitDistance.call(context, 50, 50), Infinity);
});

test('Pacific click selects ECHO without querying hidden land characters or props', () => {
  let selected = 0;
  const pointer = Object.create(PointerInteractionController.prototype);
  pointer.cameraController = { state: EXPERIENCE_STATES.ECHO_ORBIT };
  pointer.canvas = { hasPointerCapture: () => false };
  pointer.isEchoOnly = () => true;
  pointer.getEchoHitDistance = () => 4;
  pointer.picker = { pick: () => { throw new Error('hidden land picker used'); } };
  pointer.interactivePicker = { pick: () => { throw new Error('hidden prop picker used'); } };
  pointer.onEcho = () => { selected += 1; };
  const event = { button: 0, isPrimary: true, pointerId: 1, clientX: 50, clientY: 50 };
  pointer.handlePointerDown(event);
  pointer.handlePointerUp(event);
  assert.equal(selected, 1);
});

test('Pacific creature click takes priority over the nearby ECHO hit area', () => {
  let selected = null;
  const pointer = Object.create(PointerInteractionController.prototype);
  pointer.cameraController = { state: EXPERIENCE_STATES.ECHO_ORBIT };
  pointer.canvas = { hasPointerCapture: () => false };
  pointer.isEchoOnly = () => true;
  pointer.pickPacificCreature = () => ({ kind: 'plant', groupIndex: 0, index: 2 });
  pointer.getEchoHitDistance = () => 4;
  pointer.onPacificCreature = (creature) => { selected = creature; };
  pointer.onEcho = () => { throw new Error('ECHO selected instead of the plant'); };
  const event = { button: 0, isPrimary: true, pointerId: 2, clientX: 70, clientY: 40 };
  pointer.handlePointerDown(event);
  pointer.handlePointerUp(event);
  assert.deepEqual(selected, { kind: 'plant', groupIndex: 0, index: 2 });
});

test('Pacific data particle click takes priority over creatures and ECHO', () => {
  let opened = 0;
  const pointer = Object.create(PointerInteractionController.prototype);
  pointer.cameraController = { state: EXPERIENCE_STATES.ECHO_ORBIT };
  pointer.canvas = { hasPointerCapture: () => false };
  pointer.isEchoOnly = () => true;
  pointer.pickPacificParticle = () => ({ index: 3 });
  pointer.pickPacificCreature = () => { throw new Error('creature picker used'); };
  pointer.getEchoHitDistance = () => 4;
  pointer.onPacificParticle = () => { opened += 1; };
  pointer.onEcho = () => { throw new Error('ECHO selected instead of particle'); };
  const event = { button: 0, isPrimary: true, pointerId: 3, clientX: 80, clientY: 60 };
  pointer.handlePointerDown(event);
  pointer.handlePointerUp(event);
  assert.equal(opened, 1);
});

test('a hovered particle remains clickable while the camera finishes turning', () => {
  const context = {
    currentWorld: 'lightcable',
    lightCableWorld: {
      creatureView: null,
      dataParticles: { pick: () => { throw new Error('moving position used'); } },
    },
    pacificHoveredParticle: { index: 7, x: 120, y: 180, at: performance.now() },
  };
  assert.deepEqual(ExperienceController.prototype.pickPacificParticle.call(context, 130, 180),
    { index: 7 });
});
