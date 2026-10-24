import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BILLBOARD_FACE_SLOTS, archivedFaceCrop, selectPreviousBillboardPhotos, visitorFaceCrop,
} from '../src/world/shared/BillboardFaceTexture.js';

test('the four poster faces occupy separate locations inside the artwork', () => {
  assert.equal(BILLBOARD_FACE_SLOTS.length, 4);
  for (const [index, slot] of BILLBOARD_FACE_SLOTS.entries()) {
    assert.ok(slot.x >= 0 && slot.y >= 0);
    assert.ok(slot.x + slot.width <= 1774);
    assert.ok(slot.y + slot.height <= 887);
    for (const other of BILLBOARD_FACE_SLOTS.slice(index + 1)) {
      const centerDistance = Math.hypot(
        slot.x + slot.width / 2 - other.x - other.width / 2,
        slot.y + slot.height / 2 - other.y - other.height / 2,
      );
      assert.ok(centerDistance > Math.min(slot.width, other.width) * 0.8);
    }
  }
});

test('the largest slot is the current visitor and the other three use distinct prior captures', () => {
  const records = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, blob: {} }));
  assert.equal(BILLBOARD_FACE_SLOTS[0].width * BILLBOARD_FACE_SLOTS[0].height,
    Math.max(...BILLBOARD_FACE_SLOTS.map((slot) => slot.width * slot.height)));
  assert.deepEqual(selectPreviousBillboardPhotos(records, 5).map((record) => record.id), [4, 3, 2]);
  assert.deepEqual(selectPreviousBillboardPhotos(records, 3).map((record) => record.id), [5, 4, 2]);
  const crop = archivedFaceCrop({ width: 1000, height: 800 });
  assert.ok(Math.abs(crop.x - 270) < 0.01 && Math.abs(crop.y - 112) < 0.01);
  assert.ok(Math.abs(crop.width - 460) < 0.01 && Math.abs(crop.height - 576) < 0.01);
});

test('visitor crop follows detected face landmarks and stays within the photograph', () => {
  const points = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  points[234] = { x: 0.29, y: 0.5 };
  points[454] = { x: 0.71, y: 0.5 };
  points[10] = { x: 0.5, y: 0.2 };
  points[152] = { x: 0.5, y: 0.81 };
  const crop = visitorFaceCrop({ width: 960, height: 1200 }, points);
  assert.ok(crop.x >= 0 && crop.y >= 0);
  assert.ok(crop.width > 380 && crop.height > 700);
  assert.ok(crop.x + crop.width <= 960);
  assert.ok(crop.y + crop.height <= 1200);
  assert.equal(visitorFaceCrop({ width: 960, height: 1200 }, null), null);
});
