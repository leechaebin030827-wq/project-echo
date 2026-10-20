import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorldRoute, WORLD_IDS } from '../src/app/WorldRoute.js';

test('every visit order contains each of the three worlds exactly once', () => {
  const orders = new Set();
  for (let a = 0; a < 10; a += 1) {
    for (let b = 0; b < 10; b += 1) {
      const draws = [a / 10, b / 10];
      const route = createWorldRoute('', () => draws.shift());
      assert.deepEqual([...route].sort(), [...WORLD_IDS].sort());
      assert.notEqual(route[0], 'lightcable');
      orders.add(route.join(','));
    }
  }
  assert.equal(orders.size, 4);
});

test('developer order override accepts only a full permutation with a land world first', () => {
  assert.deepEqual(
    createWorldRoute('?worldOrder=hamina,lightcable,nevada', () => 0, true),
    ['hamina', 'lightcable', 'nevada'],
  );
  assert.deepEqual(
    createWorldRoute('?worldOrder=lightcable,hamina,nevada', () => 0, true),
    createWorldRoute('', () => 0),
  );
  assert.deepEqual(
    createWorldRoute('?worldOrder=lightcable,lightcable,nevada', () => 0, true),
    createWorldRoute('', () => 0),
  );
});
