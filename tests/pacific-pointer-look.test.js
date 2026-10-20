import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PointerInteractionController } from '../src/interaction/PointerInteractionController.js';

test('Pacific camera receives hover movement without requiring a click or drag', () => {
  const positions = [];
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const pointer = new PointerInteractionController({
    canvas,
    cameraController: { state: 'ECHO_ORBIT' },
    onPointerPosition: (x, y) => positions.push([x, y]),
  });
  pointer.handlePointerMove({ clientX: 782, clientY: 420, pointerId: 1 });
  assert.deepEqual(positions, [[782, 420]]);
  pointer.dispose();
});
