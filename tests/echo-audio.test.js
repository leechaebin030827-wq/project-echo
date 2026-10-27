import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ECHO_AUDIO_CUES, ECHO_AUDIO_META } from '../src/content/echoAudioCueMap.js';
import { WORLD_ENTRY_COPY, WORLD_PRESENTATION } from '../src/content/WorldPresentation.js';
import { WORLD_CAPTIONS, RETURN_LINES } from '../src/content/WorldUiCopy.js';
import {
  INTERACTIVE_QUESTIONS, DANCE_NARRATION, HAMINA_DANCE_NARRATION,
  KOBE_ENTRY_FOLLOWUP, KOBE_TUNNEL_NARRATION,
  PACIFIC_ARRIVAL_NARRATION, PACIFIC_CABLE_SECRET, PACIFIC_FISH_HOVER,
  PACIFIC_PARTICLE_HOVER, PACIFIC_PARTICLE_PHOTO,
} from '../src/content/WorldNarration.js';
import { NEVADA_INTERACTIONS } from '../src/content/NevadaInteractions.js';
import { HAMINA_INTERACTIONS } from '../src/content/HaminaInteractions.js';
import { KOBE_ARCHIVE_INTERACTIONS } from '../src/content/KobeInteractions.js';
import { objectCueIds, hoverCueId, ritualCueId, danceCueId } from '../src/audio/EchoCuePlayer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const expectText = (id, text) => {
  assert.equal(ECHO_AUDIO_META[id]?.text, text, `${id} recording text differs from caption`);
};

test('every packaged cue has a local MP3 and consistent metadata', () => {
  const ids = Object.keys(ECHO_AUDIO_CUES);
  assert.equal(ids.length, 139);
  assert.deepEqual(ids.sort(), Object.keys(ECHO_AUDIO_META).sort());
  for (const id of ids) {
    assert.ok(existsSync(`${root}public${ECHO_AUDIO_CUES[id]}`), `${id} MP3 missing`);
    assert.ok(ECHO_AUDIO_META[id].durationMs > 0, `${id} duration missing`);
  }
});

test('Korean world, hover, Pacific, and return cues match displayed copy', () => {
  WORLD_ENTRY_COPY.forEach((line, index) => expectText(`K0${index + 1}`, line));
  expectText('K03', WORLD_PRESENTATION.nevada.defaultCaption.korean);
  WORLD_CAPTIONS.nextCoordinate[0].split('\n').forEach((line, index) =>
    assert.equal(ECHO_AUDIO_META[`K0${index + 4}`].text.replace(/[,]$/, ''), line));
  PACIFIC_ARRIVAL_NARRATION.forEach((cue, index) => expectText(`K0${index + 6}`, cue.korean));
  RETURN_LINES.forEach(([line], index) => expectText(`K${index + 10}`, line));
  KOBE_ENTRY_FOLLOWUP.forEach(({ cueId, korean }) => expectText(cueId, korean));
  KOBE_TUNNEL_NARRATION.forEach(({ cueId, local }) => expectText(cueId, local));
  Object.entries(INTERACTIVE_QUESTIONS).forEach(([name, cue]) =>
    expectText(hoverCueId('nevada', name), cue.korean));
  Object.entries(HAMINA_INTERACTIONS).forEach(([name, content]) =>
    expectText(hoverCueId('hamina', name), content.hover?.[0]
      ?? INTERACTIVE_QUESTIONS[name].korean));
  Object.entries(KOBE_ARCHIVE_INTERACTIONS).forEach(([name, content]) =>
    expectText(hoverCueId('kobe', name), content.hover[0]));
  expectText('KH-D01', WORLD_CAPTIONS.danceHover[0]);
  expectText('K15', PACIFIC_CABLE_SECRET);
  expectText('KH-P01', PACIFIC_FISH_HOVER);
  expectText('KH-P02', PACIFIC_PARTICLE_HOVER);
  expectText('K16', PACIFIC_PARTICLE_PHOTO);
});

test('Nevada and Hamina ritual, dance, and object audio match local subtitles', () => {
  for (const [world, interactions, ritual, dance] of [
    ['nevada', NEVADA_INTERACTIONS, WORLD_CAPTIONS.ritualRecognition, DANCE_NARRATION],
    ['hamina', HAMINA_INTERACTIONS, WORLD_CAPTIONS.ritualRecognitionFinnish, HAMINA_DANCE_NARRATION],
  ]) {
    ritual.forEach(([, local], index) => expectText(ritualCueId(world, index), local));
    dance.forEach(([, local], index) => expectText(danceCueId(world, index), local));
    for (const [name, content] of Object.entries(interactions)) {
      const ids = objectCueIds(world, name);
      assert.equal(ids.length, content.phrases.length, `${world} ${name} cue count`);
      content.phrases.forEach(([, local], index) => expectText(ids[index], local));
    }
  }
});

test('Kobe archive audio matches every Japanese subtitle', () => {
  for (const [name, content] of Object.entries(KOBE_ARCHIVE_INTERACTIONS)) {
    const ids = objectCueIds('kobe', name);
    assert.equal(ids.length, content.phrases.length, `kobe ${name} cue count`);
    content.phrases.forEach(([, japanese], index) => expectText(ids[index], japanese));
  }
});
