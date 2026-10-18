import assert from 'node:assert/strict';
import test from 'node:test';
import { ExperienceController } from '../src/app/ExperienceController.js';

function createPhotoRoute(captureResult) {
  const calls = [];
  const stage = {
    dataset: { devShortcut: 'camera' },
    classList: { add: (name) => calls.push(`stage:${name}`) },
  };
  const route = {
    developerCaptureActive: true,
    worldRenderingEnabled: false,
    stage,
    ui: {
      setBusy: (busy) => calls.push(`busy:${busy}`),
      showLoading: (show) => calls.push(`loading:${show}`),
      leave: () => calls.push('leave'),
    },
    face: {
      webcam: { stream: {} },
      capture: async () => captureResult,
      status: (message) => calls.push(`status:${message}`),
      applyToCharacters: async () => calls.push('apply-face'),
      stop: () => calls.push('stop-camera'),
    },
    readyPromise: Promise.resolve(),
    characterManager: { entities: [] },
    showWorldEntryOverlay: () => calls.push('entry-overlay'),
    cameraController: { startIntro: () => calls.push('world-camera') },
    world: {
      echo: {},
      applyVisitorFaceToBillboard: () => calls.push('billboard-face'),
    },
    scheduleFaceQaTargetFocus: () => {},
    onDeveloperWorldEntered: () => calls.push('entry-audio'),
  };
  return { route, calls };
}

test('developer photo capture applies the captured face before entering the world', async () => {
  const { route, calls } = createPhotoRoute({ frame: {} });
  await ExperienceController.prototype.handleDeveloperCapture.call(route);

  assert.equal(route.stage.dataset.devShortcut, 'photo');
  assert.equal(route.worldRenderingEnabled, true);
  assert.equal(route.developerCaptureActive, false);
  assert.ok(calls.indexOf('apply-face') < calls.indexOf('world-camera'));
  assert.ok(calls.indexOf('apply-face') < calls.indexOf('billboard-face'));
  assert.ok(calls.indexOf('billboard-face') < calls.indexOf('world-camera'));
  assert.ok(calls.includes('stop-camera'));
  assert.ok(calls.includes('entry-audio'));
});

test('developer photo capture does not enter the world without a valid frame', async () => {
  const { route, calls } = createPhotoRoute(null);
  await ExperienceController.prototype.handleDeveloperCapture.call(route);

  assert.equal(route.stage.dataset.devShortcut, 'camera');
  assert.equal(route.worldRenderingEnabled, false);
  assert.equal(route.developerCaptureActive, true);
  assert.ok(!calls.includes('apply-face'));
  assert.ok(calls.includes('busy:false'));
});
