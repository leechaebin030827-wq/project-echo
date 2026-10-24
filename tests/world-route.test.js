import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRandomWorldRoute, createWorldRoute, DEFAULT_WORLD_ROUTE, WORLD_IDS,
} from '../src/app/WorldRoute.js';

test('the current experience visits Nevada, Pacific, then Hamina', () => {
  assert.deepEqual(createWorldRoute(), ['nevada', 'lightcable', 'hamina']);
  assert.deepEqual([...DEFAULT_WORLD_ROUTE].sort(), [...WORLD_IDS].sort());
});

test('the preserved random route still offers every valid visit order', () => {
  const orders = new Set();
  for (let a = 0; a < 10; a += 1) {
    for (let b = 0; b < 10; b += 1) {
      const draws = [a / 10, b / 10];
      const route = createRandomWorldRoute(() => draws.shift());
      assert.deepEqual([...route].sort(), [...WORLD_IDS].sort());
      assert.notEqual(route[0], 'lightcable');
      orders.add(route.join(','));
    }
  }
  assert.equal(orders.size, 4);
  assert.deepEqual(createWorldRoute('?worldOrder=random', () => 0, true),
    ['nevada', 'hamina', 'lightcable']);
});

test('developer order override accepts only a full permutation with a land world first', () => {
  assert.deepEqual(
    createWorldRoute('?worldOrder=hamina,lightcable,nevada', () => 0, true),
    ['hamina', 'lightcable', 'nevada'],
  );
  assert.deepEqual(
    createWorldRoute('?worldOrder=lightcable,hamina,nevada', () => 0, true),
    [...DEFAULT_WORLD_ROUTE],
  );
  assert.deepEqual(
    createWorldRoute('?worldOrder=lightcable,lightcable,nevada', () => 0, true),
    [...DEFAULT_WORLD_ROUTE],
  );
});
