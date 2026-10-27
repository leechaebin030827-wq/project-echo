import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMemoryComposition, differenceHash, hashDistance, missingReturnWorlds, selectReturnFrames,
} from '../src/ui/ReturnFrameSelection.js';

test('return montage keeps one frame per person and per visually similar crop', () => {
  const zeros = '0'.repeat(64);
  const ones = '1'.repeat(64);
  const striped = '01'.repeat(32);
  const frames = [
    { id: 'A', score: 100, time: 1000, source: 'a', faceHash: zeros, sceneHash: zeros },
    { id: 'A', score: 90, time: 2000, source: 'a2', faceHash: ones, sceneHash: ones },
    { id: 'B', score: 80, time: 3000, source: 'b', faceHash: `${'1'.repeat(5)}${'0'.repeat(59)}`, sceneHash: ones },
    { id: 'C', score: 70, time: 4000, source: 'c', faceHash: striped, sceneHash: striped },
  ];
  assert.deepEqual(selectReturnFrames(frames, 10).map((frame) => frame.id), ['A', 'C']);
});

test('difference hash compares image structure and counts changed bits', () => {
  const data = new Uint8ClampedArray(9 * 8 * 4);
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) {
    const offset = (y * 9 + x) * 4;
    data.fill(x * 20, offset, offset + 3);
    data[offset + 3] = 255;
  }
  const hash = differenceHash({ data, width: 9, height: 8 });
  assert.equal(hash, '0'.repeat(64));
  assert.equal(hashDistance(hash, '1'.repeat(64)), 64);
});

test('return montage represents every visited world before repeating one world', () => {
  const hash = (offset) => `${'1'.repeat(offset)}${'0'.repeat(64 - offset)}`;
  const frames = [
    { id: 'n1', kind: 'portrait', world: 'nevada', score: 120, time: 1, source: 'n1', faceHash: hash(0), sceneHash: hash(0) },
    { id: 'n2', kind: 'world', world: 'nevada', score: 110, time: 2, source: 'n2', faceHash: null, sceneHash: hash(20) },
    { id: 'h1', kind: 'world', world: 'hamina', score: 50, time: 3, source: 'h1', faceHash: null, sceneHash: hash(0) },
    { id: 'p1', kind: 'world', world: 'lightcable', score: 45, time: 4, source: 'p1', faceHash: null, sceneHash: hash(0) },
  ];

  const selected = selectReturnFrames(frames, 3);

  assert.deepEqual(new Set(selected.map((frame) => frame.world)),
    new Set(['nevada', 'hamina', 'lightcable']));
});

test('return montage reports worlds that have no recorded frame', () => {
  const candidates = [
    { world: 'nevada', source: 'n' },
    { world: 'kobe', source: '' },
    { world: 'hamina', source: 'h' },
  ];
  assert.deepEqual(missingReturnWorlds(candidates), ['lightcable', 'kobe']);
});

test('memory compositions stay inside intentional camera bounds', () => {
  const values = [0, .99, .25, .75, .1, .9, .4, .6];
  let index = 0;
  const composition = createMemoryComposition('kobe', () => values[index++ % values.length]);
  assert.ok(composition.backgroundZoom >= 1.08 && composition.backgroundZoom <= 1.32);
  assert.ok(composition.backgroundX >= .18 && composition.backgroundX <= .82);
  assert.ok(composition.backgroundY >= .2 && composition.backgroundY <= .8);
  assert.ok(composition.faceX >= .2 && composition.faceX <= .8);
  assert.ok(composition.faceY >= .35 && composition.faceY <= .72);
  assert.ok(composition.faceScale >= .5 && composition.faceScale <= .68);
});
