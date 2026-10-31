import { ASSETS } from '../intro/config.js';

export class WorldUiAudio {
  constructor() {
    this.hover = new Audio(ASSETS.uiHover);
    this.click = new Audio(ASSETS.uiClick);
    this.hover.preload = 'auto';
    this.click.preload = 'auto';
    this.hover.volume = 1;
    this.click.volume = 1;
    this.lastHoverAt = -Infinity;
  }

  playHover() {
    // Target changes can arrive within one pointer movement; keep the cue distinct.
    const now = performance.now();
    if (now - this.lastHoverAt < 110) return;
    this.lastHoverAt = now;
    this.play(this.hover);
  }

  playClick() {
    this.play(this.click);
  }

  play(track) {
    track.currentTime = 0;
    track.play().catch(() => {
      // Browsers require a user gesture before playing sound on direct world links.
    });
  }
}
