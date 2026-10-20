import * as THREE from 'three';

export class CharacterAnimator {
  constructor(root, clips, random) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    this.current = null;
    this.accumulated = 0;
    this.walkPlayback = 0.72;
    this.locomotionSpeed = 0.6;
    for (const clip of clips) {
      const key = /idle/i.test(clip.name) ? 'idle'
        : /walk/i.test(clip.name) ? 'walk'
          : /dance/i.test(clip.name) ? 'dance' : null;
      if (!key) continue;
      const action = this.mixer.clipAction(clip);
      action.time = random() * clip.duration;
      this.actions[key] = action;
    }
    if (!['idle', 'walk', 'dance'].every((key) => this.actions[key])) {
      throw new Error('Character GLB에 Idle/Walk/Dance 애니메이션이 필요합니다.');
    }
  }

  play(name) {
    const key = name.toLowerCase();
    // Idle is intentionally disabled. Any legacy caller asking for it keeps
    // the character on the same walking loop instead of the arms-out pose.
    if (key === 'idle') {
      this.play('walk');
      return;
    }
    const next = this.actions[key];
    if (!next || (next === this.current && !next.paused)) return;
    if (next === this.current && next.paused) {
      next.paused = false;
      return;
    }
    next.enabled = true;
    next.paused = false;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(key === 'dance' ? 0.72 : 1);
    next.play();
    if (this.current?.paused) {
      this.current.stop();
      next.fadeIn(0.3);
    } else if (this.current) this.current.crossFadeTo(next, 0.3, false);
    else next.fadeIn(0.15);
    this.current = next;
  }

  hold(name, time = 0) {
    const next = this.actions[name.toLowerCase()];
    if (!next) return;
    this.mixer.stopAllAction();
    next.reset();
    next.enabled = true;
    next.paused = false;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.time = Math.min(Math.max(0, time), Math.max(0, next.getClip().duration - 0.001));
    next.play();
    this.mixer.update(0);
    next.paused = true;
    this.current = next;
    this.accumulated = 0;
  }

  stop() {
    this.mixer.stopAllAction();
    this.current = null;
    this.accumulated = 0;
  }

  setLocomotionSpeed(speed) {
    this.locomotionSpeed = Math.max(0, speed);
  }

  update(delta, distance, focused) {
    if (this.current === this.actions.walk && !this.current.paused) {
      const target = THREE.MathUtils.clamp(this.locomotionSpeed / 0.78, 0.38, 1.12);
      this.walkPlayback = THREE.MathUtils.damp(this.walkPlayback, target, 3.5, delta);
      this.current.setEffectiveTimeScale(this.walkPlayback);
    }
    this.accumulated += delta;
    const interval = focused || distance < 6 ? 0 : distance < 14 ? 1 / 30 : 1 / 18;
    if (this.accumulated >= interval) {
      this.mixer.update(this.accumulated);
      this.accumulated = 0;
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
