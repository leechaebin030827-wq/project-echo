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
