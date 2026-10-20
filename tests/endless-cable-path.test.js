import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  CABLE_GAP_METERS, CABLE_WINDOW_COUNT, CABLE_BEHIND_COUNT,
  cablePoint, cableTangent, cableSpacing, cableWindowStart, cableSegmentMatrix,
} from '../src/world/pacific/EndlessCablePath.js';

test('cable pieces leave about 1.85 m between their visible ends', () => {
  const bounds = new THREE.Box3(
    new THREE.Vector3(-.952, -1, -1),
    new THREE.Vector3(.952, 1, 1),
  );
  const dummy = new THREE.Object3D();
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const spacing = cableSpacing(bounds);
  const gaps = [];
  for (let index = 0; index < CABLE_WINDOW_COUNT - 1; index += 1) {
    const a = cableSegmentMatrix(index, bounds, 0, spacing, dummy, point, tangent).clone();
    const b = cableSegmentMatrix(index + 1, bounds, 0, spacing, dummy, point, tangent).clone();
    const end = new THREE.Vector3(bounds.max.x, 0, 0).applyMatrix4(a);
    const start = new THREE.Vector3(bounds.min.x, 0, 0).applyMatrix4(b);
    gaps.push(end.distanceTo(start));
  }
  // The authored path bends, so the straight-line gap varies slightly.
  assert.ok(Math.min(...gaps) >= CABLE_GAP_METERS - .02);
  assert.ok(Math.max(...gaps) < CABLE_GAP_METERS + .2);
});

test('a cable window remains ahead of the traveler at arbitrarily long distances', () => {
  const spacing = cableSpacing(new THREE.Box3(
    new THREE.Vector3(-.952, -1, -1), new THREE.Vector3(.952, 1, 1),
  ));
  for (const distance of [0, 250, 999, 1000, 20_000, 1_000_000]) {
    const origin = Math.floor(distance / 1000) * 1000;
    const point = cablePoint(distance, origin);
    const tangent = cableTangent(distance);
    const start = cableWindowStart(distance, spacing);
    const back = start * spacing;
    const front = (start + CABLE_WINDOW_COUNT) * spacing;
    assert.ok(Math.abs(point.x) < 1100);
    assert.ok(Math.abs(tangent.length() - 1) < 1e-12);
    assert.ok(back < distance - (CABLE_BEHIND_COUNT - 1) * spacing);
    assert.ok(front > distance + 200);
  }
});
