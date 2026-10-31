import { AudioController } from './AudioController.js';
import { createCoverCameraArrayScene } from './CoverCameraArrayScene.js';
import { createIntroVisualLayer } from './IntroVisualLayer.js';
import { CAPTIONS, INTRO_TEXT, IntroState, STAGE, TIMING } from './config.js';

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

class CaptionController {
  constructor(element) {
    this.element = element;
    this.frame = 0;
    this.cueKey = '';
  }

  start(track, cues) {
    this.stop();
    const update = () => {
      const cue = cues.find(({ start, end }) => track.currentTime >= start && track.currentTime < end);
      const key = cue ? `${cue.start}-${cue.end}` : '';
      if (key !== this.cueKey) {
        this.cueKey = key;
        this.element.classList.toggle('is-visible', Boolean(cue));
        this.element.innerHTML = cue
          ? `<p class="caption-korean">${cue.ko}</p><p class="caption-english">${cue.en}</p>`
          : '';
      }
      if (!track.paused && !track.ended) this.frame = requestAnimationFrame(update);
    };
    update();
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.cueKey = '';
    this.element.classList.remove('is-visible');
    this.element.replaceChildren();
  }
}

function createTypingQuote({ onFinished, onTypingStart, onTypingEnd }) {
  const element = document.createElement('section');
  element.className = 'typing-quote is-hidden';
  element.innerHTML = `
    <p class="quote-korean">${INTRO_TEXT.quote.korean}</p>
    <p class="quote-english"></p>
    <p class="quote-source"></p>`;
  let timers = [];
  const pause = (duration) => new Promise((resolve) => timers.push(window.setTimeout(resolve, duration)));
  const type = async (selector, text) => {
    const target = element.querySelector(selector);
    target.textContent = '';
    for (const character of text) {
      target.textContent += character;
      await pause(TIMING.QUOTE_TYPING_SPEED);
    }
  };
  return {
    element,
    async play() {
      element.classList.remove('is-hidden', 'is-fading');
      onTypingStart?.();
      await type('.quote-english', INTRO_TEXT.quote.english);
      await pause(TIMING.QUOTE_SECTION_DELAY);
      await type('.quote-source', INTRO_TEXT.quote.source);
      onTypingEnd?.();
      element.classList.add('is-korean-visible');
      onFinished?.();
    },
    fadeOut() { element.classList.add('is-fading'); },
    destroy() { timers.forEach(clearTimeout); timers = []; },
  };
}

function createCoverTypewriter({ quote, citation, question }) {
  const quoteText = 'When it comes to online data,\nthere is no equivalent sense of\na place where something resides…';
  const citationText = '— William Odom et al., Lost in Translation: Understanding the Possession of Digital Things in the Cloud, CHI 2012, p. 785.';
  const questionText = '내 삶의 일부라 여겨온 기록들이 내가 한 번도 가본 적 없는 장소에서, 타인이 운영하는 시스템에 의존해 존재한다면,\n\n디지털 시대에 무언가를 ‘소유한다’는 것은 과연 무엇을 의미하는가?';
  let timers = [];
  let stopped = false;

  const schedule = (callback, delay) => {
    const timer = window.setTimeout(callback, delay);
    timers.push(timer);
  };
  const typeText = (element, text, speed, onComplete) => {
    let index = 0;
    element.textContent = '';
    const typeNext = () => {
      if (stopped) return;
      index += 1;
      element.textContent = text.slice(0, index);
      if (index < text.length) schedule(typeNext, speed);
      else onComplete?.();
    };
    schedule(typeNext, speed);
  };
  const typeSequence = (items, onComplete) => {
    const runItem = (index) => {
      if (index >= items.length) {
        onComplete();
        return;
      }
      const item = items[index];
      typeText(item.element, item.text, item.speed, () => {
        schedule(() => runItem(index + 1), item.pauseAfter ?? 180);
      });
    };
    runItem(0);
  };
  const scheduleReplay = (initial = false) => {
    const delay = initial
      ? 6500 + Math.random() * 4500
      : 15000 + Math.random() * 9000;
    schedule(play, delay);
  };
  const play = () => {
    if (stopped) return;
    let completedTracks = 0;
    const finishTrack = () => {
      completedTracks += 1;
      if (completedTracks === 2) scheduleReplay();
    };
    typeSequence([
      { element: quote, text: quoteText, speed: 25, pauseAfter: 260 },
      { element: citation, text: citationText, speed: 16 },
    ], finishTrack);
    typeSequence([
      { element: question, text: questionText, speed: 29 },
    ], finishTrack);
  };

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) scheduleReplay(true);

  return {
    stop() {
      stopped = true;
      timers.forEach(window.clearTimeout);
      timers = [];
    },
    destroy() {
      stopped = true;
      timers.forEach(window.clearTimeout);
      timers = [];
    },
  };
}

function createTitle(callbacks) {
  const coverAssets = [
    ['project-p.svg', 83, 97.52],
    ['project-r.svg', 218.6, 97.52],
    ['project-o.svg', 351.48, 95],
    ['project-j.svg', 492.51, 97.52],
    ['project-e.svg', 601.66, 97.52],
    ['project-c.svg', 736, 95],
    ['project-t.svg', 881, 97.52],
    ['echo-e.svg', 83, 315],
    ['echo-c.svg', 326.9, 312],
    ['echo-h.svg', 592, 315],
    ['echo-o.svg', 852, 312],
    ['dot-small.svg', 252, 387],
    ['dot-wide.svg', 516, 387],
    ['dot-small.svg', 777, 387],
    ['korean-scattered.svg', 625, 579],
    ['korean-ours.svg', 496, 774],
    ['korean-manifestation.svg', 84, 1331],
    ['hanja-manifestation.svg', 403, 1617],
    ['rule-long.svg', 84, 1718.5],
    ['rule-short.svg', 914, 1718.5],
  ];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'start-title';
  button.setAttribute('aria-label', 'Start Project ECHO introduction');
  const artwork = document.createElement('span');
  artwork.className = 'start-title__camera-array';
  artwork.setAttribute('aria-hidden', 'true');
  const backgroundVideo = document.createElement('video');
  backgroundVideo.className = 'start-title__background-video';
  backgroundVideo.src = '/intro/assets/opening/opening-background-pingpong.mp4';
  backgroundVideo.autoplay = true;
  backgroundVideo.loop = true;
  backgroundVideo.muted = true;
  backgroundVideo.defaultPlaybackRate = 0.5;
  backgroundVideo.playbackRate = 0.5;
  backgroundVideo.playsInline = true;
  backgroundVideo.preload = 'auto';
  const cameraArrayCanvas = document.createElement('canvas');
  cameraArrayCanvas.className = 'start-title__camera-array-canvas';
  artwork.append(backgroundVideo, cameraArrayCanvas);
  backgroundVideo.play().catch(() => {});
  coverAssets.forEach(([filename, x, y]) => {
    const image = document.createElement('img');
    image.className = 'start-title__camera-array-asset';
    image.src = `/intro/assets/cover-figma/${filename}`;
    image.alt = '';
    image.style.left = `${x}px`;
    image.style.top = `${y}px`;
    artwork.append(image);
  });
  artwork.insertAdjacentHTML('beforeend', `
    <p class="start-title__quote">When it comes to online data,<br>there is no equivalent sense of<br>a place where something resides…</p>
    <p class="start-title__citation">— William Odom et al., Lost in Translation: Understanding the Possession of Digital Things in the Cloud, CHI 2012, p. 785.</p>
    <p class="start-title__question">내 삶의 일부라 여겨온 기록들이 내가 한 번도 가본 적 없는 장소에서, 타인이 운영하는 시스템에 의존해 존재한다면,<br><br>디지털 시대에 무언가를 ‘소유한다’는 것은 과연 무엇을 의미하는가?</p>`);
  const coverTypewriter = createCoverTypewriter({
    quote: artwork.querySelector('.start-title__quote'),
    citation: artwork.querySelector('.start-title__citation'),
    question: artwork.querySelector('.start-title__question'),
  });
  const accessibleText = document.createElement('span');
  accessibleText.className = 'start-title__accessible-text';
  accessibleText.textContent = INTRO_TEXT.title;
  button.append(artwork, accessibleText);
  const cameraArrayScene = createCoverCameraArrayScene(cameraArrayCanvas);
  button.coverScene = {
    stop() {
      backgroundVideo.pause();
      cameraArrayScene.stop();
      coverTypewriter.stop();
    },
    destroy() {
      backgroundVideo.pause();
      backgroundVideo.removeAttribute('src');
      backgroundVideo.load();
      cameraArrayScene.destroy();
      coverTypewriter.destroy();
    },
  };

  button.addEventListener('pointerleave', callbacks.onLeave);
  button.addEventListener('pointerenter', callbacks.onHover);
  button.addEventListener('click', callbacks.onClick);
  return button;
}

function createCamera({ onShutterHover, onShutter }) {
  const element = document.createElement('section');
  element.className = 'intro-camera is-hidden';
  element.innerHTML = `
    <video autoplay playsinline muted aria-label="Camera preview"></video>
    <div class="camera-guidance" aria-live="polite">
      <p class="camera-guidance__korean">정면을 바라보고 얼굴이 선명하게 보이도록 맞춰 주세요.</p>
      <p class="camera-guidance__english">Center your face and look straight at the camera.</p>
    </div>
    <button class="intro-shutter" type="button" aria-label="Take photo" disabled></button>`;
  const video = element.querySelector('video');
  const shutter = element.querySelector('button');
  const ko = element.querySelector('.camera-guidance__korean');
  const en = element.querySelector('.camera-guidance__english');
  shutter.addEventListener('pointerenter', onShutterHover);
  shutter.addEventListener('click', onShutter);
  let stream = null;

  return {
    element,
    video,
    async start() {
      element.classList.remove('is-hidden', 'camera-unavailable');
      shutter.disabled = true;
      ko.textContent = '카메라를 준비하고 있습니다.';
      en.textContent = 'Preparing the camera.';
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 960 }, height: { ideal: 1200 }, facingMode: 'user' },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        shutter.disabled = false;
        shutter.classList.add('is-ready');
        ko.textContent = '좋아요. 정면을 바라보고 촬영해 주세요.';
        en.textContent = 'Hold still and look straight at the camera.';
        return true;
      } catch {
        element.classList.add('camera-unavailable');
        ko.textContent = '카메라 권한을 허용한 뒤 다시 시도해 주세요.';
        en.textContent = 'Allow camera access, then try again.';
        return false;
      }
    },
    setProcessing() {
      shutter.disabled = true;
      shutter.classList.remove('is-ready');
      ko.textContent = '얼굴을 확인하고 있습니다.';
      en.textContent = 'Checking your face.';
    },
    setError(message) {
      shutter.disabled = false;
      ko.textContent = message;
      en.textContent = 'Please center your face clearly and try again.';
    },
    capture() {
      if (!stream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        throw new Error('카메라가 준비될 때까지 잠시 기다려 주세요.');
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      return canvas;
    },
    isReady() {
      return Boolean(stream) && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    },
    stop() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.pause();
      video.srcObject = null;
      shutter.classList.remove('is-ready');
      element.classList.add('is-hidden');
    },
  };
}

function createCaptureConfirm({ onConsentHover, onConsent, onReject }) {
  const element = document.createElement('section');
  element.className = 'intro-capture-confirm is-hidden';
  element.innerHTML = `
    <div class="consent-dialog" role="dialog" aria-label="Cloud upload consent">
      <p class="consent-title">촬영된 사진을 클라우드에 업로드하시겠습니까?</p>
      <p class="consent-description">업로드된 사진은 클라우드 서버에 저장되며, 서비스 제공 및 데이터 보호를 위해 처리·전송·복제될 수 있습니다. 저장 위치는 서비스 운영에 따라 변경될 수 있으며, 삭제 후에도 백업 시스템에서 완전히 제거되기까지 일정 시간이 소요될 수 있습니다.</p>
      <div class="consent-actions">
        <button type="button" data-action="no">취소</button>
        <button type="button" data-action="yes">업로드</button>
      </div>
    </div>`;
  const yesButton = element.querySelector('[data-action="yes"]');
  const noButton = element.querySelector('[data-action="no"]');
  [yesButton, noButton].forEach((button) => button.addEventListener('pointerenter', onConsentHover));
  yesButton.addEventListener('click', onConsent);
  noButton.addEventListener('click', onReject);
  return {
    element,
    show() { element.classList.remove('is-hidden'); },
    hide() { element.classList.add('is-hidden'); },
  };
}

class IntroController {
  constructor({ view, audio, captions, onCapture, onReject, onLoading, onIntroComplete }) {
    this.view = view;
    this.audio = audio;
    this.captions = captions;
    this.onCapture = onCapture;
    this.onReject = onReject;
    this.onLoading = onLoading;
    this.onIntroComplete = onIntroComplete;
    this.state = IntroState.OPENING_IMAGE;
    this.openingTriggered = false;
    this.openingMusicPreviewed = false;
    this.destroyed = false;
    this.capturePending = false;
    this.narration2Frame = 0;
    this.enableTitleHover = () => {
      this.view.title.classList.add('is-hover-enabled');
      if (this.view.title.matches(':hover')) this.titleHover();
    };
    this.boundNarration1End = () => {
      if (this.state === IntroState.NARRATION_1) this.enterCamera();
    };
    this.boundNarration2End = () => {
      if (this.state === IntroState.NARRATION_2) this.transition(IntroState.LOADING);
    };
    audio.narration1.addEventListener('ended', this.boundNarration1End);
    audio.narration2.addEventListener('ended', this.boundNarration2End);
  }

  async beginOpening() {
    if (this.openingTriggered || this.state !== IntroState.OPENING_IMAGE) return;
    this.openingTriggered = true;
    this.audio.primeFromGesture();
    this.audio.playUi('uiClick');
    this.transition(IntroState.INTRO_START);
    this.audio.startNarration1AndMusic();
    this.view.visualLayer.startNarration1(this.audio.narration1);
    this.view.split.classList.add('is-open');
    this.view.opening.classList.add('is-leaving');
    this.view.title.classList.add('is-leaving');
    this.view.visualLayer.fadeOpening();
    await wait(TIMING.INTRO_SPLIT_DURATION);
    if (this.destroyed) return;
    this.view.opening.classList.add('is-hidden');
    this.view.title.classList.add('is-hidden');
    this.view.title.coverScene?.stop();
    this.view.split.classList.add('is-hidden');
    this.transition(IntroState.NARRATION_1);
    this.captions.start(this.audio.narration1, CAPTIONS.narration1);
  }

  async previewOpeningMusic() {
    if (this.state !== IntroState.OPENING_IMAGE || this.openingMusicPreviewed) return;
    this.openingMusicPreviewed = true;
    const started = await this.audio.previewIntroMusic();
    if (!started) this.openingMusicPreviewed = false;
  }

  async quoteFinished() {
    this.transition(IntroState.QUOTE_HOLD);
    await wait(TIMING.QUOTE_HOLD_DURATION);
    this.transition(IntroState.QUOTE_FADE_OUT);
    this.view.quote.fadeOut();
    await wait(TIMING.QUOTE_FADE_DURATION);
    this.transition(IntroState.START_TITLE_FADE_IN);
    this.view.title.classList.remove('is-hidden');
    await wait(TIMING.TITLE_FADE_DURATION);
    this.transition(IntroState.START_TITLE_IDLE);
    window.addEventListener('pointermove', this.enableTitleHover, { once: true, passive: true });
  }

  titleHover() {
    if (this.state !== IntroState.START_TITLE_IDLE) return;
    this.audio.playUi('uiHover');
    this.audio.previewIntroMusic();
  }
  titleLeave() {
    if (this.state === IntroState.START_TITLE_IDLE) this.audio.stopIntroMusicPreview();
  }

  async titleClick() {
    if (this.state !== IntroState.START_TITLE_IDLE) return;
    window.removeEventListener('pointermove', this.enableTitleHover);
    this.view.title.classList.remove('is-hover-enabled');
    this.transition(IntroState.INTRO_START);
    this.audio.playUi('uiClick');
    this.audio.startNarration1AndMusic();
    this.view.visualLayer.startNarration1(this.audio.narration1);
    this.view.split.classList.add('is-open');
    await wait(TIMING.INTRO_SPLIT_DURATION);
    this.view.title.classList.add('is-hidden');
    this.view.title.coverScene?.stop();
    this.view.split.classList.add('is-hidden');
    this.transition(IntroState.NARRATION_1);
    this.captions.start(this.audio.narration1, CAPTIONS.narration1);
  }

  async enterCamera() {
    if (this.destroyed || this.state === IntroState.CAMERA) return;
    this.captions.stop();
    this.view.visualLayer.stopNarration1();
    this.transition(IntroState.CAMERA);
    const started = await this.view.camera.start();
    if (started) this.view.visualLayer.showCamera(this.view.camera.video);
  }

  async capture() {
    if (this.state !== IntroState.CAMERA || this.capturePending) return;
    this.audio.playUi('uiClick');
    this.capturePending = true;
    this.view.camera.setProcessing();
    let frame;
    try {
      frame = this.view.camera.capture();
      await this.onCapture?.(frame);
    } catch (error) {
      this.view.camera.setError(error.message || '얼굴을 확인할 수 없습니다. 다시 촬영해 주세요.');
      this.capturePending = false;
      return;
    }
    this.view.camera.stop();
    this.view.visualLayer.showCapture(frame);
    this.transition(IntroState.CAPTURE_CONFIRM);
    this.view.captureConfirm.show();
    this.capturePending = false;
  }

  async consent() {
    if (this.state !== IntroState.CAPTURE_CONFIRM) return;
    this.audio.playUi('uiClick');
    this.view.captureConfirm.hide();
    this.transition(IntroState.NARRATION_2);
    const startRequest = this.audio.startNarration2AndMusic();
    this.view.visualLayer.startNarration2(this.audio.narration2);
    if (await startRequest) {
      this.captions.start(this.audio.narration2, CAPTIONS.narration2);
      this.monitorNarration2End();
    } else {
      this.transition(IntroState.LOADING);
    }
  }

  async rejectConsent() {
    if (this.state !== IntroState.CAPTURE_CONFIRM) return;
    this.audio.playUi('uiClick');
    this.view.captureConfirm.hide();
    await this.onReject?.();
    this.transition(IntroState.CAMERA);
    const started = await this.view.camera.start();
    if (started) this.view.visualLayer.showCamera(this.view.camera.video);
  }

  monitorNarration2End() {
    cancelAnimationFrame(this.narration2Frame);
    const finalCaptionEnd = CAPTIONS.narration2.at(-1).end;
    const check = () => {
      if (this.state !== IntroState.NARRATION_2) return;
      if (this.audio.narration2.currentTime >= finalCaptionEnd) {
        this.audio.narration2.pause();
        this.transition(IntroState.LOADING);
        return;
      }
      this.narration2Frame = requestAnimationFrame(check);
    };
    check();
  }

  transition(next) {
    if (this.destroyed) return;
    this.state = next;
    this.view.root.dataset.introState = next;
    if (next === IntroState.LOADING) {
      cancelAnimationFrame(this.narration2Frame);
      this.captions.stop();
      this.view.visualLayer.showBlank();
      this.view.loading.classList.remove('is-hidden');
      Promise.resolve(this.onLoading?.(this)).catch((error) => {
        console.error('[Intro] handoff failed', error);
        this.view.loading.textContent = '연결할 수 없습니다. 페이지를 새로고침해 주세요.';
      });
    }
  }

  complete() {
    if (this.state !== IntroState.LOADING) return;
    this.transition(IntroState.INTRO_COMPLETE);
    this.onIntroComplete?.();
  }

  destroy({ preserveMusic = false } = {}) {
    this.destroyed = true;
    window.removeEventListener('pointermove', this.enableTitleHover);
    cancelAnimationFrame(this.narration2Frame);
    this.view.camera.stop();
    this.view.quote.destroy();
    this.captions.stop();
    this.audio.narration1.removeEventListener('ended', this.boundNarration1End);
    this.audio.narration2.removeEventListener('ended', this.boundNarration2End);
    this.view.title.coverScene?.destroy();
    if (!preserveMusic) this.audio.destroy();
    this.view.visualLayer.destroy();
  }
}

export class IntroExperience {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.root.innerHTML = `
      <div class="intro-stage-host"><div class="intro-stage"></div></div>
      <div class="intro-text-host"><div class="intro-stage intro-text-stage"></div></div>
      <div class="intro-caption-host"><div class="intro-stage intro-caption-stage"><section class="caption-layer" aria-live="polite"></section></div></div>`;
    this.stageHost = root.querySelector('.intro-stage-host');
    this.stage = root.querySelector('.intro-stage');
    this.textHost = root.querySelector('.intro-text-host');
    this.textStage = root.querySelector('.intro-text-stage');
    this.captionHost = root.querySelector('.intro-caption-host');
    this.captionStage = root.querySelector('.intro-caption-stage');

    const visualLayer = createIntroVisualLayer(root);
    root.prepend(visualLayer.element);
    const opening = document.createElement('div');
    opening.className = 'opening-image';
    const split = document.createElement('div');
    split.className = 'split-transition';
    split.innerHTML = '<div class="split-panel split-top"></div><div class="split-panel split-bottom"></div>';
    const loading = document.createElement('section');
    loading.className = 'intro-loading is-hidden';
    loading.textContent = 'LOADING...';

    const audio = new AudioController();
    const captions = new CaptionController(root.querySelector('.caption-layer'));
    let controller;
    const quote = createTypingQuote({
      onFinished: () => controller?.quoteFinished(),
      onTypingStart: () => audio.playTyping(),
      onTypingEnd: () => audio.stopTyping(),
    });
    const title = createTitle({
      onHover: () => controller?.titleHover(),
      onLeave: () => controller?.titleLeave(),
      onClick: () => controller?.titleClick(),
    });
    const camera = createCamera({
      onShutterHover: () => {
        if (controller?.state === IntroState.CAMERA) audio.playUi('uiHover');
      },
      onShutter: () => controller?.capture(),
    });
    const captureConfirm = createCaptureConfirm({
      onConsentHover: () => {
        if (controller?.state === IntroState.CAPTURE_CONFIRM) audio.playUi('uiHover');
      },
      onConsent: () => controller?.consent(),
      onReject: () => controller?.rejectConsent(),
    });
    this.stage.append(camera.element, captureConfirm.element, split, opening);
    this.textStage.append(quote.element, title, loading);

    controller = new IntroController({
      view: { root, opening, quote, title, camera, captureConfirm, loading, split, visualLayer },
      audio,
      captions,
      onCapture: callbacks.onCapture,
      onReject: callbacks.onReject,
      onLoading: callbacks.onLoading,
      onIntroComplete: () => this.finish(),
    });
    this.controller = controller;

    this.onOpeningMove = () => controller.previewOpeningMusic();
    this.onOpeningClick = () => controller.beginOpening();
    root.addEventListener('pointermove', this.onOpeningMove, { passive: true });
    root.addEventListener('pointerdown', this.onOpeningClick);

    this.resize = this.resize.bind(this);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(root);
    this.resize();
  }

  resize() {
    const scale = Math.min(this.root.clientWidth / STAGE.width, this.root.clientHeight / STAGE.height);
    const width = STAGE.width * scale;
    const height = STAGE.height * scale;
    for (const host of [this.stageHost, this.textHost, this.captionHost]) {
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
    }
    for (const stage of [this.stage, this.textStage, this.captionStage]) {
      stage.style.transform = `scale(${scale})`;
    }
  }

  finish() {
    this.controller.audio.handoffToWorld(TIMING.HANDOFF_FADE_DURATION);
    this.root.classList.add('is-handing-off');
    window.setTimeout(() => {
      this.destroy({ preserveMusic: true });
      this.callbacks.onComplete?.();
    }, TIMING.HANDOFF_FADE_DURATION);
  }

  destroy({ preserveMusic = false } = {}) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver.disconnect();
    this.root.removeEventListener('pointermove', this.onOpeningMove);
    this.root.removeEventListener('pointerdown', this.onOpeningClick);
    this.controller.destroy({ preserveMusic });
    this.root.hidden = true;
    this.root.replaceChildren();
  }
}
