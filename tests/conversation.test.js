import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ConversationDirector } from '../src/characters/ConversationDirector.js';
import { findNearbyDanceMembers } from '../src/characters/GroupDanceDirector.js';

const character = (id, x, z, state = 'walk') => ({
  id,
  root: { position: new THREE.Vector3(x, 0, z), rotation: { y: 0 } },
  behavior: { state, wait: 2 },
  focused: false,
  lookingUp: false,
  danceGroup: null,
  conversation: null,
  played: [],
  play(name) { this.played.push(name); },
});

test('an occasional close encounter faces both walkers together, then resumes their routes', () => {
  const first = character('A', 0, 0);
  const second = character('B', 2.5, 0, 'idle');
  first.behavior.walkTime = 0;
  second.behavior.remaining = 0;
  const positions = [first.root.position.clone(), second.root.position.clone()];
  const director = new ConversationDirector(() => 0);
  director.update(0.8, [first, second]);
  assert.equal(director.conversations.length, 0);
  director.update(0.8, [first, second]);
  assert.equal(director.conversations.length, 1);
  assert.equal(first.played.at(-1), 'idle');
  assert.equal(second.played.at(-1), 'idle');
  director.update(0.8, [first, second]);
  assert.ok(Math.abs(first.root.rotation.y - Math.PI / 2) < 0.01);
  assert.ok(Math.abs(second.root.rotation.y + Math.PI / 2) < 0.01);
  director.update(5, [first, second]);
  assert.equal(director.conversations.length, 0);
  for (const [index, member] of [first, second].entries()) {
    assert.equal(member.conversation, null);
    assert.equal(member.behavior.state, 'walk');
    assert.equal(member.played.at(-1), 'walk');
    assert.ok(member.root.position.equals(positions[index]));
  }
  assert.ok(first.behavior.walkTime >= 3);
  assert.ok(second.behavior.remaining >= 1.6);
  director.update(2, [first, second]);
  assert.equal(director.conversations.length, 0);
});

test('a conversation excludes its members from dance and ends when one is selected', () => {
  const pair = [character('A', 0, 0), character('B', 2.5, 0)];
  const third = character('C', 1.25, 2.5);
  const director = new ConversationDirector(() => 0);
  const conversation = director.start(...pair);
  assert.equal(findNearbyDanceMembers([...pair, third]), null);
  pair[0].focused = true;
  director.update(0.1, [...pair, third]);
  assert.equal(director.conversations.length, 0);
  assert.ok(pair.every((member) => member.conversation === null));
  assert.ok(conversation.members.includes(pair[0]));
});

test('encounters are intermittent and unsafe or stationary pairs do not initiate one', () => {
  const close = [character('A', 0, 0), character('B', 1, 0)];
  const stationary = [character('C', 20, 0, 'idle'), character('D', 22.5, 0, 'idle')];
  const director = new ConversationDirector(() => 0);
  director.update(2, [...close, ...stationary]);
  assert.equal(director.conversations.length, 0);
  const pair = [character('E', 10, 0), character('F', 12.5, 0)];
  const reluctant = new ConversationDirector(() => 0.99);
  reluctant.update(0.8, pair);
  reluctant.update(0.8, pair);
  assert.equal(reluctant.conversations.length, 0);
  reluctant.update(3, pair);
  assert.equal(reluctant.conversations.length, 0);
});
