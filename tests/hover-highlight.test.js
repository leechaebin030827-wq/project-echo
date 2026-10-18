import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createHoverHighlightMaterial } from '../src/interaction/HoverHighlight.js';

test('interactive hover gives masked and unmasked materials the same blue emission', () => {
  const masked = new THREE.MeshStandardMaterial({ color: '#888888' });
  masked.emissiveMap = new THREE.Texture();
  masked.emissive.set('#ffcc88');
  masked.emissiveIntensity = 5.2;
  masked.toneMapped = false;
  const plain = new THREE.MeshStandardMaterial({ color: '#888888' });

  const highlightedMasked = createHoverHighlightMaterial(masked);
  const highlightedPlain = createHoverHighlightMaterial(plain);

  assert.ok(highlightedMasked.emissive.equals(highlightedPlain.emissive));
  assert.equal(highlightedMasked.emissiveIntensity, highlightedPlain.emissiveIntensity);
  assert.equal(highlightedMasked.emissiveIntensity, 1);
  assert.equal(highlightedMasked.emissiveMap.image.data[0], 255);
  assert.equal(highlightedMasked.emissiveMap.image.data[1], 255);
  assert.equal(highlightedMasked.toneMapped, true);
  assert.equal(masked.emissiveIntensity, 5.2);
  assert.notEqual(highlightedMasked.emissiveMap, masked.emissiveMap);

  highlightedMasked.dispose();
  highlightedPlain.dispose();
  masked.dispose();
  plain.dispose();
});
