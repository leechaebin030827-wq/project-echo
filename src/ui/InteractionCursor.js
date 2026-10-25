import { CURSOR_LABELS } from '../content/WorldUiCopy.js';

export class InteractionCursor {
  constructor(stage, resolveWorldMode = () => 'blocked') {
    this.stage = stage;
    this.resolveWorldMode = resolveWorldMode;
    this.element = document.createElement('div');
    this.element.className = 'interaction-cursor';
    this.element.dataset.mode = 'blocked';
    this.element.setAttribute('aria-hidden', 'true');
    this.glyph = document.createElement('span');
    this.glyph.className = 'interaction-cursor__glyph';
    this.glyph.textContent = '×';
    this.element.append(this.glyph);
    stage.append(this.element);
    this.finePointer = window.matchMedia('(pointer: fine)');
    this.pendingPointer = null;
    this.pointerFrame = 0;
    this.lastCanvasPickAt = -Infinity;
    this.lastTargetWasCanvas = false;
    this.currentMode = 'blocked';
    this.identificationTimer = null;
    this.identificationStep = 0;

    this.onPointerMove = this.handlePointerMove.bind(this);
    this.flushPointerMove = this.flushPointerMove.bind(this);
    this.onPointerDown = () => this.element.classList.add('is-pressed');
    this.onPointerUp = () => this.element.classList.remove('is-pressed');
    this.onPointerLeave = () => {
      this.lastTargetWasCanvas = false;
      this.element.classList.remove('is-visible');
      if (this.currentMode === 'data-particle') this.setMode('blocked');
    };
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('blur', this.onPointerLeave);
  }

  handlePointerMove(event) {
    this.pendingPointer = {
      clientX: event.clientX, clientY: event.clientY,
      pointerType: event.pointerType, target: event.target,
    };
    if (!this.pointerFrame) this.pointerFrame = window.requestAnimationFrame(this.flushPointerMove);
  }

  refresh() {
    if (!this.pendingPointer) return;
    const { clientX, clientY } = this.pendingPointer;
    this.pendingPointer = {
      ...this.pendingPointer,
      // A click can hide the return button without producing another pointer
      // move. Re-hit-test the same screen position so the canvas immediately
      // regains hover instead of staying in the button/blocked mode.
      target: document.elementFromPoint(clientX, clientY),
    };
    this.lastTargetWasCanvas = false;
    if (!this.pointerFrame) this.pointerFrame = window.requestAnimationFrame(this.flushPointerMove);
  }

  flushPointerMove() {
    this.pointerFrame = 0;
    const event = this.pendingPointer;
    if (!event) return;
    if (event.pointerType === 'touch' || !this.finePointer.matches) {
      this.onPointerLeave();
      return;
    }
    const rect = this.stage.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) {
      this.onPointerLeave();
      return;
    }
    this.element.style.setProperty('--cursor-x', `${event.clientX - rect.left}px`);
    this.element.style.setProperty('--cursor-y', `${event.clientY - rect.top}px`);
    this.element.classList.add('is-visible');
    const onCanvas = event.target instanceof Element && Boolean(event.target.closest('#world-canvas'));
    const now = performance.now();
    const reuseCanvasMode = onCanvas && this.lastTargetWasCanvas
      && this.currentMode !== 'data-particle' && now - this.lastCanvasPickAt < 32;
    const mode = reuseCanvasMode ? this.currentMode : this.getMode(event);
    if (onCanvas && !reuseCanvasMode) this.lastCanvasPickAt = now;
    this.lastTargetWasCanvas = onCanvas;
    this.setMode(mode);
    if (mode === 'camera-guide') this.pointAtCameraShutter(event);
  }

  getMode(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button');
    if (button) return button.disabled ? 'blocked' : 'button';
    if (target?.closest('a[href], [role="button"], [data-cursor="clickable"]')) return 'clickable';

    const introRoot = target?.closest('#intro-root');
    if (introRoot) {
      const state = introRoot.dataset.introState ?? 'OPENING_IMAGE';
      const audioPromptActive = Boolean(introRoot.querySelector('.audio-start-prompt'));
      if (state === 'OPENING_IMAGE' && !audioPromptActive) return 'clickable';
      if (state === 'CAMERA') return 'camera-guide';
      return 'blocked';
    }

    if (target?.closest('#world-canvas')) {
      return this.resolveWorldMode(event.clientX, event.clientY);
    }
    return 'blocked';
  }

  setMode(mode) {
    const label = mode === 'interactive-object' ? this.stage.dataset.worldHoverLabel || 'OBJECT' : '';
    if (mode === this.currentMode && label === this.currentLabel) return;
    if (mode !== 'data-particle' && this.identificationTimer) {
      window.clearInterval(this.identificationTimer);
      this.identificationTimer = null;
    }
    this.currentMode = mode;
    this.currentLabel = label;
    this.element.dataset.mode = mode;
    this.glyph.textContent = mode === 'data-particle' ? this.nextIdentification()
      : mode === 'button' ? '↗'
      : mode === 'echo' ? CURSOR_LABELS.echo
        : mode === 'character' ? CURSOR_LABELS.character
          : mode === 'dance-group' ? CURSOR_LABELS.danceGroup
          : mode === 'character-back' ? CURSOR_LABELS.characterBack
            : mode === 'interactive-object' ? label
            : mode === 'compass' ? '↑'
            : mode === 'camera-guide' ? '↗'
        : mode === 'blocked' ? '×' : '';
    if (mode === 'data-particle' && !this.identificationTimer) {
      this.identificationTimer = window.setInterval(() => {
        this.glyph.textContent = this.nextIdentification();
      }, 55);
    }
  }

  nextIdentification() {
    this.identificationStep = (this.identificationStep + 1) % 16;
    const hex = () => Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0');
    return `${'◴◷◶◵'[this.identificationStep % 4]} ${hex()}:${hex()}/${hex()}`;
  }

  pointAtCameraShutter(event) {
    const shutter = this.stage.querySelector('.intro-shutter:not(:disabled)');
    if (!shutter) return;
    const rect = shutter.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    const angle = Math.atan2(targetY - event.clientY, targetX - event.clientX) * 180 / Math.PI;
    this.element.style.setProperty('--guide-rotation', `${angle + 45}deg`);
  }

  dispose() {
    if (this.identificationTimer) window.clearInterval(this.identificationTimer);
    if (this.pointerFrame) window.cancelAnimationFrame(this.pointerFrame);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('blur', this.onPointerLeave);
    this.element.remove();
  }
}
