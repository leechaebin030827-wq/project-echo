import * as THREE from 'three';
import { isCharacterOccupied } from './CharacterBehavior.js';

const PROXIMITY = 5.8;
const PROXIMITY_SQUARED = PROXIMITY * PROXIMITY;
const SCAN_INTERVAL = 0.65;
const DANCE_SECONDS = 10;
const COOLDOWN_SECONDS = 32;
const MAX_GROUPS = 1;
const FORM_SECONDS = 1.35;
const RETURN_SECONDS = 1.45;
const smooth = (value) => value * value * (3 - 2 * value);

const horizontalDistanceSquared = (a, b) => {
  const dx = a.root.position.x - b.root.position.x;
  const dz = a.root.position.z - b.root.position.z;
  return dx * dx + dz * dz;
};

// A compact triangle reads as a gathering; a chain of nearby pairs does not.
export function findNearbyDanceMembers(entities, cooldowns = new Map()) {
  const available = entities.filter((entity) => !entity.danceGroup
    && !entity.ambientPose
    && !entity.conversation && !entity.focused && !entity.lookingUp
    && (cooldowns.get(entity.id) ?? 0) <= 0);
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < available.length - 2; i += 1) {
    for (let j = i + 1; j < available.length - 1; j += 1) {
      const ab = horizontalDistanceSquared(available[i], available[j]);
      if (ab > PROXIMITY_SQUARED) continue;
      for (let k = j + 1; k < available.length; k += 1) {
        const ac = horizontalDistanceSquared(available[i], available[k]);
        const bc = horizontalDistanceSquared(available[j], available[k]);
        if (ac > PROXIMITY_SQUARED || bc > PROXIMITY_SQUARED) continue;
        const score = ab + ac + bc;
        if (score < bestScore) {
          bestScore = score;
          best = [available[i], available[j], available[k]];
        }
      }
    }
  }
  if (!best) return null;

  return best;
}

export class GroupDanceDirector {
  constructor(camera, navigation = null) {
    this.camera = camera;
    this.navigation = navigation;
    this.groups = [];
    this.cooldowns = new Map();
    this.scanElapsed = 0;
    this.candidateKey = '';
    this.candidateDuration = 0;
    this.nextId = 1;
  }

  getGroupFor(entity) { return entity?.danceGroup ?? null; }

  update(delta, entities) {
    for (const [id, remaining] of this.cooldowns) {
      if (remaining <= delta) this.cooldowns.delete(id);
      else this.cooldowns.set(id, remaining - delta);
    }
    for (const group of [...this.groups]) {
      const nextRemaining = group.remaining - (group.viewed ? 0 : delta);
      const nextAge = group.age + delta;
      const gather = smooth(Math.min(1, nextAge / FORM_SECONDS));
      const returnToRoute = smooth(Math.min(1, Math.max(0, nextRemaining) / RETURN_SECONDS));
      const outsiders = entities.filter((entity) => !group.members.includes(entity));
      const nextPositions = group.targets.map((target, index) =>
        group.anchors[index].clone().lerp(target, gather * returnToRoute));
      const blocker = outsiders.find((other) => nextPositions.some((position) =>
        isCharacterOccupied(position, null, [other], 1.42)));
      if (blocker) {
        group.blockedBy = blocker.id;
        continue;
      }
      group.blockedBy = null;
      group.remaining = nextRemaining;
      group.age = nextAge;
      for (let index = 0; index < group.members.length; index += 1) {
        const member = group.members[index];
        member.root.position.copy(nextPositions[index]);
        const towardCenterX = group.center.x - member.root.position.x;
        const towardCenterZ = group.center.z - member.root.position.z;
        const desired = Math.atan2(towardCenterX, towardCenterZ);
        const difference = Math.atan2(
          Math.sin(desired - member.root.rotation.y),
          Math.cos(desired - member.root.rotation.y),
        );
        member.root.rotation.y += difference * Math.min(1, delta * 3.2);
      }
      if (group.remaining <= 0) this.end(group);
    }

    this.scanElapsed += delta;
    if (this.scanElapsed < SCAN_INTERVAL) return;
    const scanDelta = this.scanElapsed;
    this.scanElapsed = 0;
    if (this.groups.length >= MAX_GROUPS) {
      this.candidateKey = '';
      this.candidateDuration = 0;
      return;
    }
    const members = findNearbyDanceMembers(entities, this.cooldowns);
    const key = members?.map((member) => member.id).sort().join(':') ?? '';
    if (!key) {
      this.candidateKey = '';
      this.candidateDuration = 0;
      return;
    }
    this.candidateDuration = key === this.candidateKey
      ? this.candidateDuration + scanDelta : scanDelta;
    this.candidateKey = key;
    if (this.candidateDuration >= 1.15) {
      this.start(members, entities);
      this.candidateKey = '';
      this.candidateDuration = 0;
    }
  }

  findCircleTargets(members, center, anchors, entities) {
    const outsiders = entities.filter((entity) => !members.includes(entity));
    const assignments = (values) => values.length === 1 ? [values] : values.flatMap((value) =>
      assignments(values.filter((other) => other !== value)).map((rest) => [value, ...rest]));
    const arrangements = assignments(members.map((_, index) => index));
    for (const radius of [1.55, 1.8, 2.05, 2.3]) {
      let best = null;
      for (let turn = 0; turn < 12; turn += 1) {
        const slots = [];
        let safe = true;
        for (let slot = 0; slot < members.length; slot += 1) {
          const angle = turn * Math.PI / 12 + slot * Math.PI * 2 / members.length;
          const x = center.x + Math.cos(angle) * radius;
          const z = center.z + Math.sin(angle) * radius;
          const height = this.navigation?.sampleHeight(x, z);
          const y = height ?? center.y;
          if (this.navigation && (height === null || !this.navigation.isClear(x, y, z))) {
            safe = false;
            break;
          }
          slots.push(new THREE.Vector3(x, y, z));
        }
        if (!safe) continue;
        for (const arrangement of arrangements) {
          const targets = arrangement.map((slot) => slots[slot]);
          const travel = targets.reduce((sum, target, index) =>
            sum + anchors[index].distanceToSquared(target), 0);
          if (best && travel >= best.travel) continue;
          safe = true;
          for (const fraction of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
            const positions = targets.map((target, index) => anchors[index].clone().lerp(target, fraction));
            if (positions.some((position) => (this.navigation
              && (this.navigation.sampleHeight(position.x, position.z) === null
                || !this.navigation.isClear(position.x, position.y, position.z)))
              || outsiders.some((other) => Math.hypot(
                other.root.position.x - position.x, other.root.position.z - position.z,
              ) < 1.55))) {
              safe = false;
              break;
            }
            for (let a = 0; a < positions.length && safe; a += 1) {
              for (let b = a + 1; b < positions.length; b += 1) {
                if (Math.hypot(positions[a].x - positions[b].x, positions[a].z - positions[b].z) < 1.4) {
                  safe = false;
                  break;
                }
              }
            }
            if (!safe) break;
          }
          if (safe) best = { targets, travel };
        }
      }
      // Use the first safe radius so the group stays readable in a close shot.
      if (best) return best.targets;
    }
    return anchors.map((anchor) => anchor.clone());
  }

  start(members, entities = members) {
    const center = new THREE.Vector3();
    for (const member of members) center.add(member.root.position);
    center.divideScalar(members.length);
    const anchors = members.map((member) => member.root.position.clone());
    const targets = this.findCircleTargets(members, center, anchors, entities);
    const radius = Math.max(1.4, ...members.flatMap((member, index) => (
      [anchors[index], targets[index]].map((position) =>
        Math.hypot(position.x - center.x, position.z - center.z) + member.height * 0.38)
    )));
    const focusRadius = Math.max(1.4, ...members.map((member, index) =>
      Math.hypot(targets[index].x - center.x, targets[index].z - center.z) + member.height * 0.28));
    const group = {
      id: this.nextId++, members, center, radius, focusRadius, anchors, targets, age: 0,
      height: Math.max(...members.map((member) => member.height)),
      remaining: DANCE_SECONDS, viewed: false,
    };
    for (const member of members) {
      member.danceGroup = group;
      member.play('dance');
    }
    this.groups.push(group);
    console.info(`[Dance] group ${group.id}: ${members.map((member) => member.id).join(', ')}`);
    return group;
  }

  view(group) {
    if (!this.groups.includes(group)) return;
    group.viewed = true;
    group.remaining = Math.max(group.remaining, 4);
  }

  release(group) {
    if (!this.groups.includes(group)) return;
    group.viewed = false;
    group.remaining = 4;
  }

  end(group) {
    if (!this.groups.includes(group)) return;
    this.groups.splice(this.groups.indexOf(group), 1);
    for (let index = 0; index < group.members.length; index += 1) {
      const member = group.members[index];
      member.root.position.copy(group.anchors[index]);
      member.danceGroup = null;
      if (!member.lookingUp) member.play(member.behavior.state === 'idle' ? 'idle' : 'walk');
      this.cooldowns.set(member.id, COOLDOWN_SECONDS);
    }
  }

  clear() {
    for (const group of [...this.groups]) this.end(group);
    this.cooldowns.clear();
    this.candidateKey = '';
    this.candidateDuration = 0;
    this.scanElapsed = 0;
  }
}
