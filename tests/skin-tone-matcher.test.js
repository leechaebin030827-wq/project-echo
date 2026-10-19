import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateSkinToneTransform, featureToneWeight, matchSkinPixel, toSkinColor,
} from '../src/face/SkinToneMatcher.js';

test('robust skin matching ignores a few dark and saturated outliers', () => {
  const visitor = Array.from({ length: 80 }, (_, index) => [
    105 + index % 9, 78 + index % 7, 68 + index % 6,
  ]);
  const base = Array.from({ length: 80 }, (_, index) => [
    170 + index % 9, 137 + index % 7, 119 + index % 6,
  ]);
  for (let index = 0; index < 8; index += 1) {
    visitor.push([15, 12, 10]);
    base.push([250, 30, 20]);
  }
  const transform = estimateSkinToneTransform(visitor, base);
  const matched = matchSkinPixel([109, 81, 70], transform);
  const sourceY = toSkinColor([109, 81, 70])[0];
  const targetY = toSkinColor([174, 140, 123])[0];
  assert.ok(Math.abs(toSkinColor(matched)[0] - targetY)
    < Math.abs(sourceY - targetY) * 0.35);
  assert.ok(matched[0] > matched[1] && matched[1] > matched[2]);
  assert.ok(matched.every((value) => value >= 0 && value <= 255));
});

test('facial features keep their original colors while skin receives the match', () => {
  const visitor = Array.from({ length: 32 }, () => [100, 78, 67]);
  const base = Array.from({ length: 32 }, () => [165, 139, 119]);
  const transform = estimateSkinToneTransform(visitor, base);
  const feature = [52, 38, 41];
  assert.deepEqual(matchSkinPixel(feature, transform, 0), feature);
  const partlyMatched = matchSkinPixel(feature, transform, 0.3);
  const fullyMatched = matchSkinPixel(feature, transform, 1);
  assert.ok(toSkinColor(partlyMatched)[0] > toSkinColor(feature)[0]);
  assert.ok(toSkinColor(partlyMatched)[0] < toSkinColor(fullyMatched)[0]);
});

test('missing skin samples leave source pixels unchanged', () => {
  const transform = estimateSkinToneTransform([], []);
  const source = [94, 73, 60];
  assert.deepEqual(matchSkinPixel(source, transform), source);
});

test('skin matching preserves dark eye and lip detail near facial features', () => {
  const skin = [176, 137, 116];
  assert.equal(featureToneWeight(skin, skin, 1), 1);
  assert.equal(featureToneWeight([45, 33, 30], skin, 0), 1);
  assert.ok(featureToneWeight([45, 33, 30], skin, 1) < 0.5);
  assert.ok(featureToneWeight([115, 56, 69], skin, 1) < 0.8);
});
