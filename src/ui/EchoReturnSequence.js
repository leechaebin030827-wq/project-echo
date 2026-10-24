import * as THREE from 'three';
import { INTRO_TEXT, TIMING } from '../intro/config.js';
import { RETURN_LINES } from '../content/WorldUiCopy.js';
import { cueDurationMs } from '../audio/EchoCuePlayer.js';
import { differenceHash, selectReturnFrames } from './ReturnFrameSelection.js';

const WIDTH = 450;
const HEIGHT = 800;
const FRAME_COUNT = 10;
const MAX_CANDIDATES = 60;
const ENDING_IMAGES = Array.from({ length: 5 }, (_, index) => `/ending/ending-${index + 1}.png`);

export class EchoReturnSequence {
  constructor(stage, renderer) {
    this.stage = stage;
    this.renderer = renderer;
    this.cuePlayer = null;
    this.overlay = document.createElement('section');
    this.overlay.className = 'echo-return';
    this.overlay.setAttribute('aria-label', 'ECHO 귀환');
    this.overlay.innerHTML = '<div class="echo-return-track"></div><div class="echo-return-question echo-caption"></div><div class="echo-return-images"></div><div class="echo-return-quote"></div>';
    this.stage.append(this.overlay);
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.context = this.canvas.getContext('2d');
    this.hashCanvas = document.createElement('canvas');
    this.hashCanvas.width = 9;
    this.hashCanvas.height = 8;
    this.hashContext = this.hashCanvas.getContext('2d', { willReadFrequently: true });
    this.candidates = [];
    this.lastCaptureAt = -Infinity;
    this.lastSceneCaptureAt = -Infinity;
    this.head = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.toCamera = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.timers = [];
    this.cancelled = false;
  }

  recordFrame(camera, cameraController, entities, world = 'unknown', now = performance.now()) {
    if (this.cancelled || now - this.lastCaptureAt < 700 || cameraController.transition) return;
    const source = this.renderer.domElement;
    const height = this.stage.clientHeight;
    if (!height || !source.width) return;
    if (now - this.lastSceneCaptureAt >= 1800) {
      const targetRatio = WIDTH / HEIGHT;
      const sourceRatio = source.width / source.height;
      const cropWidth = sourceRatio > targetRatio ? source.height * targetRatio : source.width;
      const cropHeight = sourceRatio > targetRatio ? source.height : source.width / targetRatio;
      const sx = (source.width - cropWidth) * .5;
      const sy = (source.height - cropHeight) * .5;
      this.context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, WIDTH, HEIGHT);
      const sceneHash = this.hashRegion(0, 0, WIDTH, HEIGHT);
      const previous = [...this.candidates].reverse().find((frame) =>
        frame.kind === 'world' && frame.world === world);
      if (!previous || previous.sceneHash !== sceneHash) {
        this.candidates.push({
          id: `world:${world}:${Math.round(now)}`, kind: 'world', world,
          score: 68, time: now, sceneHash, faceHash: null,
          source: this.canvas.toDataURL('image/jpeg', 0.86),
        });
      }
      this.lastSceneCaptureAt = now;
    }
    if (!entities?.length) {
      this.lastCaptureAt = now;
      return;
    }
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
      const sceneHash = this.hashRegion(0, 0, WIDTH, HEIGHT);
      const faceHash = this.hashRegion(WIDTH * .18, HEIGHT * .12, WIDTH * .64, HEIGHT * .42);
      this.candidates.push({
        id: face.id, kind: 'portrait', world,
        score: face.score, x: face.x, y: face.y, time: now,
        sceneHash, faceHash,
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

  hashRegion(x, y, width, height) {
    this.hashContext.drawImage(this.canvas, x, y, width, height, 0, 0, 9, 8);
    return differenceHash(this.hashContext.getImageData(0, 0, 9, 8));
  }

  selectFrames() {
    return selectReturnFrames(this.candidates, FRAME_COUNT);
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
    // Start loading the closing photographs before the timed flash sequence.
    ENDING_IMAGES.forEach((source) => {
      const image = new Image();
      image.src = source;
    });
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
    const totalNarrationMs = lines.reduce((total, _, index) =>
      total + cueDurationMs(`K${String(index + 10).padStart(2, '0')}`) + 90, 0);
    const showFrame = (index) => {
      const card = track.children[index];
      if (!card || this.cancelled) return;
      card.classList.add('visible');
      track.style.transform = `translateX(${-3 - index * 50.8}cqw)`;
    };
    if (frames.length) {
      showFrame(0);
      for (let index = 1; index < frames.length; index += 1) {
        const timer = window.setTimeout(() => {
          this.timers = this.timers.filter((item) => item !== timer);
          showFrame(index);
        }, totalNarrationMs * index / frames.length);
        this.timers.push(timer);
      }
    }
    for (let index = 0; index < lines.length; index += 1) {
      if (this.cancelled) return;
      const [korean, english] = lines[index];
      question.replaceChildren();
      const ko = document.createElement('p');
      ko.className = 'echo-caption-korean';
      ko.textContent = korean;
      const en = document.createElement('p');
      en.className = 'echo-caption-english';
      en.textContent = english;
      question.append(ko, en);
      question.classList.add('visible');
      const cueId = `K${String(index + 10).padStart(2, '0')}`;
      this.cuePlayer?.play(cueId);
      await this.delay(cueDurationMs(cueId) + 90);
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
    await this.delay(2500);
    if (this.cancelled) return;
    const images = this.overlay.querySelector('.echo-return-images');
    images.replaceChildren();
    for (const [index, source] of ENDING_IMAGES.entries()) {
      if (this.cancelled) return;
      const image = document.createElement('img');
      image.src = source;
      image.alt = `엔딩 이미지 ${index + 1}`;
      images.append(image);
      await this.delay(500);
    }
    if (this.cancelled) return;
    images.classList.add('is-fading');
    quote.classList.add('is-fading');
    await this.delay(800);
  }

  dispose() {
    this.cancelled = true;
    if (/^K1[0-4]$/.test(this.cuePlayer?.currentId ?? '')) this.cuePlayer.stop();
    this.stopTyping?.();
    this.stopTyping = null;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    this.candidates = [];
    this.overlay.remove();
  }
}
