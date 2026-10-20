import * as THREE from 'three';
import { INTRO_TEXT, TIMING } from '../intro/config.js';
import { RETURN_LINES } from '../content/WorldUiCopy.js';

const WIDTH = 450;
const HEIGHT = 800;
const FRAME_COUNT = 10;
const MAX_CANDIDATES = 50;

export class EchoReturnSequence {
  constructor(stage, renderer) {
    this.stage = stage;
    this.renderer = renderer;
    this.overlay = document.createElement('section');
    this.overlay.className = 'echo-return';
    this.overlay.setAttribute('aria-label', 'ECHO 귀환');
    this.overlay.innerHTML = '<div class="echo-return-track"></div><div class="echo-return-question echo-caption"></div><div class="echo-return-quote"></div>';
    this.stage.append(this.overlay);
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.context = this.canvas.getContext('2d');
    this.candidates = [];
    this.lastCaptureAt = -Infinity;
    this.head = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.toCamera = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.timers = [];
    this.cancelled = false;
  }

  recordFrame(camera, cameraController, entities, now = performance.now()) {
    if (this.cancelled || now - this.lastCaptureAt < 700 || cameraController.transition) return;
    const source = this.renderer.domElement;
    const height = this.stage.clientHeight;
    if (!height || !source.width || !entities?.length) return;
    const visibleFaces = [];
    for (const candidate of entities) {
      if (!candidate.root.visible || !candidate.getHeadWorldPosition) continue;
      candidate.getHeadWorldPosition(this.head);
      candidate.getHeadDirection(this.forward);
      this.toCamera.subVectors(camera.position, this.head);
      const distance = this.toCamera.length();
      const facing = this.forward.dot(this.toCamera.normalize());
      if (facing < 0.2 || distance > 28) continue;
      this.projected.copy(this.head).project(camera);
      if (this.projected.z <= -1 || this.projected.z >= 1
        || Math.abs(this.projected.x) > 0.84 || Math.abs(this.projected.y) > 0.78) continue;
      const focalPixels = height * camera.zoom
        / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      const facePixels = candidate.height * 0.24 * focalPixels / distance;
      if (facePixels < 34) continue;
      const center = 1 - Math.hypot(this.projected.x, this.projected.y) * 0.28;
      const score = facePixels * Math.max(0.2, facing) * center;
      const existing = this.candidates.filter((frame) => frame.id === candidate.id).length;
      if (existing >= 3) continue;
      visibleFaces.push({
        id: candidate.id, score, x: this.projected.x, y: this.projected.y,
        facePixels: facePixels * source.height / height,
        priority: score / (1 + existing * 2.5),
      });
    }
    if (!visibleFaces.length) return;
    visibleFaces.sort((a, b) => b.priority - a.priority);
    // Crop each visible face from the completed WebGL frame. The return scene
    // can then show different visitors instead of repeating whole-screen shots.
    for (const face of visibleFaces.slice(0, 2)) {
      const cropHeight = Math.min(source.height, Math.max(face.facePixels * 5.6, source.height * 0.22));
      const cropWidth = Math.min(source.width, cropHeight * WIDTH / HEIGHT);
      const headX = (face.x * 0.5 + 0.5) * source.width;
      const headY = (-face.y * 0.5 + 0.5) * source.height;
      const sx = THREE.MathUtils.clamp(headX - cropWidth * 0.5, 0, source.width - cropWidth);
      const sy = THREE.MathUtils.clamp(headY - cropHeight * 0.31, 0, source.height - cropHeight);
      this.context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, WIDTH, HEIGHT);
      this.candidates.push({
        id: face.id, score: face.score, x: face.x, y: face.y, time: now,
        source: this.canvas.toDataURL('image/jpeg', 0.84),
      });
    }
    this.lastCaptureAt = now;
    if (this.candidates.length > MAX_CANDIDATES) {
      const weakest = this.candidates.reduce((index, item, next) => (
        item.score < this.candidates[index].score ? next : index
      ), 0);
      this.candidates.splice(weakest, 1);
    }
  }

  selectFrames() {
    const remaining = [...this.candidates];
    const selected = [];
    while (remaining.length && selected.length < FRAME_COUNT) {
      let bestIndex = 0;
      let bestValue = -Infinity;
      remaining.forEach((candidate, index) => {
        const samePerson = selected.filter((frame) => frame.id === candidate.id).length;
        const nearestTime = selected.length
          ? Math.min(...selected.map((frame) => Math.abs(frame.time - candidate.time))) : Infinity;
        const value = candidate.score / (1 + samePerson * 4)
          + Math.min(nearestTime / 1000, 5) * 7;
        if (value > bestValue) { bestValue = value; bestIndex = index; }
      });
      selected.push(remaining.splice(bestIndex, 1)[0]);
    }
    selected.sort((a, b) => a.time - b.time);
    return selected;
  }

  delay(ms) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.timers = this.timers.filter((item) => item !== timer);
        resolve();
      }, ms);
      this.timers.push(timer);
    });
  }

  async play({ onTypingStart = () => {}, onTypingEnd = () => {} } = {}) {
    const frames = this.selectFrames();
    const track = this.overlay.querySelector('.echo-return-track');
    track.replaceChildren();
    for (const [index, frame] of frames.entries()) {
      const card = document.createElement('img');
      card.src = frame.source;
      card.alt = `관람 중 기록된 얼굴 ${index + 1}`;
      track.append(card);
    }
    this.overlay.classList.add('visible');
    const question = this.overlay.querySelector('.echo-return-question');
    const lines = RETURN_LINES;
    const steps = Math.max(frames.length, lines.length);
    let activeLine = -1;
    for (let index = 0; index < steps; index += 1) {
      if (this.cancelled) return;
      const card = track.children[index];
      if (card) {
        card.classList.add('visible');
        track.style.transform = `translateX(${-3 - index * 50.8}cqw)`;
      }
      const lineIndex = Math.min(lines.length - 1, Math.floor(index * lines.length / steps));
      if (lineIndex !== activeLine) {
        activeLine = lineIndex;
        const [korean, english] = lines[lineIndex];
        question.replaceChildren();
        const ko = document.createElement('p');
        ko.className = 'echo-caption-korean';
        ko.textContent = korean;
        const en = document.createElement('p');
        en.className = 'echo-caption-english';
        en.textContent = english;
        question.append(ko, en);
        question.classList.add('visible');
      }
      await this.delay(1700);
    }
    if (this.cancelled) return;
    this.overlay.classList.add('is-fading-to-quote');
    await this.delay(1400);
    if (this.cancelled) return;
    const quote = this.overlay.querySelector('.echo-return-quote');
    quote.innerHTML = '<p class="quote-korean"></p><p class="quote-english"></p><p class="quote-source"></p>';
    quote.querySelector('.quote-korean').textContent = INTRO_TEXT.quote.korean;
    this.overlay.classList.add('show-quote');
    await this.delay(700);
    this.stopTyping = onTypingEnd;
    onTypingStart();
    const type = async (selector, value) => {
      const element = quote.querySelector(selector);
      for (const character of value) {
        if (this.cancelled) return;
        element.textContent += character;
        await this.delay(24);
      }
    };
    await type('.quote-english', INTRO_TEXT.quote.english);
    if (this.cancelled) return;
    await this.delay(TIMING.QUOTE_SECTION_DELAY);
    await type('.quote-source', INTRO_TEXT.quote.source);
    this.stopTyping?.();
    this.stopTyping = null;
    if (this.cancelled) return;
    quote.classList.add('is-korean-visible');
    await this.delay(3000);
  }

  dispose() {
    this.cancelled = true;
    this.stopTyping?.();
    this.stopTyping = null;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    this.candidates = [];
    this.overlay.remove();
  }
}
