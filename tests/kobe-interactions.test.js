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

test('long Kobe poster narration is split into short timed caption cards', () => {
  const expected = {
    'Tunnel Archive 04': 1,
    'Tunnel Archive 05': 0,
    'Tunnel Archive 07': 1,
    'Tunnel Archive 09': 0,
  };
  for (const [name, phraseIndex] of Object.entries(expected)) {
    const segments = KOBE_ARCHIVE_INTERACTIONS[name].captionSegments[phraseIndex];
    assert.equal(segments.length, 2);
    segments.forEach(([korean, japanese]) => {
      assert.ok(korean.length <= 20, `${name} Korean caption is too long`);
      assert.ok(japanese.length <= 24, `${name} Japanese caption is too long`);
    });
  }
});
