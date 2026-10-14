import { EXPERIENCE_STATES } from '../config.js';

export class EchoProximityCaption {
  constructor(element, camera, cameraController, voice = null) {
    this.element = element;
    this.camera = camera;
    this.cameraController = cameraController;
    this.voice = voice;
    this.visible = false;
    this.override = false;
    this.proximityActive = false;
    this.korean = element.querySelector('.echo-caption-korean');
    this.english = element.querySelector('.echo-caption-english');
  }

  showOverride(korean, english = '', clipId = null) {
    if (clipId) this.voice?.play(clipId);
    else this.voice?.stop();
    this.override = true;
    this.korean.textContent = korean;
    this.english.textContent = english;
    this.visible = true;
    this.element.classList.add('visible');
    this.element.setAttribute('aria-hidden', 'false');
  }

  hideOverride() {
    this.voice?.stop();
    this.override = true;
    this.visible = false;
    this.element.classList.remove('visible');
    this.element.setAttribute('aria-hidden', 'true');
  }

  clearOverride() {
    this.voice?.stop();
    this.override = false;
    this.korean.textContent = '클라우드 너머, 이곳에서 당신을 목격했어요.';
    this.english.textContent = 'Beyond the cloud, I saw you here.';
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
      this.voice?.play('echo_approach');
    }
    else this.voice?.stop();
    this.element.classList.toggle('visible', next);
    this.element.setAttribute('aria-hidden', String(!next));
  }
}
