import { loadVisitorPhotos } from '../face/VisitorPhotoArchive.js';

const COLUMNS = 4;
const ROWS = 5;

const decodePhoto = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Archived photo could not be decoded.')); };
  image.src = url;
});

const drawCover = (context, image, width, height, index = 0) => {
  const targetRatio = width / height;
  const ratio = image.width / image.height;
  const zoom = index === 0 ? 1 : 1 + (index % 5) * 0.012;
  const sourceWidth = (ratio > targetRatio ? image.height * targetRatio : image.width) / zoom;
  const sourceHeight = (ratio > targetRatio ? image.height : image.width / targetRatio) / zoom;
  const x = (image.width - sourceWidth) * (index === 0 ? 0.5 : 0.42 + (index % 4) * 0.045);
  const y = (image.height - sourceHeight) * (index === 0 ? 0.5 : 0.42 + (index % 3) * 0.07);
  context.drawImage(image, x, y,
    sourceWidth, sourceHeight, 0, 0, width, height);
};

const createPortrait = (image, index) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'data-archive-portrait';
  canvas.width = 180;
  canvas.height = 260;
  const context = canvas.getContext('2d');
  if (index === 0) {
    drawCover(context, image, canvas.width, canvas.height);
    return canvas;
  }
  const source = document.createElement('canvas');
  source.width = 180 - Math.min(24, Math.floor(index / 5) * 3);
  source.height = Math.round(source.width * 260 / 180);
  const sourceContext = source.getContext('2d');
  drawCover(sourceContext, image, source.width, source.height, index);
  context.imageSmoothingEnabled = true;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  // Keep each copy recognizable; only a few pixels drift at the edges.
  const strips = 1 + index % 3;
  for (let strip = 0; strip < strips; strip += 1) {
    const y = (strip * 67 + index * 31) % canvas.height;
    const stripHeight = 2 + ((index + strip * 7) % 5);
    const shift = Math.round(Math.sin(index * 2.3 + strip * 5.1) * 4);
    context.drawImage(source, 0, y * source.height / canvas.height, source.width,
      Math.max(1, stripHeight * source.height / canvas.height),
      shift, y, canvas.width, stripHeight);
  }
  return canvas;
};

export class DataCenterArchive {
  constructor(stage, {
    onOpen = () => {}, onClose = () => {}, onRequestClose = () => {},
    onHover = () => {}, getOriginalPhoto = () => null,
  } = {}) {
    this.stage = stage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onRequestClose = onRequestClose;
    this.onHover = onHover;
    this.getOriginalPhoto = getOriginalPhoto;
    this.visible = false;
    this.generation = 0;
    this.timers = new Set();
    this.audioContext = null;
    this.element = document.createElement('section');
    this.element.className = 'data-archive';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <button class="data-archive-backdrop" type="button" aria-label="데이터 아카이브 닫기"></button>
      <div class="data-archive-panel" role="dialog" aria-modal="true" aria-label="Data Center archive">
        <div class="data-archive-stream" aria-hidden="true"><div class="data-archive-track"></div></div>
        <button class="data-archive-close" type="button" aria-label="이전으로">×</button>
      </div>`;
    this.track = this.element.querySelector('.data-archive-track');
    this.closeButton = this.element.querySelector('.data-archive-close');
    this.backdrop = this.element.querySelector('.data-archive-backdrop');
    this.close = this.close.bind(this);
    this.requestClose = this.requestClose.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleFinishedHover = this.handleFinishedHover.bind(this);
    this.closeButton.addEventListener('click', this.requestClose);
    this.closeButton.addEventListener('pointerenter', this.onHover);
    this.backdrop.addEventListener('click', this.requestClose);
    this.stage.append(this.element);
  }

  wait(ms) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        resolve();
      }, ms);
      this.timers.add(timer);
    });
  }

  primeAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.audioContext ??= new AudioContextClass();
    if (this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {});
  }

  playCopyTone(index) {
    const audio = this.audioContext;
    if (!audio || audio.state !== 'running') return;
    const now = audio.currentTime;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880 + index % 4 * 70, now);
    oscillator.frequency.exponentialRampToValueAtTime(660 + index % 4 * 45, now + 0.065);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.08);
  }

  async loadSource() {
    const currentPhoto = this.getOriginalPhoto();
    if (currentPhoto?.width && currentPhoto?.height) return currentPhoto;
    try {
      const records = await loadVisitorPhotos();
      if (records.length) return await decodePhoto(records.at(-1).blob);
    } catch (error) {
      console.warn('[Photo Archive] stored capture unavailable', error);
    }
    return null;
  }

  createCell(image, index) {
    const cell = document.createElement('div');
    cell.className = 'data-archive-cell';
    if (image?.width && image?.height) cell.append(createPortrait(image, index));
    else {
      cell.classList.add('data-archive-cell--empty');
      cell.textContent = 'NO RECORD';
    }
    return cell;
  }

  async fillGrid(image, token) {
    this.track.replaceChildren();
    this.nextIndex = 0;
    for (let row = 0; row < ROWS; row += 1) {
      const rowElement = document.createElement('div');
      rowElement.className = 'data-archive-row';
      this.track.append(rowElement);
      for (let column = 0; column < COLUMNS; column += 1) {
        if (!this.visible || token !== this.generation) return false;
        rowElement.append(this.createCell(image, this.nextIndex));
        this.playCopyTone(this.nextIndex++);
        await this.wait(68);
      }
    }
    return this.visible && token === this.generation;
  }

  async pushRow(image, token) {
    if (!this.visible || token !== this.generation) return;
    const row = document.createElement('div');
    row.className = 'data-archive-row';
    for (let column = 0; column < COLUMNS; column += 1) {
      row.append(this.createCell(image, this.nextIndex));
      this.playCopyTone(this.nextIndex++);
      await this.wait(68);
      if (!this.visible || token !== this.generation) return;
    }
    this.track.append(row);
    this.track.classList.add('shifting');
    await this.wait(380);
    if (!this.visible || token !== this.generation) return;
    this.track.style.transition = 'none';
    this.track.firstElementChild?.remove();
    this.track.classList.remove('shifting');
    void this.track.offsetHeight;
    this.track.style.removeProperty('transition');
    await this.wait(220);
    this.pushRow(image, token);
  }

  async open() {
    if (this.visible) return;
    const token = ++this.generation;
    this.visible = true;
    this.narrationFinished = false;
    this.element.classList.add('visible');
    this.element.setAttribute('aria-hidden', 'false');
    this.stage.classList.add('archive-active');
    window.addEventListener('keydown', this.handleKeyDown);
    const image = await this.loadSource();
    if (!this.visible || token !== this.generation) return;
    await this.wait(540);
    if (!await this.fillGrid(image, token)) return;
    this.onOpen();
    this.pushRow(image, token);
  }

  finishNarration() {
    if (!this.visible) return;
    this.narrationFinished = true;
    this.element.addEventListener('pointermove', this.handleFinishedHover, { once: true });
  }

  handleFinishedHover() {
    if (this.visible && this.narrationFinished) this.requestClose();
  }

  close() {
    if (!this.visible) return;
    this.visible = false;
    this.narrationFinished = false;
    this.element.removeEventListener('pointermove', this.handleFinishedHover);
    this.generation += 1;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.track.classList.remove('shifting');
    this.track.replaceChildren();
    this.element.classList.remove('visible');
    this.element.setAttribute('aria-hidden', 'true');
    this.stage.classList.remove('archive-active');
    this.onClose();
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  requestClose() {
    if (this.visible) this.onRequestClose();
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') this.requestClose();
  }

  dispose() {
    this.close();
    this.audioContext?.close().catch(() => {});
    this.closeButton.removeEventListener('click', this.requestClose);
    this.closeButton.removeEventListener('pointerenter', this.onHover);
    this.backdrop.removeEventListener('click', this.requestClose);
    this.element.remove();
  }
}
