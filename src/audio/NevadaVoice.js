import { NEVADA_CLIP_DURATIONS } from './nevadaClipDurations.js';

export class NevadaVoice {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 0.48;
    this.currentId = null;
    this.blocked = false;
  }

  duration(id) {
    return NEVADA_CLIP_DURATIONS[id] ?? 0;
  }

  play(id) {
    if (!id || !this.duration(id)) return;
    if (this.currentId === id && !this.audio.paused) return;
    this.stop();
    this.currentId = id;
    this.audio.src = `/audio/nevada/${id}.mp3`;
    const attempt = this.audio.play();
    attempt?.catch(() => {
      // Hover/proximity can precede the first user gesture. Keep captions usable.
      if (this.currentId === id) this.blocked = true;
    });
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentId = null;
  }

  dispose() {
    this.stop();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
