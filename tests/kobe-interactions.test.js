import test from 'node:test';
import assert from 'node:assert/strict';
import { KOBE_ARCHIVE_INTERACTIONS } from '../src/content/KobeInteractions.js';
import { objectCueIds } from '../src/audio/EchoCuePlayer.js';

test('all nine Kobe archive posters have Korean lines with Japanese subtitles', () => {
  const entries = Object.entries(KOBE_ARCHIVE_INTERACTIONS);
  const expectedPhraseCounts = [4, 4, 4, 3, 4, 4, 4, 4, 3];
  assert.equal(entries.length, 9);
  entries.forEach(([name, content], index) => {
    assert.equal(name, `Tunnel Archive ${String(index + 1).padStart(2, '0')}`);
    assert.equal(content.world, 'kobe');
    assert.deepEqual(content.hover, [
      '벽화? 여기 무언가 그려져 있어요.',
      '壁画？ ここに何かが描かれています。',
    ]);
    assert.equal(content.phrases.length, expectedPhraseCounts[index]);
    content.phrases.forEach(([korean, japanese]) => {
      assert.ok(korean.length > 0);
      assert.ok(japanese.length > 0);
    });
    assert.equal(objectCueIds('kobe', name).length, content.phrases.length);
  });
});
