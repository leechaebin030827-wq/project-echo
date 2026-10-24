import { EXPERIENCE_STATES } from '../config.js';
import { WORLD_PRESENTATION } from '../content/WorldPresentation.js';

export class EchoProximityCaption {
  constructor(element, camera, cameraController, { onDefaultShow = () => {} } = {}) {
    this.element = element;
    this.camera = camera;
    this.cameraController = cameraController;
    this.onDefaultShow = onDefaultShow;
    this.visible = false;
    this.override = false;
    this.proximityActive = false;
    this.worldMode = 'nevada';
    this.korean = element.querySelector('.echo-caption-korean');
    this.english = element.querySelector('.echo-caption-english');
  }

  setWorldMode(mode) {
    this.worldMode = mode;
    if (!this.override) this.setDefaultText();
  }

  setDefaultText() {
    const caption = WORLD_PRESENTATION[this.worldMode]?.defaultCaption;
    if (!caption) return;
    this.korean.textContent = caption.korean;
    this.english.textContent = caption.local;
    this.element.classList.remove('multiline');
  }

  showOverride(korean, local = '') {
    this.override = true;
    this.korean.textContent = korean;
    this.english.textContent = local;
    this.element.classList.toggle('multiline', korean.includes('\n') || local.includes('\n'));
    this.visible = true;
    this.element.classList.add('visible');
    this.element.setAttribute('aria-hidden', 'false');
  }

  hideOverride() {
    this.override = true;
    this.visible = false;
    this.element.classList.remove('visible');
    this.element.setAttribute('aria-hidden', 'true');
  }

  clearOverride() {
    this.override = false;
    this.setDefaultText();
    this.visible = false;
    this.element.classList.remove('visible');
    this.element.setAttribute('aria-hidden', 'true');
  }

  update() {
    if (!this.cameraController.world) return;
    const distance = this.camera.position.distanceTo(this.cameraController.echoCenter);
    const characterFocused = this.cameraController.focused
      || [EXPERIENCE_STATES.CHARACTER_FOCUS, EXPERIENCE_STATES.CHARACTER_SWITCH]
        .includes(this.cameraController.state);
    const next = this.cameraController.state === EXPERIENCE_STATES.ECHO_ORBIT
      && !characterFocused
      && distance <= this.cameraController.proximityThreshold;
    if (!next) this.proximityActive = false;
    if (this.override) return;
    if (next === this.visible) return;
    this.visible = next;
    if (next && !this.proximityActive) {
      this.proximityActive = true;
      this.onDefaultShow();
    }
    this.element.classList.toggle('visible', next);
    this.element.setAttribute('aria-hidden', String(!next));
  }
}
