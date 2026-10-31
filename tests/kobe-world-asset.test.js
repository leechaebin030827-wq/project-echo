import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { EXPERIENCE_STATES, KOBE_CONFIG } from '../src/config.js';
import { ExperienceController } from '../src/app/ExperienceController.js';
import {
  KOBE_TUNNEL_NARRATION,
  KOBE_TUNNEL_ENTRY_CAPTION_CLEAR_MS,
  KOBE_TUNNEL_NARRATION_CLEAR_MS,
} from '../src/content/WorldNarration.js';
import { CinematicCameraController } from '../src/camera/CinematicCameraController.js';
import { PointerInteractionController } from '../src/interaction/PointerInteractionController.js';
import { sampleKobeConveyorDisplacement } from '../src/world/kobe/KobeMaterialSystem.js';
import {
  KobeWorld, sampleKobeArrivalLight, sampleKobeEchoCycle, sampleKobeTunnelExit, sampleKobeTunnelPanic,
} from '../src/world/kobe/KobeWorld.js';
import { paddedPosterCrop } from '../src/world/kobe/KobeArchivePosters.js';

const MODEL_PATH = new URL('../public/models/Kobe.runtime.glb', import.meta.url);

function readGlbJson(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
}

test('Kobe runtime world keeps its authored axis, conveyor, tunnel, and lights', () => {
  const gltf = readGlbJson(MODEL_PATH);
  const names = new Set(gltf.nodes.map((node) => node.name));
  assert.ok(names.has('Project Echo'));
  assert.ok(names.has('Tunnel Wall'));
  assert.ok(names.has('conveyer'));
  assert.ok([...names].filter((name) => /^light(?:\.|$)/i.test(name)).length >= 24);

  const triangleCount = gltf.meshes.reduce((total, mesh) => total + mesh.primitives.reduce(
    (meshTotal, primitive) => meshTotal + gltf.accessors[primitive.indices].count / 3, 0,
  ), 0);
  assert.ok(triangleCount < 1_000_000, `Kobe runtime mesh is too dense: ${triangleCount}`);
});

test('Kobe poster atlas crops keep a safe paper-edge margin inside the atlas', () => {
  assert.deepEqual(paddedPosterCrop([20, 15, 585, 450]), [11, 6, 603, 468]);
  assert.deepEqual(paddedPosterCrop([1220, 755, 300, 240]), [1211, 746, 318, 258]);
  assert.deepEqual(paddedPosterCrop([0, 0, 40, 40]), [0, 0, 49, 49]);
});

test('Kobe ECHO is pushed back a short distance, then jogs to its axis', () => {
  const anchor = -3.6;
  const far = anchor - KOBE_CONFIG.echoTravelDistance;
  const pushDuration = Math.abs(far - anchor) / KOBE_CONFIG.conveyorWorldSpeed;
  const pushEnd = 1.2 + pushDuration;
  const returnStart = pushEnd + 0.35;
  assert.equal(sampleKobeEchoCycle(0, anchor, far).x, anchor);
  assert.ok(sampleKobeEchoCycle(1.2 + pushDuration / 2, anchor, far).x < anchor);
  assert.deepEqual(sampleKobeEchoCycle(pushEnd + 0.15, anchor, far), {
    x: far, walking: false,
  });
  const joggingBack = sampleKobeEchoCycle(returnStart + 1.5, anchor, far);
  assert.equal(joggingBack.walking, true);
  assert.ok(joggingBack.x > far && joggingBack.x < anchor);
  assert.deepEqual(sampleKobeEchoCycle(returnStart + 3.2, anchor, far), {
    x: anchor, walking: false,
  });
});

test('Kobe tunnel panic and camera chase run only as a separate triggered sequence', () => {
  const anchor = -3.6;
  const start = anchor - 1.2;
  const deep = anchor - KOBE_CONFIG.tunnelPanicDistance;
  assert.ok(KOBE_CONFIG.tunnelPanicDistance
    >= KOBE_CONFIG.tunnelInteractionDistance + 5);
  const rushingIn = sampleKobeTunnelPanic(1.2, start, anchor, deep);
  assert.equal(rushingIn.walking, true);
  assert.equal(rushingIn.hidden, false);
  assert.ok(rushingIn.x < start);
  assert.ok(rushingIn.cameraFollow > 0);
  const startled = sampleKobeTunnelPanic(3.2, start, anchor, deep);
  assert.equal(startled.walking, false);
  assert.equal(startled.x, deep);
  assert.equal(startled.hidden, true);
  assert.equal(startled.cameraFollow, KOBE_CONFIG.tunnelCameraFollowDistance);
  const rushingOut = sampleKobeTunnelPanic(6.4, start, anchor, deep);
  assert.equal(rushingOut.walking, true);
  assert.equal(rushingOut.hidden, false);
  assert.ok(rushingOut.x > deep && rushingOut.x < anchor);
  assert.deepEqual(sampleKobeTunnelPanic(8.9, start, anchor, deep), {
    x: anchor, walking: false, cameraFollow: 0, hidden: false, complete: true,
  });
});

test('Kobe arrival lights pulse before settling fully on', () => {
  assert.equal(sampleKobeArrivalLight(0), 0);
  assert.ok(sampleKobeArrivalLight(.35) > 0);
  assert.equal(sampleKobeArrivalLight(.5), 0);
  assert.ok(sampleKobeArrivalLight(1.5) > .8);
  assert.equal(sampleKobeArrivalLight(2.4), 1);
});

test('Kobe world exit accelerates ECHO and the camera deep into the tunnel', () => {
  const start = -4;
  const deep = start - KOBE_CONFIG.tunnelExitDistance;
  const early = sampleKobeTunnelExit(.8, start, deep, KOBE_CONFIG.tunnelExitDuration);
  const late = sampleKobeTunnelExit(3.8, start, deep, KOBE_CONFIG.tunnelExitDuration);
  const complete = sampleKobeTunnelExit(4.2, start, deep, KOBE_CONFIG.tunnelExitDuration);
  assert.ok(early.x < start && early.x > deep);
  assert.ok(late.x < early.x);
  assert.ok(late.cameraFollow > early.cameraFollow);
  assert.ok(late.scale < early.scale);
  assert.ok(late.fov > early.fov);
  assert.equal(complete.x, deep);
  assert.equal(complete.hidden, true);
  assert.equal(complete.complete, true);
});

test('Kobe tunnel narration starts before entry and resumes after ECHO returns', () => {
  assert.equal(KOBE_TUNNEL_NARRATION[0].atMs, 0);
  assert.ok(KOBE_TUNNEL_ENTRY_CAPTION_CLEAR_MS >= 2600);
  assert.ok(KOBE_TUNNEL_NARRATION[1].atMs >= 8800);
  assert.ok(KOBE_TUNNEL_NARRATION_CLEAR_MS
    > KOBE_TUNNEL_NARRATION.at(-1).atMs);
  for (const cue of KOBE_TUNNEL_NARRATION) {
    assert.ok(cue.korean.length > 0);
    assert.ok(cue.local.length > 0);
  }
});

test('Kobe conveyor runs away from the camera at the same speed as pushed ECHO', () => {
  const anchor = -3.6;
  const far = anchor - KOBE_CONFIG.echoTravelDistance;
  const echoStart = sampleKobeEchoCycle(1.2, anchor, far).x;
  const echoAfterOneSecond = sampleKobeEchoCycle(2.2, anchor, far).x;
  const echoDisplacement = echoAfterOneSecond - echoStart;
  const conveyorDisplacement = sampleKobeConveyorDisplacement(1);

  assert.ok(conveyorDisplacement < 0);
  assert.ok(Math.abs(echoDisplacement - conveyorDisplacement) < 1e-9);
});

test('Kobe inner tunnel hover changes no mesh and gently zooms the camera', () => {
  const world = Object.create(KobeWorld.prototype);
  world.root = new THREE.Group();
  world.echoTunnelX = -12;
  world.interactiveRegions = [];
  world.setupTunnelInteraction();
  const region = world.interactiveRegions[0];
  assert.deepEqual(region.meshes, []);
  assert.ok(region.pickBounds);

  const camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.1, 100);
  const controller = new CinematicCameraController(camera, {});
  controller.kobeFixedCamera = true;
  controller.kobeCameraPosition = new THREE.Vector3(4, 2, 0);
  controller.kobeCameraTarget = new THREE.Vector3(0, 1, 0);
  controller.world = { cameraFollowOffset: 0 };
  controller.state = EXPERIENCE_STATES.ECHO_ORBIT;
  controller.hoverTarget = region;
  for (let frame = 0; frame < 30; frame += 1) controller.update(1 / 60);
  assert.ok(camera.zoom > 1.15);

});

test('Kobe wall and inner-tunnel interactions take click priority over ECHO', () => {
  let selected = null;
  const poster = { name: 'Tunnel Archive 01', cameraMode: 'kobe-poster' };
  const pointer = Object.create(PointerInteractionController.prototype);
  pointer.cameraController = { state: EXPERIENCE_STATES.ECHO_ORBIT };
  pointer.canvas = { hasPointerCapture: () => false, setPointerCapture() {} };
  pointer.isEchoOnly = () => false;
  pointer.pickArchivePhoto = () => null;
  pointer.interactivePicker = { pick: () => poster, lastHitDistance: 8 };
  pointer.picker = { pick: () => null, lastHitDistance: Infinity };
  pointer.getEchoHitDistance = () => 2;
  pointer.onInteractiveObject = (region) => { selected = region; };
  pointer.onEcho = () => { throw new Error('ECHO selected instead of the wall poster'); };
  const event = { button: 0, isPrimary: true, pointerId: 9, clientX: 50, clientY: 50 };
  pointer.handlePointerDown(event);
  pointer.handlePointerUp(event);
  assert.equal(selected, poster);

  const tunnel = { name: 'Inner Tunnel', cameraMode: 'kobe-tunnel' };
  selected = null;
  pointer.interactivePicker.pick = () => tunnel;
  pointer.picker.pick = () => ({ id: 'A01' });
  pointer.picker.lastHitDistance = 1;
  pointer.onCharacter = () => { throw new Error('character selected instead of inner tunnel'); };
  pointer.handlePointerDown({ ...event, pointerId: 10 });
  pointer.handlePointerUp({ ...event, pointerId: 10 });
  assert.equal(selected, tunnel);
});

test('Kobe ECHO can only hover during the closest part of its conveyor cycle', () => {
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  camera.position.set(KOBE_CONFIG.cameraDistanceFromAxis, 0.56, 0);
  camera.lookAt(0, 0, 0);
  const echo = new THREE.Group();
  const echoAnchor = new THREE.Vector3();
  const context = {
    currentWorld: 'kobe',
    worldTransitioning: false,
    cameraController: { state: EXPERIENCE_STATES.ECHO_ORBIT },
    world: {
      echo,
      echoAnchor,
      echoBox: new THREE.Box3(
        new THREE.Vector3(-0.8, -0.8, -0.8),
        new THREE.Vector3(0.8, 0.8, 0.8),
      ),
    },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    camera,
    echoPointer: new THREE.Vector2(),
    echoRaycaster: new THREE.Raycaster(),
    echoHitBox: new THREE.Box3(),
    echoHitPoint: new THREE.Vector3(),
    echoHitCenter: new THREE.Vector3(),
    echoHitSize: new THREE.Vector3(),
    echoHitOffset: new THREE.Vector3(),
  };
  const getDistance = ExperienceController.prototype.getEchoHitDistance.bind(context);

  assert.ok(Number.isFinite(getDistance(50, 50)));
  echo.position.x = -1.1;
  assert.equal(getDistance(50, 50), Infinity);
});
