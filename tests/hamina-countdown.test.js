import assert from 'node:assert/strict';
import test from 'node:test';
import { HaminaCountdownDisplay } from '../src/world/hamina/HaminaCountdownDisplay.js';

test('Hamina countdown exposes five live units down to milliseconds', () => {
  const target = new Date(2050, 0, 1).getTime();
  const remaining = ((2 * 24 + 3) * 60 * 60 + 4 * 60 + 5) * 1000 + 678;
  const parts = HaminaCountdownDisplay.prototype.getTimeParts(target - remaining);
  assert.deepEqual(parts, {
    days: 2, hours: 3, minutes: 4, seconds: 5, milliseconds: 678,
  });
  assert.equal(HaminaCountdownDisplay.prototype.getTimeParts(target + 1).milliseconds, 0);
});
