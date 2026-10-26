import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { KOBE_CONFIG } from '../src/config.js';
import { sampleKobeConveyorDisplacement } from '../src/world/kobe/KobeMaterialSystem.js';
import { sampleKobeEchoCycle } from '../src/world/kobe/KobeWorld.js';

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

test('Kobe ECHO is pushed away, walks back, and rests on its authored axis', () => {
  const anchor = -3.6;
  const far = -12;
  const pushDuration = Math.abs(far - anchor) / KOBE_CONFIG.conveyorWorldSpeed;
  const pushEnd = 1.2 + pushDuration;
  const returnStart = pushEnd + 0.9;
  assert.equal(sampleKobeEchoCycle(0, anchor, far).x, anchor);
  assert.ok(sampleKobeEchoCycle(1.2 + pushDuration / 2, anchor, far).x < anchor);
  assert.deepEqual(sampleKobeEchoCycle(pushEnd + 0.45, anchor, far), { x: far, walking: false });
  const returning = sampleKobeEchoCycle(returnStart + 3.25, anchor, far);
  assert.equal(returning.walking, true);
  assert.ok(returning.x > far && returning.x < anchor);
  assert.deepEqual(sampleKobeEchoCycle(returnStart + 6.6, anchor, far), { x: anchor, walking: false });
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
