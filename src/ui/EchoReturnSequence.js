import * as THREE from 'three';
import { INTRO_TEXT, TIMING } from '../intro/config.js';
import { RETURN_LINES } from '../content/WorldUiCopy.js';
import { cueDurationMs } from '../audio/EchoCuePlayer.js';
import { visitorFaceCutout } from '../world/shared/BillboardFaceTexture.js';
import {
  createMemoryComposition, differenceHash, missingReturnWorlds, selectReturnFrames,
} from './ReturnFrameSelection.js';

const WIDTH = 450;
const HEIGHT = 800;
const FRAME_COUNT = 10;
const MAX_CANDIDATES = 60;
const ENDING_IMAGES = Array.from({ length: 5 }, (_, index) => `/ending/ending-${index + 1}.png`);
const WORLD_MEMORY_BACKDROPS = Object.freeze({
  nevada: ['/ending/ending-2.png', '/ending/ending-3.png', '/ending/ending-4.png'],
  hamina: ['/ending/ending-1.png'],
  lightcable: ['/ending/ending-5.png'],
  kobe: ['/textures/kobe/tunnel/base-color.png'],
});
const WORLD_MEMORY_TINTS = Object.freeze({
  nevada: ['#d47f45', '#121938'],
  hamina: ['#b7eaff', '#173347'],
  lightcable: ['#1fd1df', '#031b37'],
  kobe: ['#ffb347', '#21101b'],
});

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load return backdrop: ${source}`));
    image.src = source;
  });
}

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

  drawCover(image, composition) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.max(WIDTH / imageWidth, HEIGHT / imageHeight) * composition.backgroundZoom;
    const sourceWidth = WIDTH / scale;
    const sourceHeight = HEIGHT / scale;
    const sx = THREE.MathUtils.clamp(imageWidth * composition.backgroundX - sourceWidth * .5,
      0, Math.max(0, imageWidth - sourceWidth));
    const sy = THREE.MathUtils.clamp(imageHeight * composition.backgroundY - sourceHeight * .5,
      0, Math.max(0, imageHeight - sourceHeight));
    this.context.drawImage(image, sx, sy, sourceWidth, sourceHeight, 0, 0, WIDTH, HEIGHT);
  }

  drawKobeDepth() {
    const { context } = this;
    context.save();
    const vanishingX = WIDTH * .5;
    const vanishingY = HEIGHT * .38;
    context.strokeStyle = 'rgba(255, 183, 83, .3)';
    context.lineWidth = 2;
    for (let index = -5; index <= 5; index += 1) {
      context.beginPath();
      context.moveTo(vanishingX, vanishingY);
      context.lineTo(vanishingX + index * WIDTH * .22, HEIGHT);
      context.stroke();
    }
    for (let index = 0; index < 9; index += 1) {
      const progress = index / 8;
      const y = vanishingY + progress ** 1.8 * (HEIGHT - vanishingY);
      context.globalAlpha = .15 + progress * .2;
      context.beginPath();
      context.moveTo(WIDTH * (.5 - progress * .55), y);
      context.lineTo(WIDTH * (.5 + progress * .55), y);
      context.stroke();
    }
    context.restore();
  }

  drawMemoryFace(face, composition) {
    if (!face?.width || !face?.height) return;
    const { context } = this;
    const ratio = face.width / face.height;
    const height = HEIGHT * composition.faceScale;
    const width = height * ratio;
    const draw = (x, y, scale, alpha, blur, blend = 'screen') => {
      context.save();
      context.translate(x, y);
      context.rotate(composition.rotation);
      context.scale(composition.mirror ? -1 : 1, 1);
      context.globalAlpha = alpha;
      context.globalCompositeOperation = blend;
      context.filter = `grayscale(.18) contrast(1.12) saturate(.76) blur(${blur}px)`;
      context.drawImage(face, -width * scale * .5, -height * scale * .5,
        width * scale, height * scale);
      context.restore();
    };
    const x = WIDTH * composition.faceX;
    const y = HEIGHT * composition.faceY;
    draw(x - WIDTH * .14, y - HEIGHT * .12, .62, .2, 2.4);
    draw(x + WIDTH * .13, y + HEIGHT * .08, .82, .28, 1.5);
    draw(x, y, 1, .82, .35, 'lighten');
  }

  makeFallbackFace(frame, points) {
    const cutout = visitorFaceCutout(frame, points);
    if (cutout) return cutout;
    if (!frame?.width || !frame?.height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 420;
    const context = canvas.getContext('2d');
    const cropWidth = Math.min(frame.width, frame.height * canvas.width / canvas.height);
    context.beginPath();
    context.ellipse(canvas.width * .5, canvas.height * .48, canvas.width * .46,
      canvas.height * .48, 0, 0, Math.PI * 2);
    context.clip();
    context.drawImage(frame, (frame.width - cropWidth) * .5, 0, cropWidth, frame.height,
      0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async addMissingWorldMemories(visitorFrame, facePoints) {
    const missingWorlds = missingReturnWorlds(this.candidates);
    if (!missingWorlds.length || !visitorFrame) return;
    const face = this.makeFallbackFace(visitorFrame, facePoints);
    if (!face) return;
    const times = this.candidates.map((frame) => frame.time).filter(Number.isFinite);
    const firstTime = times.length ? Math.min(...times) : performance.now() - 1000;
    const lastTime = times.length ? Math.max(...times) : performance.now();
    await Promise.all(missingWorlds.map(async (world, index) => {
      const sources = WORLD_MEMORY_BACKDROPS[world];
      const source = sources[Math.floor(Math.random() * sources.length)];
      let image;
      try { image = await loadImage(source); } catch { return; }
      const composition = createMemoryComposition(world);
      this.context.save();
      this.context.clearRect(0, 0, WIDTH, HEIGHT);
      this.drawCover(image, composition);
      if (world === 'kobe') this.drawKobeDepth();
      const [light, dark] = WORLD_MEMORY_TINTS[world];
      const tint = this.context.createLinearGradient(0, 0, WIDTH, HEIGHT);
      tint.addColorStop(0, `${light}66`);
      tint.addColorStop(.62, 'rgba(0, 0, 0, 0)');
      tint.addColorStop(1, `${dark}bb`);
      this.context.fillStyle = tint;
      this.context.fillRect(0, 0, WIDTH, HEIGHT);
      this.drawMemoryFace(face, composition);
      const vignette = this.context.createRadialGradient(WIDTH * .5, HEIGHT * .48, HEIGHT * .08,
        WIDTH * .5, HEIGHT * .48, HEIGHT * .68);
      vignette.addColorStop(.55, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,.72)');
      this.context.fillStyle = vignette;
      this.context.fillRect(0, 0, WIDTH, HEIGHT);
      this.context.restore();
      const span = Math.max(1, lastTime - firstTime);
      this.candidates.push({
        id: `memory:${world}:${index}:${Math.round(performance.now())}`,
        kind: 'memory', world, score: 84,
        time: firstTime + Math.random() * span,
        sceneHash: this.hashRegion(0, 0, WIDTH, HEIGHT),
        faceHash: this.hashRegion(WIDTH * .12, HEIGHT * .12, WIDTH * .76, HEIGHT * .62),
        source: this.canvas.toDataURL('image/jpeg', .88),
      });
    }));
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

  async play({
    onTypingStart = () => {}, onTypingEnd = () => {}, visitorFrame = null, facePoints = null,
  } = {}) {
    // Start loading the closing photographs before the timed flash sequence.
    ENDING_IMAGES.forEach((source) => {
      const image = new Image();
      image.src = source;
    });
    await this.addMissingWorldMemories(visitorFrame, facePoints);
    const frames = this.selectFrames();
    const track = this.overlay.querySelector('.echo-return-track');
    track.replaceChildren();
    for (const [index, frame] of frames.entries()) {
      const card = document.createElement('img');
      card.src = frame.source;
      card.alt = `관람 중 기록되거나 재구성된 얼굴 ${index + 1}`;
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
