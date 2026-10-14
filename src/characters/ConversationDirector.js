const SCAN_INTERVAL = 0.8;
const MIN_DISTANCE = 1.55;
const MAX_DISTANCE = 3.6;
const MEETING_SECONDS = 1.6;
const CHANCE_PER_MEETING = 0.28;
const RETRY_SECONDS = 18;
const COOLDOWN_SECONDS = 25;
const MAX_CONVERSATIONS = 1;
const GLOBAL_PAUSE_SECONDS = 11;

const distance = (a, b) => Math.hypot(
  a.root.position.x - b.root.position.x,
  a.root.position.z - b.root.position.z,
);

const available = (entity, cooldowns) => !entity.danceGroup && !entity.conversation
  && !entity.ambientPose
  && !entity.focused && !entity.lookingUp && (cooldowns.get(entity.id) ?? 0) <= 0;

export class ConversationDirector {
  constructor(random = Math.random) {
    this.random = random;
    this.conversations = [];
    this.cooldowns = new Map();
    this.encounters = new Map();
    this.scanElapsed = 0;
    this.nextConversationIn = 0;
    this.nextId = 1;
  }

  update(delta, entities) {
    this.nextConversationIn = Math.max(0, this.nextConversationIn - delta);
    for (const [id, remaining] of this.cooldowns) {
      if (remaining <= delta) this.cooldowns.delete(id);
      else this.cooldowns.set(id, remaining - delta);
    }
    for (const conversation of [...this.conversations]) {
      const [first, second] = conversation.members;
      if (first.focused || second.focused || first.lookingUp || second.lookingUp
        || first.danceGroup || second.danceGroup) {
        this.end(conversation);
        continue;
      }
      conversation.age += delta;
      conversation.remaining -= delta;
      for (const [member, other] of [[first, second], [second, first]]) {
        const desired = Math.atan2(
          other.root.position.x - member.root.position.x,
          other.root.position.z - member.root.position.z,
        );
        const difference = Math.atan2(
          Math.sin(desired - member.root.rotation.y),
          Math.cos(desired - member.root.rotation.y),
        );
        member.root.rotation.y += difference * Math.min(1, delta * 3.4);
      }
      if (conversation.remaining <= 0) this.end(conversation);
    }

    this.scanElapsed += delta;
    if (this.scanElapsed < SCAN_INTERVAL) return;
    const scanDelta = this.scanElapsed;
    this.scanElapsed = 0;
    const nearby = [];
    const seen = new Set();
    for (let i = 0; i < entities.length - 1; i += 1) {
      const first = entities[i];
      if (!available(first, this.cooldowns)) continue;
      for (let j = i + 1; j < entities.length; j += 1) {
        const second = entities[j];
        if (!available(second, this.cooldowns)) continue;
        // A meeting begins while at least one person is still on their route.
        if (first.behavior.state !== 'walk' && second.behavior.state !== 'walk') continue;
        const separation = distance(first, second);
        if (separation < MIN_DISTANCE || separation > MAX_DISTANCE) continue;
        const key = [first.id, second.id].sort().join(':');
        seen.add(key);
        const encounter = this.encounters.get(key) ?? { nearFor: 0, retryIn: 0 };
        encounter.nearFor += scanDelta;
        encounter.retryIn = Math.max(0, encounter.retryIn - scanDelta);
        this.encounters.set(key, encounter);
        if (encounter.nearFor >= MEETING_SECONDS && encounter.retryIn <= 0) {
          nearby.push({ first, second, separation, key, encounter });
        }
      }
    }
    for (const key of this.encounters.keys()) {
      if (!seen.has(key)) this.encounters.delete(key);
    }
    if (this.conversations.length >= MAX_CONVERSATIONS || this.nextConversationIn > 0) return;
    nearby.sort((a, b) => a.separation - b.separation);
    for (const candidate of nearby) {
      if (this.conversations.length >= MAX_CONVERSATIONS) break;
      const { first, second, encounter, key } = candidate;
      if (!available(first, this.cooldowns) || !available(second, this.cooldowns)) continue;
      encounter.retryIn = RETRY_SECONDS;
      if (this.random() >= CHANCE_PER_MEETING) continue;
      this.start(first, second);
      this.encounters.delete(key);
    }
  }

  start(first, second) {
    const conversation = {
      id: this.nextId++, members: [first, second], age: 0,
      remaining: 5.5 + this.random() * 2,
    };
    for (const [index, member] of conversation.members.entries()) {
      member.conversation = conversation;
      member.conversationIndex = index;
      member.play('idle');
    }
    this.conversations.push(conversation);
    this.nextConversationIn = GLOBAL_PAUSE_SECONDS;
    return conversation;
  }

  end(conversation) {
    const index = this.conversations.indexOf(conversation);
    if (index < 0) return;
    this.conversations.splice(index, 1);
    for (const member of conversation.members) {
      member.conversation = null;
      member.conversationIndex = -1;
      member.behavior.state = 'walk';
      member.behavior.wait = 0;
      if ('walkTime' in member.behavior) {
        member.behavior.walkTime = Math.max(member.behavior.walkTime, 3);
      }
      if ('remaining' in member.behavior) {
        member.behavior.remaining = Math.max(member.behavior.remaining, 1.6);
      }
      if (!member.lookingUp) member.play('walk');
      this.cooldowns.set(member.id, COOLDOWN_SECONDS);
    }
  }

  clear() {
    for (const conversation of [...this.conversations]) this.end(conversation);
    this.cooldowns.clear();
    this.encounters.clear();
    this.scanElapsed = 0;
    this.nextConversationIn = 0;
  }
}
