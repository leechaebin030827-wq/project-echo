import { ASSETS, AUDIO_MIX } from './config.js';

export class AudioController {
  constructor() {
    this.audio = Object.fromEntries(Object.entries(ASSETS)
      .filter(([name]) => !['opening', 'narration1Video', 'narration2Video'].includes(name))
      .map(([name, src]) => {
        const track = new Audio(src);
        track.preload = 'auto';
        return [name, track];
      }));
    this.audio.defaultBgm.loop = true;
    this.musicNames = ['defaultBgm', 'introBgm'];
    this.activeMusic = null;
    this.fadeJobs = new Map();
    this.musicToken = 0;
    this.audio.introBgm.addEventListener('ended', () => this.restoreDefaultMusic());
  }

  get narration1() { return this.audio.narration1; }
  get narration2() { return this.audio.narration2; }

  async safePlay(name, { restart = false, volume } = {}) {
    const track = this.audio[name];
    if (!track) return false;
    if (restart) track.currentTime = 0;
    if (typeof volume === 'number') track.volume = volume;
    try {
      await track.play();
      return true;
    } catch (error) {
      console.warn(`[Intro audio] ${name} playback failed`, error);
      return false;
    }
  }

  async playMusic(name, {
    restart = false,
    duration = AUDIO_MIX.musicFadeDuration,
    targetVolume = AUDIO_MIX[name],
  } = {}) {
    if (!this.musicNames.includes(name)) return false;
    const token = ++this.musicToken;
    const incoming = this.audio[name];
    if (this.activeMusic === name && !incoming.paused && !restart) {
      this.fadeTo(name, targetVolume, duration);
      return true;
    }
    const started = await this.safePlay(name, { restart: restart || incoming.ended, volume: 0 });
    if (!started || token !== this.musicToken) return false;
    this.activeMusic = name;
    for (const otherName of this.musicNames) {
      if (otherName === name || this.audio[otherName].paused) continue;
      this.fadeTo(otherName, 0, duration, () => {
        if (this.activeMusic === otherName) return;
        this.audio[otherName].pause();
        this.audio[otherName].currentTime = 0;
      });
    }
    this.fadeTo(name, targetVolume, duration);
    return true;
  }

  primeFromGesture() {
    const typing = this.audio.typing;
    typing.muted = true;
    typing.volume = 0.44;
    typing.play().catch(() => {});
    for (const name of ['nevadaEntry', 'haminaEntry']) {
      const entryVoice = this.audio[name];
      entryVoice.muted = true;
      entryVoice.play().then(() => {
        entryVoice.pause();
        entryVoice.currentTime = 0;
        entryVoice.muted = false;
      }).catch(() => {
        entryVoice.muted = false;
      });
    }
    return this.playMusic('defaultBgm', { duration: 1400 });
  }

  previewIntroMusic() { return this.playMusic('introBgm', { restart: true, duration: 420 }); }
  stopIntroMusicPreview() { return this.playMusic('defaultBgm', { duration: 420 }); }
  playUi(name) { return this.safePlay(name, { restart: true, volume: 0.72 }); }
  playNevadaEntry() { return this.safePlay('nevadaEntry', { restart: true, volume: 1 }); }
  playHaminaEntry() { return this.safePlay('haminaEntry', { restart: true, volume: 1 }); }
  restoreDefaultMusic(duration = AUDIO_MIX.musicFadeDuration) {
    return this.playMusic('defaultBgm', { duration });
  }

  handoffToWorld(duration = AUDIO_MIX.musicFadeDuration) {
    this.stopTyping();
    for (const name of ['narration1', 'narration2']) {
      const track = this.audio[name];
      track.pause();
      track.currentTime = 0;
    }
    return this.playMusic('defaultBgm', {
      duration,
      targetVolume: AUDIO_MIX.worldBgm,
    });
  }

  async startNarration1AndMusic() {
    // Narration must be audible immediately even if visual rendering is under load.
    const speech = this.safePlay('narration1', { restart: true, volume: 1 });
    const music = this.playMusic('introBgm');
    const [started] = await Promise.all([speech, music]);
    return started;
  }

  async startNarration2AndMusic() {
    const music = this.playMusic('introBgm');
    const speech = this.safePlay('narration2', { restart: true, volume: 1 });
    const [, started] = await Promise.all([music, speech]);
    return started;
  }

  playTyping() {
    this.audio.typing.muted = false;
    this.audio.typing.playbackRate = 1.1;
    return this.safePlay('typing', { restart: true, volume: 0.44 });
  }

  stopTyping() {
    this.audio.typing.pause();
    this.audio.typing.currentTime = 0;
  }

  fadeTo(name, target, duration = 1100, onComplete) {
    const track = this.audio[name];
    cancelAnimationFrame(this.fadeJobs.get(name));
    const from = track.volume;
    const start = performance.now();
    const frame = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      track.volume = from + (target - from) * eased;
      if (progress < 1) this.fadeJobs.set(name, requestAnimationFrame(frame));
      else {
        this.fadeJobs.delete(name);
        onComplete?.();
      }
    };
    this.fadeJobs.set(name, requestAnimationFrame(frame));
  }

  fadeOut(duration) {
    for (const [name, track] of Object.entries(this.audio)) {
      if (!track.paused) this.fadeTo(name, 0, duration);
    }
  }

  destroy() {
    this.musicToken += 1;
    for (const job of this.fadeJobs.values()) cancelAnimationFrame(job);
    Object.values(this.audio).forEach((track) => {
      track.pause();
      track.removeAttribute('src');
      track.load();
    });
  }
}
