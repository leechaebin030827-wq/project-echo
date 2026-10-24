import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CABLE_ECHO_LEAD, CABLE_EXIT_DURATION, getCableExitMotion } from '../src/world/pacific/CableExitMotion.js';

test('ECHO rushes ahead while the camera accelerates close behind', () => {
  assert.ok(CABLE_EXIT_DURATION >= 3);
  const start = getCableExitMotion(0);
  const middle = getCableExitMotion(.5);
  const end = getCableExitMotion(1);
  assert.equal(start.cameraBoost, 0);
  assert.equal(start.echoLead, CABLE_ECHO_LEAD);
  assert.equal(start.echoScale, 1);
  assert.ok(middle.echoLead > CABLE_ECHO_LEAD);
  assert.ok(middle.cameraBoost > 0);
  assert.ok(end.echoLead - CABLE_ECHO_LEAD - end.cameraBoost < 16);
  assert.ok(end.echoLead > middle.echoLead);
  assert.ok(end.echoScale < .2);
  assert.equal(start.echoVisible, true);
  assert.equal(end.echoVisible, false);
});
