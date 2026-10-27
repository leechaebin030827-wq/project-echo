import { ECHO_AUDIO_META, getEchoAudioSrc } from '../content/echoAudioCueMap.js';

const OBJECT_CUES = Object.freeze({
  nevada: Object.freeze({
    'Data Center': [1, 4], Cooler: [5, 7], Billboard: [8, 12],
    Money: [13, 18], Flag: [19, 23],
  }),
  hamina: Object.freeze({
    'Data Center': [1, 4], Cooler: [5, 7], Timer: [8, 13],
    Finland: [14, 18], Ocean: [19, 22], Forest: [23, 28],
  }),
  kobe: Object.freeze({
    'Tunnel Archive 01': [1, 4],
    'Tunnel Archive 02': [5, 8],
    'Tunnel Archive 03': [9, 12],
    'Tunnel Archive 04': [13, 15],
    'Tunnel Archive 05': [16, 19],
    'Tunnel Archive 06': [20, 23],
    'Tunnel Archive 07': [24, 27],
    'Tunnel Archive 08': [28, 31],
    'Tunnel Archive 09': [32, 34],
  }),
});

const HOVER_CUES = Object.freeze({
  nevada: Object.freeze({
    'Data Center': 'KH-N01', Billboard: 'KH-N02', Flag: 'KH-N03',
    Cooler: 'KH-N04', Money: 'KH-N05',
  }),
  hamina: Object.freeze({
    'Data Center': 'KH-H01', Cooler: 'KH-H02', Timer: 'KH-H03',
    Finland: 'KH-H04', Ocean: 'KH-H05', Forest: 'KH-H06',
  }),
  kobe: Object.freeze(Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [
      `Tunnel Archive ${String(index + 1).padStart(2, '0')}`,
      'KH-K01',
    ]),
  )),
});

export const objectCueIds = (world, name) => {
  const range = OBJECT_CUES[world]?.[name];
  if (!range) return [];
  const language = world === 'hamina' ? 'FI' : world === 'kobe' ? 'JP' : 'EN';
  return Array.from({ length: range[1] - range[0] + 1 }, (_, index) =>
    `${language}-O${String(range[0] + index).padStart(2, '0')}`);
};

export const hoverCueId = (world, name) => HOVER_CUES[world]?.[name] ?? null;
export const ritualCueId = (world, index) =>
  `${world === 'hamina' ? 'FI' : 'EN'}-R${String(index + 1).padStart(2, '0')}`;
export const danceCueId = (world, index) =>
  `${world === 'hamina' ? 'FI' : 'EN'}-D${String(index + 1).padStart(2, '0')}`;
export const cueDurationMs = (id) => ECHO_AUDIO_META[id]?.durationMs ?? 0;

export class EchoCuePlayer {
  constructor(stage = null) {
    this.stage = stage;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.currentId = null;
    this.queue = [];
    this.audio.addEventListener('ended', () => {
      if (this.queue.length) this.startNext();
      else {
        this.currentId = null;
        this.setStatus('ended');
      }
    });
  }

  setStatus(status) {
    if (this.stage) this.stage.dataset.echoAudioStatus = status;
  }

  startNext() {
    const id = this.queue.shift();
    const src = getEchoAudioSrc(id);
    if (!src) {
      this.currentId = null;
      this.queue.length = 0;
      return false;
    }
    this.audio.pause();
    this.audio.src = src;
    this.currentId = id;
    if (this.stage) this.stage.dataset.echoAudioCue = id;
    this.setStatus('starting');
    this.audio.currentTime = 0;
    this.audio.play().then(() => {
      if (this.currentId === id) this.setStatus('playing');
    }).catch((error) => {
      if (this.currentId === id) {
        this.setStatus('blocked');
        console.warn(`[ECHO audio] ${id} playback failed`, error);
      }
    });
    return true;
  }

  play(id) {
    this.queue = [id];
    return this.startNext();
  }

  playSequence(ids) {
    this.queue = [...ids];
    return this.queue.length ? this.startNext() : false;
  }

  stop() {
    this.queue.length = 0;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.currentId = null;
    this.setStatus('stopped');
  }

  stopHover() {
    if (this.currentId?.startsWith('KH-')) this.stop();
  }

  dispose() {
    this.stop();
    this.audio.load();
  }
}
