import assert from 'node:assert/strict';
import test from 'node:test';
import { CharacterEntity } from '../src/characters/CharacterEntity.js';

test('speech opens the focused character mouth during a cue and closes afterward', () => {
  const sampled = [];
  const character = Object.create(CharacterEntity.prototype);
  character.id = 'N03';
  character.focused = true;
  character.speechOpen = 0;
  character.faceController = { setSpeechOpen(value) { sampled.push(value); } };
  character.speakFor(1.8);
  for (let frame = 0; frame < 130; frame += 1) character.updateSpeech(1 / 60);
  assert.ok(Math.max(...sampled) > 0.45);
  assert.ok(Math.min(...sampled) < 0.05);
  assert.ok(character.speechOpen < 0.01);
  character.speakFor(2);
  character.stopSpeaking();
  assert.equal(character.speechOpen, 0);
  assert.equal(sampled.at(-1), 0);
});

test('ritual speaker can speak without character focus', () => {
  const character = Object.create(CharacterEntity.prototype);
  character.id = 'N07';
  character.focused = false;
  character.speechOpen = 0;
  character.faceController = { setSpeechOpen() {} };
  character.speakFor(1, { ritual: true });
  for (let frame = 0; frame < 15; frame += 1) character.updateSpeech(1 / 60);
  assert.ok(character.speechOpen > 0.1);
});
