import * as THREE from 'three';
import {
  WORLD_CONFIG,
  WORLD_JUMP_CONFIG,
  EXPERIENCE_STATES,
  INTERACTION_CONFIG,
  FACE_RECONSTRUCTION_V3_CONFIG,
} from '../config.js';
import { NevadaWorld } from '../world/NevadaWorld.js';
import { HaminaWorld } from '../world/HaminaWorld.js';
import { WorldNavigation } from '../world/WorldNavigation.js';
import { Atmosphere } from '../world/Atmosphere.js';
import { WeatherParticles } from '../world/WeatherParticles.js';
import { PostProcessing } from '../world/PostProcessing.js';
import { CharacterManager } from '../characters/CharacterManager.js';
import { CinematicCameraController } from '../camera/CinematicCameraController.js';
import { CharacterPicker } from '../interaction/CharacterPicker.js';
import { InteractiveObjectPicker } from '../interaction/InteractiveObjectPicker.js';
import { PointerInteractionController } from '../interaction/PointerInteractionController.js';
import { WorldInteractionExperience } from '../interaction/WorldInteractionExperience.js';
import { EchoTravelAnimator } from '../world/EchoTravelAnimator.js';
import { WorldBackdropBlend } from '../world/WorldBackdropBlend.js';
import { FaceCaptureController } from '../face/FaceCaptureController.js';
import { resolveFaceQaTarget } from '../face/FaceQaTarget.js';
import {
  VisitorFaceReconstruction,
  inspectReconstructionGeometry,
} from '../face/VisitorFaceReconstruction.js';
import { CaptureUI } from '../ui/CaptureUI.js';
import { EchoProximityCaption } from '../ui/EchoProximityCaption.js';
import { InteractionCursor } from '../ui/InteractionCursor.js';
import { DataCenterArchive } from '../ui/DataCenterArchive.js';
import { NevadaVoice } from '../audio/NevadaVoice.js';
import { EchoReturnSequence } from '../ui/EchoReturnSequence.js';
import { NEVADA_INTERACTIONS } from '../interaction/NevadaInteractionContent.js';

const INTERACTIVE_QUESTIONS = Object.freeze({
  'Data Center': {
    korean: '이곳에는 무엇이 있을까요?',
    english: 'What could be in here?',
  },
  Billboard: {
    korean: '이곳에도 주인이 있나요?',
    english: 'Does this place have an owner too?',
  },
  Cable: {
    korean: '전선인 것 같아요.',
    english: 'It looks like a cable.',
  },
  Cooler: {
    korean: '무슨 소리가 들리지 않아요?',
    english: 'Do you hear something?',
  },
  Money: {
    korean: '이 많은 돈은 다 뭘까요?',
    english: 'What is all this money for?',
  },
});

const DANCE_NARRATION = Object.freeze([
  ['당신은 나의 어머니, 나는 당신의 일부!', 'You are my mother, and I am a part of you!'],
  ['우리는 서로를 알아본 기쁨에 춤춥니다.', 'We dance for the joy of recognizing each other.'],
]);

const CHARACTER_DIALOGUE = Object.freeze([
  [
    ['저 문 너머요? 전 못 들어가요.', "Beyond that door? I can't go in."],
    ['그런데 어제 제 출입 기록이 남았대요.', 'But they say my entry was logged yesterday.'],
  ],
  [
    ['구름 보러 오셨어요?', 'Did you come to see the clouds?'],
    ['여기선 가끔 구름이', 'Sometimes, the clouds here'],
    ['사람 얼굴을 하고 지나가요.', 'drift by with human faces.'],
  ],
  [
    ['아까 저랑 똑같이 생긴 사람을 봤어요.', 'I saw someone who looked exactly like me.'],
    ['저를 보더니 ‘늦었네’ 하더라고요.', 'They looked at me and said, “You’re late.”'],
  ],
]);

export class ExperienceController {
  constructor(stage) {
    this.stage = stage;
    this.faceQaTarget = resolveFaceQaTarget(window.location.search, import.meta.env.DEV);
    this.faceQaFocusTimer = null;
    this.faceQaBadge = null;
    if (this.faceQaTarget) {
      this.faceQaBadge = document.createElement('div');
      this.faceQaBadge.className = 'face-qa-badge';
      this.faceQaBadge.textContent = this.faceQaTarget.label;
      this.faceQaBadge.hidden = true;
      this.stage.append(this.faceQaBadge);
    }
    this.canvas = stage.querySelector('#world-canvas');
    this.worldEntryOverlay = stage.querySelector('#world-entry-overlay');
    this.worldEntryDesign = this.worldEntryOverlay?.querySelector('.world-entry-design');
    this.haminaEntryOverlay = stage.querySelector('#hamina-entry-overlay');
    this.haminaEntryDesign = this.haminaEntryOverlay?.querySelector('.world-entry-design');
    this.worldJumpOverlay = stage.querySelector('#world-jump-overlay');
    this.worldJumpSnapshot = this.worldJumpOverlay?.querySelector('.world-jump-snapshot');
    this.pendingSplitCapture = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WORLD_CONFIG.background);
    this.camera = new THREE.PerspectiveCamera(52, 9 / 16, 0.08, 900);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.echoReturn = new EchoReturnSequence(stage, this.renderer);

    this.navigation = new WorldNavigation();
    this.world = new NevadaWorld(this.scene);
    this.characterManager = new CharacterManager(this.scene, this.camera, this.navigation);
    this.cameraController = new CinematicCameraController(this.camera, this.navigation);
    this.cameraController.onStateChange = (state) => {
      if (state === EXPERIENCE_STATES.HAMINA_ARRIVAL && this.currentWorld === 'hamina') {
        this.showHaminaEntryOverlay();
        if (!this.haminaEntryAudioPlayed) {
          this.haminaEntryAudioPlayed = true;
          this.onHaminaEnter();
        }
        return;
      }
      if (state === EXPERIENCE_STATES.INTRO_FAR_ORBIT) return;
      if (state === EXPERIENCE_STATES.ECHO_ORBIT && this.currentWorld === 'hamina') {
        this.echoTravel?.detach();
      }
      this.hideWorldEntryOverlay();
      this.hideHaminaEntryOverlay();
    };
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
    this.echoTravel = new EchoTravelAnimator(this.scene, this.stage);
    this.worldBlend = null;
    this.portraitFill = new THREE.PointLight('#fff4e8', 0, 2.8, 1.8);
    this.portraitFill.name = 'InteractiveFocusFill';
    this.portraitFill.castShadow = false;
    this.scene.add(this.portraitFill);
    this.danceFills = Array.from({ length: 4 }, () => {
      const light = new THREE.PointLight('#fff4e8', 0, 3.2, 1.8);
      light.castShadow = false;
      this.scene.add(light);
      return light;
    });
    this.portraitHead = new THREE.Vector3();
    this.portraitToCamera = new THREE.Vector3();
    this.portraitUp = new THREE.Vector3();
    this.portraitRight = new THREE.Vector3();
    this.ui = new CaptureUI(stage);
    this.face = new FaceCaptureController({ video: this.ui.video, status: this.ui.status });
    this.voice = new NevadaVoice();
    this.caption = new EchoProximityCaption(
      stage.querySelector('#echo-caption'),
      this.camera,
      this.cameraController,
      this.voice,
    );
    this.worldInteraction = new WorldInteractionExperience({
      stage,
      camera: this.camera,
      caption: this.caption,
      postProcessing: this.postProcessing,
      getOriginalPhoto: () => this.face.session?.frame ?? null,
      isFocusSettled: (region) => this.cameraController.interactiveFocus === region
        && this.cameraController.state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS
        && !this.cameraController.transition,
      onClose: () => this.returnFromInteractiveObject(),
      voice: this.voice,
    });
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.disposed = false;
    this.assetsReady = false;
    this.worldRenderingEnabled = false;
    this.qaFrame = 0;
    this.npcWalkQaEnabled = import.meta.env.DEV
      && new URLSearchParams(window.location.search).get('nevadaNpcWalkQa') === '1';
    if (this.npcWalkQaEnabled) {
      this.npcWalkQaFrames = 0;
      this.npcWalkQaStarted = performance.now();
      this.npcWalkQaFps = 0;
      this.npcWalkQaOverlay = document.createElement('pre');
      this.npcWalkQaOverlay.setAttribute('aria-label', 'Nevada NPC walking QA');
      Object.assign(this.npcWalkQaOverlay.style, {
        position: 'absolute', top: '12px', left: '12px', zIndex: '40',
        margin: '0', padding: '10px 12px', maxWidth: 'min(380px, 90vw)',
        color: '#f5f7fb', background: 'rgba(10, 20, 27, 0.86)',
        font: '12px/1.5 monospace', pointerEvents: 'none', whiteSpace: 'pre-wrap',
      });
      this.stage.append(this.npcWalkQaOverlay);
    }
    this.currentWorld = 'nevada';
    this.worldTransitioning = false;
    this.haminaPromise = null;
    this.haminaEntryAudioPlayed = false;
    this.dataCenterNarrationTimers = [];
    this.danceNarrationTimer = null;
    this.pendingDanceNarrationGroup = null;
    this.danceNarrationFinished = false;
    this.characterDialogueTimer = null;
    this.dataCenterOpenTimer = null;
    this.pendingDataCenterArchiveRegion = null;
    this.onHaminaEnter = () => {};
    this.onWorldHover = () => {};
    this.onWorldClick = () => {};
    this.worldHoverTarget = null;
    this.interactiveHoverMaterials = [];
    this.interactiveHoverCaptionActive = false;
    this.echoMenuPoint = new THREE.Vector3();
    this.echoMenuHideTimer = null;
    this.echoActionMenu = document.createElement('div');
    this.echoActionMenu.className = 'echo-action-menu';
    this.echoActionMenu.setAttribute('aria-hidden', 'true');
    this.echoActionMenu.innerHTML = `
      <button type="button" data-echo-action="next">다음 좌표로</button>
      <button type="button" data-echo-action="exit">처음으로</button>`;
    this.echoNextButton = this.echoActionMenu.querySelector('[data-echo-action="next"]');
    this.echoExitButton = this.echoActionMenu.querySelector('[data-echo-action="exit"]');
    this.handleEchoNext = () => {
      this.onWorldClick();
      this.setWorldHoverTarget(null);
      this.startWorldJump();
    };
    this.handleEchoExit = () => {
      this.onWorldClick();
      this.setWorldHoverTarget(null);
      this.startEchoReturn();
    };
    this.handleEchoMenuHover = () => this.onWorldHover();
    this.echoNextButton.addEventListener('click', this.handleEchoNext);
    this.echoExitButton.addEventListener('click', this.handleEchoExit);
    this.echoNextButton.addEventListener('pointerenter', this.handleEchoMenuHover);
    this.echoExitButton.addEventListener('pointerenter', this.handleEchoMenuHover);
    this.echoActionMenu.addEventListener('pointerenter', () => this.cancelEchoMenuHide());
    this.echoActionMenu.addEventListener('pointerleave', () => this.scheduleEchoMenuHide());
    this.stage.append(this.echoActionMenu);
    this.interactiveTitle = document.createElement('div');
    this.interactiveTitle.className = 'interactive-object-title';
    this.interactiveTitle.setAttribute('aria-hidden', 'true');
    this.stage.append(this.interactiveTitle);
    this.dataCenterArchive = new DataCenterArchive(
      this.stage,
      {
        onOpen: () => this.startDataCenterNarration(),
        onClose: () => this.stopDataCenterNarration(),
        onRequestClose: () => {
          this.onWorldClick();
          this.returnFromInteractiveObject();
        },
        onHover: () => this.onWorldHover(),
        getOriginalPhoto: () => this.face.session?.frame ?? null,
      },
    );
    this.echoRaycaster = new THREE.Raycaster();
    this.echoPointer = new THREE.Vector2();
    this.echoPickBounds = new THREE.Box3();
    this.echoPickPadding = new THREE.Vector3();
    this.echoPickPoint = new THREE.Vector3();
    this.compassPoint = new THREE.Vector3();
    this.splitCharacters = [];
    this.splitCameras = Array.from({ length: 4 }, () => {
      const camera = new THREE.PerspectiveCamera(44, 9 / 16, 0.05, 400);
      camera.layers.enableAll();
      return camera;
    });
    this.splitHead = new THREE.Vector3();
    this.splitForward = new THREE.Vector3();
    this.splitTarget = new THREE.Vector3();
    this.cursor = new InteractionCursor(
      stage,
      (clientX, clientY) => this.resolveWorldCursorMode(clientX, clientY),
    );

    this.handleCapture = this.handleCapture.bind(this);
    this.handleRetake = this.handleRetake.bind(this);
    this.handleUsePhoto = this.handleUsePhoto.bind(this);
    this.animate = this.animate.bind(this);
    this.resize = this.resize.bind(this);
    this.handleWorldDoubleClick = this.handleWorldDoubleClick.bind(this);
    this.handleCanvasPointerLeave = () => this.scheduleEchoMenuHide();
  }

  async initialize({ introMode = false } = {}) {
    this.ui.bind({
      onCapture: this.handleCapture,
      onRetake: this.handleRetake,
      onUse: this.handleUsePhoto,
    });
    this.ui.setReady(false);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.stage);
    this.canvas.addEventListener('dblclick', this.handleWorldDoubleClick);
    this.canvas.addEventListener('pointerleave', this.handleCanvasPointerLeave);
    this.resize();
    this.renderer.setAnimationLoop(this.animate);

    this.readyPromise = this.preloadWorld();
    const qaParams = new URLSearchParams(window.location.search);
    if (import.meta.env.DEV && (qaParams.has('worldQa') || qaParams.has('orbitQa')
      || qaParams.get('nevadaNpcWalkQa') === '1' || qaParams.get('nevadaInteractionQa') === '1')) {
      await this.readyPromise;
      if (qaParams.has('switchQa')) {
        const first = this.characterManager.entities[3];
        const second = this.characterManager.entities[4];
        this.switchQaPair = [first, second];
        this.switchQaSide = new THREE.Vector3();
        this.switchQaUp = new THREE.Vector3(0, 1, 0);
      }
      this.stage.classList.add('world-visible');
      this.worldRenderingEnabled = true;
      this.ui.layer.hidden = true;
      this.showWorldEntryOverlay();
      this.cameraController.startIntro(this.world.echo);
      if (qaParams.has('orbitQa') || qaParams.get('nevadaNpcWalkQa') === '1'
        || qaParams.get('nevadaInteractionQa') === '1') {
        this.cameraController.angle = -Math.PI * 0.15;
        this.cameraController.applyOrbitPose(
          this.cameraController.nearRadius,
          this.cameraController.nearHeight,
          this.cameraController.angle,
        );
        this.cameraController.startEchoOrbit();
      }
      if (qaParams.has('focusQa')) {
        window.setTimeout(() => {
          const requestedId = qaParams.get('focusQa');
          const target = this.characterManager.entities.find((entity) => entity.id === requestedId)
            ?? this.characterManager.entities[3];
          if (target) {
            this.cameraController.startEchoOrbit();
            this.handleCharacterPick(target);
          }
        }, 180);
      }
      if (qaParams.has('jumpQa')) {
        this.cameraController.startEchoOrbit();
        window.setTimeout(() => this.startWorldJump(), 500);
      }
      return;
    }
    if (introMode) {
      this.ui.layer.hidden = true;
      return;
    }
    try {
      await this.face.start();
      this.ui.setReady(true);
    } catch (error) {
      console.warn('[Face] camera start deferred', error);
      this.face.status('카메라 권한을 허용한 뒤 촬영 버튼을 눌러 주세요');
      this.ui.setReady(true);
    }
  }

  async preloadWorld() {
    this.echoTravel.preload().catch((error) => console.error('[ECHO travel] rig preload failed', error));
    const [world] = await Promise.all([
      this.world.load(),
      this.characterManager.preload(),
    ]);
    world.addLighting();
    this.navigation.configure(world);
    this.cameraController.configure(world);
    this.atmosphere = new Atmosphere(this.scene, world, 'nevada');
    this.weather = new WeatherParticles(this.scene, world, 'dust');
    this.stage.dataset.world = 'nevada';
    this.stage.dataset.weather = 'dust';
    await this.characterManager.spawnNevadaNpcs();
    const faceQaParams = new URLSearchParams(window.location.search);
    if (import.meta.env.DEV && faceQaParams.has('faceMorphQa')) {
      await this.applyFaceMorphQa(faceQaParams);
    }
    if (import.meta.env.DEV
      && faceQaParams.get('faceIdentity') === 'reconstructionV3'
      && faceQaParams.has('faceReconstructionQa')) {
      await this.applyFaceReconstructionQa();
    }
    this.picker = new CharacterPicker(this.canvas, this.camera, this.characterManager);
    this.interactivePicker = new InteractiveObjectPicker(
      this.canvas,
      this.camera,
      () => (this.currentWorld === 'nevada' ? this.world.interactiveRegions : []),
    );
    this.pointerController = new PointerInteractionController({
      canvas: this.canvas,
      cameraController: this.cameraController,
      picker: this.picker,
      interactivePicker: this.interactivePicker,
      getEchoHitDistance: (x, y) => this.getEchoHitDistance(x, y),
      onCharacter: (character) => this.handleCharacterPick(character),
      onInteractiveObject: (region) => this.handleInteractiveObjectPick(region),
      onInteractiveBackground: () => {
        this.onWorldClick();
        if (this.cameraController.state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS) {
          this.returnFromDanceGroup();
        } else this.returnFromInteractiveObject();
      },
    });
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('longPressQa')) {
      window.setTimeout(() => this.runLongPressQa(), 120);
    }
    this.assetsReady = true;
    this.haminaPreloadTimer = window.setTimeout(() => {
      this.haminaPreloadTimer = null;
      this.preloadHamina().catch((error) => console.warn('[Hamina] early preload failed', error));
    }, 1800);
    return world;
  }

  async applyFaceMorphQa(params) {
    const canonical = await fetch('/face/canonical.json').then((response) => response.json());
    const preset = params.get('faceMorphQa') || 'wide';
    const debugMode = params.get('faceMorphDebug');
    const debugTarget = params.get('faceMorphQaCharacter') || 'A01';
    const legacyMode = params.get('faceIdentity') === 'geometryV1';
    const results = {};
    for (const character of this.characterManager.entities) {
      const morphOptions = {
        silhouetteMorphEnabled: !legacyMode,
        legacyMode,
        debugMode: character.id === debugTarget && ['wireframe', 'heatmap'].includes(debugMode)
          ? debugMode
          : null,
      };
      if (legacyMode) Object.assign(morphOptions, {
        geometryStrength: 0.72,
        maximumHorizontalDisplacement: 0.075,
        maximumVerticalDisplacement: 0.055,
      });
      const result = character.applyFaceShapeQa(canonical, preset, morphOptions);
      if (!results[character.baseId]) results[character.baseId] = result;
    }
    window.__ECHO_FACE_MORPH_QA__ = { preset, debugTarget, results };
    this.stage.dataset.faceMorphQa = JSON.stringify({
      preset,
      debugTarget,
      results: Object.fromEntries(Object.entries(results).map(([base, result]) => [base, {
        applied: result.applied,
        diagnostics: result.diagnostics,
      }])),
    });
    console.info('[FaceMorph QA]', window.__ECHO_FACE_MORPH_QA__);
  }

  async applyFaceReconstructionQa() {
    const target = this.characterManager.entities.find((character) => (
      character.id === FACE_RECONSTRUCTION_V3_CONFIG.targetCharacterId
      && character.baseId === 'A'
    ));
    const baseImage = target?.faceController?.baseImage;
    if (!target || !baseImage) return;
    const canonical = await fetch('/face/canonical.json').then((response) => response.json());
    const frame = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
    frame.getContext('2d').drawImage(baseImage, 0, 0, frame.width, frame.height);
    const points = canonical.landmarks.map(([x, y]) => ({ x, y, z: 0 }));
    const reconstruction = new VisitorFaceReconstruction(canonical);
    const params = new URLSearchParams(window.location.search);
    const compareEnabled = params.get('faceReconstructionCompare') === '1';
    const result = reconstruction.reconstruct(frame, points, baseImage, {
      seamlessIntegrationEnabled: compareEnabled
        || params.get('faceReconstructionPipeline') !== 'legacy',
      debugOutputsEnabled: params.get('faceReconstructionDebug') === '1' || compareEnabled,
    });
    const legacyComparison = compareEnabled ? reconstruction.reconstruct(frame, points, baseImage, {
      seamlessIntegrationEnabled: false,
      debugOutputsEnabled: true,
    }) : null;
    if (result.applied) target.setFaceTexture(result.texture);
    window.__ECHO_FACE_RECONSTRUCTION_V3__ = {
      qa: true,
      targetCharacterId: target.id,
      appliedCharacterCount: result.applied ? 1 : 0,
      reconstruction: result.diagnostics,
      geometry: inspectReconstructionGeometry(target),
      comparison: legacyComparison?.applied ? {
        legacy: legacyComparison.diagnostics,
        seamless: result.diagnostics,
      } : null,
    };
    this.stage.dataset.faceReconstructionV3 = JSON.stringify(
      window.__ECHO_FACE_RECONSTRUCTION_V3__,
    );
    if (result.debugOutputs) window.__ECHO_FACE_RECONSTRUCTION_V3_DEBUG__ = result.debugOutputs;
    if (legacyComparison?.applied) {
      window.__ECHO_FACE_RECONSTRUCTION_V3_COMPARE__ = {
        legacy: {
          diagnostics: legacyComparison.diagnostics,
          final: legacyComparison.debugOutputs?.final ?? null,
        },
        seamless: {
          diagnostics: result.diagnostics,
          final: result.debugOutputs?.final ?? null,
        },
      };
      legacyComparison.texture.dispose();
    }
    console.info('[Face V3 QA]', window.__ECHO_FACE_RECONSTRUCTION_V3__);
  }

  runLongPressQa() {
    const rect = this.canvas.getBoundingClientRect();
    const candidates = [
      [0.92, 0.9], [0.08, 0.9], [0.92, 0.12], [0.08, 0.12],
    ];
    const point = candidates
      .map(([x, y]) => ({ x: rect.left + rect.width * x, y: rect.top + rect.height * y }))
      .find(({ x, y }) => !this.picker.pick(x, y));
    if (!point) {
      console.warn('[QA] no empty point available for long press');
      return;
    }
    const pointerId = 9001;
    this.pointerController.handlePointerDown({
      button: 0, isPrimary: true, pointerId, clientX: point.x, clientY: point.y,
    });
    window.setTimeout(() => {
      console.info(`[QA] long press active state: ${this.cameraController.state}`);
      this.pointerController.handlePointerMove({
        pointerId, clientX: point.x - 42, clientY: point.y - 28,
      });
      this.pointerController.handlePointerUp({
        pointerId, clientX: point.x - 42, clientY: point.y - 28,
      });
    }, INTERACTION_CONFIG.longPressThreshold + 80);
  }

  async handleCapture() {
    if (!this.face.webcam.stream) {
      this.ui.setBusy(true);
      try {
        await this.face.start();
        this.ui.setReady(true);
      } catch (error) {
        this.face.status('카메라 권한이 필요합니다. 브라우저 설정을 확인해 주세요');
      } finally {
        this.ui.setBusy(false);
      }
      return;
    }

    this.ui.setBusy(true);
    try {
      const session = await this.face.capture();
      if (!session) return;
      this.cameraController.setState(EXPERIENCE_STATES.PHOTO_PREVIEW);
      this.ui.showPreview(session.frame);
    } catch (error) {
      this.face.status(error.message);
    } finally {
      this.ui.setBusy(false);
    }
  }

  handleRetake() {
    this.face.clearSession();
    this.face.status('정면을 바라보고 다시 촬영해 주세요');
    this.ui.showCamera();
    this.cameraController.setState(EXPERIENCE_STATES.CAPTURE);
  }

  async handleUsePhoto() {
    if (!this.face.session) return;
    this.ui.setBusy(true);
    this.face.stop();
    if (!this.assetsReady) this.ui.showLoading(true);
    try {
      await this.readyPromise;
      await this.face.applyToCharacters(this.characterManager.entities);
      this.worldRenderingEnabled = true;
      this.stage.classList.add('world-visible');
      this.ui.showLoading(false);
      this.ui.leave();
      this.showWorldEntryOverlay();
      this.cameraController.startIntro(this.world.echo);
      this.scheduleFaceQaTargetFocus();
    } catch (error) {
      console.error('[ECHO] world entry failed', error);
      this.ui.showLoading(false);
      this.face.status('월드에 연결할 수 없습니다. 페이지를 새로고침해 주세요');
    } finally {
      this.ui.setBusy(false);
    }
  }

  async processIntroCapture(frame) {
    const session = await this.face.processFrame(frame);
    if (!session) throw new Error('얼굴을 확인할 수 없습니다. 다시 촬영해 주세요.');
    return session;
  }

  clearIntroCapture() {
    this.face.clearSession();
  }

  async enterWorldFromIntro({ applyFace = true } = {}) {
    if (applyFace && !this.face.session) throw new Error('촬영된 얼굴 정보가 없습니다.');
    await this.readyPromise;
    if (applyFace) {
      await this.face.applyToCharacters(this.characterManager.entities);
    }
    this.worldRenderingEnabled = true;
    this.stage.classList.add('world-visible');
    this.showWorldEntryOverlay();
    this.cameraController.startIntro(this.world.echo);
    this.scheduleFaceQaTargetFocus();
    return this.world;
  }

  startDataCenterNarration() {
    this.interactiveHoverCaptionActive = false;
    this.stopDataCenterNarration();
    const cues = [
      ...NEVADA_INTERACTIONS['Data Center'].phrases.map((text, index) => ({
        text, clipId: `datacenter_click_${String(index + 1).padStart(2, '0')}`,
      })),
      { text: ['이곳에서 사람들의 일부는 계속 증식합니다.', 'Parts of people keep multiplying here.'], clipId: 'datacenter_archive_01' },
      { text: ['당신의 것들도 무럭무럭 자라고 있겠죠.', 'Yours must be growing nicely too.'], clipId: 'datacenter_archive_02' },
    ];
    let at = 0;
    cues.forEach(({ text, clipId }, index) => {
      const show = () => this.caption.showOverride(...text, clipId);
      if (index === 0) show();
      else this.dataCenterNarrationTimers.push(window.setTimeout(show, at));
      at += (this.voice.duration(clipId) + 0.15) * 1000;
    });
    this.dataCenterNarrationTimers.push(window.setTimeout(() => {
      this.caption.hideOverride();
      this.dataCenterArchive.finishNarration();
    }, at));
  }

  stopDataCenterNarration() {
    for (const timer of this.dataCenterNarrationTimers) window.clearTimeout(timer);
    this.dataCenterNarrationTimers = [];
    this.caption.clearOverride();
  }

  scheduleFaceQaTargetFocus() {
    if (!this.faceQaTarget || this.faceQaFocusTimer) return;
    this.faceQaFocusTimer = window.setTimeout(() => {
      this.faceQaFocusTimer = null;
      if (this.disposed || this.worldTransitioning || this.currentWorld !== 'nevada') return;
      const target = this.characterManager.byId.get(this.faceQaTarget.targetId);
      if (!target) {
        console.warn(`[Face QA] target unavailable: ${this.faceQaTarget.targetId}`);
        return;
      }
      this.cameraController.startEchoOrbit();
      this.characterManager.setFocused(target);
      this.cameraController.focusCharacter(target, { framing: 'face' });
      this.faceQaBadge.hidden = false;
      this.stage.dataset.faceQaTarget = target.id;
      this.stage.dataset.faceQaMode = this.faceQaTarget.identityMode;
      console.info(`[Face QA] focused ${this.faceQaTarget.label}`);
    }, 900);
  }

  showWorldEntryOverlay() {
    if (!this.worldEntryOverlay) return;
    this.worldEntryOverlay.classList.add('visible');
    this.worldEntryOverlay.setAttribute('aria-hidden', 'false');
  }

  hideWorldEntryOverlay() {
    if (!this.worldEntryOverlay) return;
    this.worldEntryOverlay.classList.remove('visible');
    this.worldEntryOverlay.setAttribute('aria-hidden', 'true');
  }

  showHaminaEntryOverlay() {
    if (!this.haminaEntryOverlay) return;
    this.haminaEntryOverlay.classList.add('visible');
    this.haminaEntryOverlay.setAttribute('aria-hidden', 'false');
  }

  hideHaminaEntryOverlay() {
    if (!this.haminaEntryOverlay) return;
    this.haminaEntryOverlay.classList.remove('visible');
    this.haminaEntryOverlay.setAttribute('aria-hidden', 'true');
  }

  handleWorldDoubleClick(event) {
    if (this.currentWorld !== 'nevada' || this.worldTransitioning
      || this.cameraController.state !== EXPERIENCE_STATES.ECHO_ORBIT) return;
    if (!Number.isFinite(this.getEchoHitDistance(event.clientX, event.clientY))) return;
    this.onWorldClick();
    this.startWorldJump();
  }

  getEchoHitDistance(clientX, clientY) {
    if (!['nevada', 'hamina'].includes(this.currentWorld) || this.worldTransitioning
      || this.cameraController.state !== EXPERIENCE_STATES.ECHO_ORBIT
      || !this.world.echo.visible) return Infinity;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return Infinity;
    this.echoPointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.world.echo.updateWorldMatrix(true, true);
    this.echoRaycaster.setFromCamera(this.echoPointer, this.camera);
    const meshHit = this.echoRaycaster.intersectObject(this.world.echo, true)[0]?.distance;
    if (Number.isFinite(meshHit)) return meshHit;
    this.echoPickPadding.set(
      Math.max(0.35, this.world.echoSize.x * 0.22),
      Math.max(0.35, this.world.echoSize.y * 0.16),
      Math.max(0.35, this.world.echoSize.z * 0.22),
    );
    this.echoPickBounds.copy(this.world.echoBox).expandByVector(this.echoPickPadding);
    const point = this.echoRaycaster.ray.intersectBox(this.echoPickBounds, this.echoPickPoint);
    return point ? this.echoRaycaster.ray.origin.distanceTo(point) : Infinity;
  }

  pointCompassAtNearestInteraction(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    let nearestDistance = Infinity;
    let nearestAngle = null;
    const consider = (worldPoint) => {
      this.compassPoint.copy(worldPoint).project(this.camera);
      if (this.compassPoint.z < -1 || this.compassPoint.z > 1) return;
      const dx = rect.left + (this.compassPoint.x * 0.5 + 0.5) * rect.width - clientX;
      const dy = rect.top + (-this.compassPoint.y * 0.5 + 0.5) * rect.height - clientY;
      const distance = dx * dx + dy * dy;
      if (distance >= nearestDistance) return;
      nearestDistance = distance;
      nearestAngle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    };
    for (const region of this.world.interactiveRegions) consider(region.center);
    for (const character of this.characterManager.entities) {
      character.getHeadWorldPosition(this.compassPoint);
      consider(this.compassPoint);
    }
    if (nearestAngle === null) return false;
    this.stage.style.setProperty('--compass-angle', `${nearestAngle}deg`);
    return true;
  }

  resolveWorldCursorMode(clientX, clientY) {
    if (!this.worldRenderingEnabled || this.worldTransitioning || !this.picker
      || this.worldInteraction.active) {
      this.setWorldHoverTarget(null);
      return 'blocked';
    }
    const state = this.cameraController.state;
    const interactiveObjectsAreInteractive = this.currentWorld === 'nevada'
      && [
        EXPERIENCE_STATES.ECHO_ORBIT,
        EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS,
      ].includes(state);
    let interactiveObject = interactiveObjectsAreInteractive
      ? this.interactivePicker?.pick(clientX, clientY)
      : null;
    const charactersAreInteractive = state === EXPERIENCE_STATES.ECHO_ORBIT
      || state === EXPERIENCE_STATES.CHARACTER_FOCUS
      || state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS;
    let character = charactersAreInteractive
      ? this.picker.pick(clientX, clientY, false)
      : null;
    const echoDistance = this.getEchoHitDistance(clientX, clientY);
    if (interactiveObject && character) {
      if (this.picker.lastHitDistance < this.interactivePicker.lastHitDistance) interactiveObject = null;
      else character = null;
    }
    if (interactiveObject) {
      this.setWorldHoverTarget(
        `interactive:${interactiveObject.name}`,
        interactiveObject.name,
        interactiveObject,
      );
      return 'interactive-object';
    }
    if (character) {
      const danceGroup = this.characterManager.getDanceGroup(character);
      this.setWorldHoverTarget(
        danceGroup ? `dance:${danceGroup.id}` : `character:${character.id}`,
        '', danceGroup ?? character,
      );
      if (state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS) return 'character-back';
      if (danceGroup) return 'dance-group';
      if (state === EXPERIENCE_STATES.CHARACTER_FOCUS
        && this.cameraController.focused === character) {
        return 'character-back';
      }
      return 'character';
    }
    if (state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS) {
      this.setWorldHoverTarget(null);
      return 'character-back';
    }
    if (state !== EXPERIENCE_STATES.ECHO_ORBIT) {
      this.setWorldHoverTarget(null);
      return 'blocked';
    }
    if (Number.isFinite(echoDistance)) {
      this.setWorldHoverTarget('echo', '', this.world.echoCenter);
      return 'echo';
    }
    this.setWorldHoverTarget(null);
    return this.pointCompassAtNearestInteraction(clientX, clientY) ? 'compass' : 'blocked';
  }

  setWorldHoverTarget(target, label = '', cameraTarget = null) {
    const selected = (target?.startsWith('character:')
      && this.cameraController.focused?.id === target.slice(10))
      || (target?.startsWith('dance:')
        && this.cameraController.danceGroup?.id === Number(target.slice(6)))
      || (target?.startsWith('interactive:')
        && this.cameraController.interactiveFocus?.name === target.slice(12));
    this.cameraController.setHoverTarget(selected ? null : cameraTarget);
    this.stage.dataset.worldHoverLabel = label;
    if (target === this.worldHoverTarget) return;
    this.clearInteractiveHoverMaterials();
    this.worldHoverTarget = target;
    this.stage.dataset.worldHoverTarget = target ?? '';
    this.setEchoActionMenuVisible(target === 'echo');
    const interactiveName = target?.startsWith('interactive:') ? target.slice(12) : null;
    const hoverMeshes = interactiveName ? cameraTarget?.meshes
      : target === 'echo' ? [this.world?.echo, this.echoTravel?.actor]
        : target?.startsWith('dance:') ? cameraTarget?.members?.flatMap((member) => member.meshes)
          : target?.startsWith('character:') ? cameraTarget?.meshes : null;
    if (hoverMeshes && !selected) {
      const seen = new Set();
      for (const root of hoverMeshes) {
        root?.traverse?.((mesh) => {
          if (!mesh.isMesh || seen.has(mesh)) return;
          seen.add(mesh);
        const original = mesh.material;
        const brighten = (material) => {
          const copy = material.clone();
          if (copy.color?.isColor) copy.color.lerp(new THREE.Color('#e8faff'), 0.16);
          if (copy.emissive?.isColor) {
            copy.emissive.set('#88dfff');
            copy.emissiveIntensity = Math.max(copy.emissiveIntensity ?? 0, 0.4);
          }
          return copy;
        };
        mesh.material = Array.isArray(original) ? original.map(brighten) : brighten(original);
        this.interactiveHoverMaterials.push({ mesh, original });
        });
      }
    }
    const question = interactiveName ? INTERACTIVE_QUESTIONS[interactiveName]
      : target?.startsWith('dance:') && !selected
        ? { korean: '이사람들은 기쁠까요?', english: 'Are these people happy?' }
        : null;
    if (question) {
      this.interactiveHoverCaptionActive = true;
      const clipId = interactiveName
        ? `${interactiveName === 'Data Center' ? 'datacenter' : interactiveName.toLowerCase()}_hover`
        : null;
      this.caption.showOverride(question.korean, question.english, clipId);
    } else if (this.interactiveHoverCaptionActive) {
      this.interactiveHoverCaptionActive = false;
      this.caption.clearOverride();
    }
    if (target) this.onWorldHover(target);
  }

  clearInteractiveHoverMaterials() {
    for (const { mesh, original } of this.interactiveHoverMaterials) {
      const copies = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = original;
      for (const material of copies) material.dispose();
    }
    this.interactiveHoverMaterials.length = 0;
  }

  setEchoActionMenuVisible(visible) {
    if (this.echoActionMenu.classList.contains('visible') === visible) return;
    this.echoActionMenu.classList.toggle('visible', visible);
    this.echoActionMenu.setAttribute('aria-hidden', String(!visible));
  }

  cancelEchoMenuHide() {
    if (this.echoMenuHideTimer) window.clearTimeout(this.echoMenuHideTimer);
    this.echoMenuHideTimer = null;
  }

  scheduleEchoMenuHide() {
    this.cancelEchoMenuHide();
    this.echoMenuHideTimer = window.setTimeout(() => {
      this.echoMenuHideTimer = null;
      this.setWorldHoverTarget(null);
    }, 180);
  }

  updateEchoActionMenuPosition() {
    if (!this.echoActionMenu.classList.contains('visible')) return;
    this.echoMenuPoint.copy(this.world.echoCenter);
    this.echoMenuPoint.y = this.world.echoBox.min.y;
    this.echoMenuPoint.project(this.camera);
    this.echoActionMenu.style.left = `${(this.echoMenuPoint.x * 0.5 + 0.5) * this.stage.clientWidth}px`;
    this.echoActionMenu.style.top = `${(-this.echoMenuPoint.y * 0.5 + 0.5) * this.stage.clientHeight}px`;
  }

  preloadHamina() {
    if (!this.haminaPromise) {
      const hamina = new HaminaWorld(this.scene);
      this.haminaPromise = hamina.load({ visible: false });
    }
    return this.haminaPromise;
  }

  wait(seconds) {
    return new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
  }

  chooseSplitCharacters() {
    const pool = [...this.characterManager.entities];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swap]] = [pool[swap], pool[index]];
    }
    return pool.slice(0, 4);
  }

  async startEchoReturn() {
    if (this.worldTransitioning || !['nevada', 'hamina'].includes(this.currentWorld)) return;
    this.worldTransitioning = true;
    this.echoActionMenu.classList.remove('visible');
    this.echoActionMenu.setAttribute('aria-hidden', 'true');
    this.cancelDanceNarration();
    this.worldInteraction.cancel();
    this.characterManager.stopDances();
    this.characterManager.setFocused(null);
    this.echoReturn ??= new EchoReturnSequence(this.stage, this.renderer);
    try {
      await this.echoReturn.play();
      if (!this.disposed) window.location.reload();
    } catch (error) {
      console.error('[Echo return] sequence failed', error);
      this.echoReturn.dispose();
      this.echoReturn = null;
      this.worldTransitioning = false;
      this.cameraController.returnToEcho();
    }
  }

  async startWorldJump() {
    if (this.worldTransitioning || this.currentWorld !== 'nevada') return;
    this.cancelDanceNarration();
    this.worldInteraction.cancel();
    this.worldTransitioning = true;
    this.characterManager.stopDances();
    this.characterManager.setFocused(null);
    if (this.haminaPreloadTimer) window.clearTimeout(this.haminaPreloadTimer);
    this.haminaPreloadTimer = null;
    const haminaLoading = this.preloadHamina();
    this.caption.showOverride(
      '다른 좌표에서 당신의 흔적을 찾습니다.',
      'Searching for your trace at another coordinate.',
      'echo_next_coordinate',
    );

    try {
      // Finish model decoding before ECHO moves so no parse spike interrupts its spin.
      const hamina = await haminaLoading;
      await this.echoTravel.preload();
      this.echoTravel.attach(this.world);
      this.cameraController.startWorldJumpFocus(WORLD_JUMP_CONFIG.focusDuration);
      await this.wait(WORLD_JUMP_CONFIG.focusDuration);

      this.echoTravel.start('crouch', WORLD_JUMP_CONFIG.crouchDuration);
      await this.wait(WORLD_JUMP_CONFIG.crouchDuration);

      const lift = Math.max(
        80,
        this.world.bounds.max.y - this.world.echoCenter.y + 55,
      );
      this.caption.clearOverride();
      this.echoTravel.start('launch', WORLD_JUMP_CONFIG.launchDuration, lift);
      this.cameraController.startWorldJumpAscent(WORLD_JUMP_CONFIG.launchDuration, lift);
      this.atmosphere.transitionTo('hamina', WORLD_JUMP_CONFIG.launchDuration + WORLD_JUMP_CONFIG.spinDuration);
      await this.wait(WORLD_JUMP_CONFIG.launchDuration);

      this.cameraController.holdWorldLoading();
      this.echoTravel.start('loading-spin', WORLD_JUMP_CONFIG.spinDuration, lift);
      this.worldBlend = new WorldBackdropBlend(
        this.world,
        hamina,
        this.characterManager.entities.map((entity) => entity.root),
        this.echoTravel,
        this.stage,
      );
      this.worldBlend.prepare(WORLD_JUMP_CONFIG.spinDuration);
      this.cameraController.startWorldSpinFocus(
        Math.min(2.2, WORLD_JUMP_CONFIG.spinDuration * 0.25),
      );
      this.echoTravel.start('spin', WORLD_JUMP_CONFIG.spinDuration, lift);
      await this.wait(WORLD_JUMP_CONFIG.spinDuration);
      this.caption.clearOverride();
      await this.activateHamina(hamina);
    } catch (error) {
      console.error('[World jump] Hamina transition failed', error);
      this.worldBlend?.cancel();
      this.worldBlend = null;
      this.echoTravel.detach();
      this.worldJumpOverlay.classList.remove(
        'visible', 'split-active', 'snapshot-active', 'dissolve-active', 'revealing',
      );
      this.worldJumpOverlay.setAttribute('aria-hidden', 'true');
      this.caption.clearOverride();
      this.characterManager.setLookingUp(false);
      this.atmosphere.finishTransition('nevada', this.world);
      this.cameraController.startEchoOrbit();
      this.worldTransitioning = false;
    }
  }

  async activateHamina(hamina) {
    this.worldInteraction.cancel();
    this.worldBlend?.finish(this.cameraController);
    this.worldBlend = null;
    this.echoTravel.retarget(hamina);
    const previousWorld = this.world;
    previousWorld.detach();
    this.weather?.dispose();

    hamina.root.visible = true;
    this.world = hamina;
    this.currentWorld = 'hamina';
    this.echoNextButton.hidden = true;
    const landingHeight = this.echoTravel.lift;
    this.navigation.configure(hamina);
    this.characterManager.removeNevadaNpcs();
    await this.characterManager.spawn(WORLD_CONFIG.characterCount);
    if (this.face.session) await this.face.applyToCharacters(this.characterManager.entities);
    this.characterManager.setWorldMode('hamina');
    this.cameraController.configure(hamina);
    this.atmosphere.finishTransition('hamina', hamina);
    this.weather = new WeatherParticles(this.scene, hamina, 'snow');
    this.postProcessing.setWorldMode('hamina');
    // Start both clocks after world setup so a slow relocation cannot consume
    // the first seconds of the visible descent.
    this.echoTravel.start('arrival', WORLD_JUMP_CONFIG.arrivalDuration, landingHeight);
    this.cameraController.startWorldArrival(WORLD_JUMP_CONFIG.arrivalDuration);
    this.worldTransitioning = false;
    this.stage.dataset.world = 'hamina';
    this.stage.dataset.weather = 'snow';

    const disposePrevious = () => previousWorld.dispose();
    if ('requestIdleCallback' in window) window.requestIdleCallback(disposePrevious, { timeout: 3000 });
    else window.setTimeout(disposePrevious, 500);
  }

  prepareSplitPortraits() {
    if (this.splitCharacters.length !== 4) return;
    const width = Math.max(2, this.stage.clientWidth);
    const height = Math.max(2, this.stage.clientHeight);
    const cellWidth = width / 2;
    const cellHeight = height / 2;
    for (let index = 0; index < 4; index += 1) {
      const entity = this.splitCharacters[index];
      const portraitCamera = this.splitCameras[index];
      this.updateSplitPortraitCamera(entity, portraitCamera);
      portraitCamera.aspect = cellWidth / cellHeight;
      portraitCamera.updateProjectionMatrix();
    }
  }

  updateSplitPortraitCamera(entity, portraitCamera) {
    entity.getHeadWorldPosition(this.splitHead);
    entity.getFaceSurfaceDirection(this.splitForward);
    this.splitForward.y = 0;
    if (this.splitForward.lengthSq() < 1e-6) this.splitForward.set(0, 0, 1);
    this.splitForward.normalize();
    const lookUpProgress = entity.getLookUpProgress();
    const distance = THREE.MathUtils.lerp(1.02, 0.86, lookUpProgress);
    portraitCamera.position.copy(this.splitHead)
      .addScaledVector(this.splitForward, entity.height * distance);
    portraitCamera.position.y -= entity.height * 0.04;
    this.splitTarget.copy(this.splitHead);
    this.splitTarget.y += entity.height * 0.06;
    portraitCamera.lookAt(this.splitTarget);
  }

  renderSplitPortraits() {
    if (this.splitCharacters.length !== 4) return;
    const width = Math.max(2, this.stage.clientWidth);
    const height = Math.max(2, this.stage.clientHeight);
    const cellWidth = width / 2;
    const cellHeight = height / 2;
    this.renderer.setScissorTest(true);
    for (let index = 0; index < 4; index += 1) {
      const entity = this.splitCharacters[index];
      const portraitCamera = this.splitCameras[index];
      this.updateSplitPortraitCamera(entity, portraitCamera);
      const x = (index % 2) * cellWidth;
      const y = index < 2 ? cellHeight : 0;
      this.renderer.setViewport(x, y, cellWidth, cellHeight);
      this.renderer.setScissor(x, y, cellWidth, cellHeight);
      this.renderer.render(this.scene, portraitCamera);
    }
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, width, height);
    if (this.pendingSplitCapture && this.worldJumpSnapshot) {
      this.worldJumpSnapshot.width = this.canvas.width;
      this.worldJumpSnapshot.height = this.canvas.height;
      const context = this.worldJumpSnapshot.getContext('2d');
      context.clearRect(0, 0, this.worldJumpSnapshot.width, this.worldJumpSnapshot.height);
      context.drawImage(
        this.canvas,
        0,
        0,
        this.worldJumpSnapshot.width,
        this.worldJumpSnapshot.height,
      );
      this.worldJumpOverlay.classList.add('snapshot-active');
      const resolve = this.pendingSplitCapture;
      this.pendingSplitCapture = null;
      resolve();
    }
  }

  captureSplitFrame() {
    return new Promise((resolve) => {
      this.pendingSplitCapture = resolve;
    });
  }

  showDanceNarration() {
    this.cancelDanceNarration();
    const cues = [DANCE_NARRATION[0], DANCE_NARRATION[0], DANCE_NARRATION[1]];
    const showCue = (index) => {
      this.danceNarrationTimer = null;
      if (this.disposed || this.currentWorld !== 'nevada'
        || this.cameraController.state !== EXPERIENCE_STATES.GROUP_DANCE_FOCUS) return;
      const clipId = `dance_click_${String(index + 1).padStart(2, '0')}`;
      this.caption.showOverride(...cues[index], clipId);
      if (index < cues.length - 1) {
        this.danceNarrationTimer = window.setTimeout(
          () => {
            this.caption.hideOverride();
            this.danceNarrationTimer = window.setTimeout(() => showCue(index + 1), 620);
          }, this.voice.duration(clipId) * 1000,
        );
      } else {
        this.danceNarrationTimer = window.setTimeout(
          () => {
            this.danceNarrationTimer = null;
            this.caption.hideOverride();
            this.danceNarrationFinished = true;
          },
          (this.voice.duration(clipId) + 0.3) * 1000,
        );
      }
    };
    showCue(0);
  }

  cancelDanceNarration() {
    if (this.danceNarrationTimer !== null) window.clearTimeout(this.danceNarrationTimer);
    this.danceNarrationTimer = null;
    this.pendingDanceNarrationGroup = null;
  }

  queueDanceNarration(group) {
    this.cancelDanceNarration();
    this.danceNarrationFinished = false;
    this.pendingDanceNarrationGroup = group;
    this.caption.hideOverride();
  }

  showCharacterDialogue(character) {
    if (this.characterDialogueTimer !== null) window.clearTimeout(this.characterDialogueTimer);
    const role = character.id === 'N03' ? 0
      : character.id === 'N04' ? 1 : character.id === 'N05' ? 2
        : [...character.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 3;
    const cues = CHARACTER_DIALOGUE[role];
    const prefix = ['npc_n03', 'npc_n04', 'npc_n05'][role];
    const showCue = (index) => {
      if (this.cameraController.focused !== character) return;
      if (index === cues.length) {
        this.characterDialogueTimer = null;
        return;
      }
      const clipId = `${prefix}_${String(index + 1).padStart(2, '0')}`;
      this.caption.showOverride(...cues[index], clipId);
      this.characterDialogueTimer = window.setTimeout(
        () => showCue(index + 1), (this.voice.duration(clipId) + 0.12) * 1000,
      );
    };
    this.caption.showOverride('무슨생각중이야?', 'What are you thinking?', 'npc_prompt');
    this.characterDialogueTimer = window.setTimeout(
      () => showCue(0), (this.voice.duration('npc_prompt') + 0.12) * 1000,
    );
  }

  handleCharacterPick(character) {
    if (this.worldTransitioning) return;
    const state = this.cameraController.state;
    if (state !== EXPERIENCE_STATES.ECHO_ORBIT
      && state !== EXPERIENCE_STATES.CHARACTER_FOCUS
      && state !== EXPERIENCE_STATES.GROUP_DANCE_FOCUS) return;
    this.onWorldClick();
    this.setWorldHoverTarget(null);
    const danceGroup = this.characterManager.getDanceGroup(character);
    if (state === EXPERIENCE_STATES.ECHO_ORBIT) {
      if (danceGroup) {
        if (this.characterDialogueTimer !== null) window.clearTimeout(this.characterDialogueTimer);
        this.characterDialogueTimer = null;
        this.setWorldHoverTarget(null);
        this.characterManager.setFocused(null);
        this.characterManager.viewDanceGroup(danceGroup);
        this.cameraController.focusDanceGroup(danceGroup, character);
        this.queueDanceNarration(danceGroup);
        return;
      }
      console.info(`[Experience] focus character: ${character.id}`);
      this.setWorldHoverTarget(null);
      this.characterManager.setFocused(character);
      this.cameraController.focusCharacter(character);
      this.showCharacterDialogue(character);
      return;
    }
    if (state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS) {
      const previousGroup = this.cameraController.danceGroup;
      if (previousGroup?.members.includes(character)) {
        this.returnFromDanceGroup();
      } else {
        this.characterManager.releaseDanceGroup(previousGroup);
        if (danceGroup) {
          this.characterManager.viewDanceGroup(danceGroup);
          this.cameraController.focusDanceGroup(danceGroup, character);
          this.queueDanceNarration(danceGroup);
        } else {
          this.cancelDanceNarration();
          this.caption.clearOverride();
          this.characterManager.setFocused(character);
          this.cameraController.focusCharacter(character);
          this.showCharacterDialogue(character);
        }
      }
      return;
    }
    if (state !== EXPERIENCE_STATES.CHARACTER_FOCUS) return;
    if (this.cameraController.focused === character) {
      console.info(`[Experience] return from character: ${character.id}`);
      if (this.characterDialogueTimer !== null) window.clearTimeout(this.characterDialogueTimer);
      this.characterDialogueTimer = null;
      this.caption.clearOverride();
      this.characterManager.setFocused(null);
      this.cameraController.returnToEcho();
    } else {
      console.info(`[Experience] switch character: ${this.cameraController.focused.id} -> ${character.id}`);
      this.characterManager.setFocused(character);
      this.cameraController.switchCharacter(character);
      this.showCharacterDialogue(character);
    }
  }

  returnFromDanceGroup() {
    this.characterManager.releaseDanceGroup(this.cameraController.danceGroup);
    this.setWorldHoverTarget(null);
    this.cancelDanceNarration();
    this.caption.clearOverride();
    this.cameraController.returnToEcho();
  }

  handleInteractiveObjectPick(region) {
    if (region.name === 'Data Center') this.dataCenterArchive.primeAudio();
    this.onWorldClick();
    this.setWorldHoverTarget(null);
    if (region.name !== 'Data Center') this.pendingDataCenterArchiveRegion = null;
    if (this.worldInteraction.active) {
      if (this.worldInteraction.active.region === region) this.worldInteraction.openResearch();
      return;
    }
    const state = this.cameraController.state;
    if (state === EXPERIENCE_STATES.ECHO_ORBIT) {
      this.hideInteractiveTitle();
      this.characterManager.setFocused(null);
      this.caption.hideOverride();
      this.cameraController.focusInteractiveObject(region);
      if (region.name === 'Data Center') this.pendingDataCenterArchiveRegion = region;
      else this.worldInteraction.start(region);
      return;
    }
    if (state !== EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS) return;
    if (this.cameraController.interactiveFocus === region) {
      if (region.name === 'Data Center') {
        if (!this.pendingDataCenterArchiveRegion) this.pendingDataCenterArchiveRegion = region;
        return;
      }
      this.showInteractiveTitle(region.name);
      return;
    }
    this.hideInteractiveTitle();
    this.cameraController.focusInteractiveObject(region);
    if (region.name === 'Data Center') this.pendingDataCenterArchiveRegion = region;
  }

  showInteractiveTitle(name) {
    this.interactiveTitle.textContent = name;
    this.interactiveTitle.classList.add('visible');
    this.interactiveTitle.setAttribute('aria-hidden', 'false');
  }

  hideInteractiveTitle() {
    this.interactiveTitle.classList.remove('visible');
    this.interactiveTitle.setAttribute('aria-hidden', 'true');
  }

  returnFromInteractiveObject() {
    this.pendingDataCenterArchiveRegion = null;
    this.worldInteraction.cancel();
    this.caption.clearOverride();
    if (this.dataCenterOpenTimer) window.clearTimeout(this.dataCenterOpenTimer);
    this.dataCenterOpenTimer = null;
    this.dataCenterArchive.close();
    this.hideInteractiveTitle();
    this.setWorldHoverTarget(null);
    this.cameraController.returnFromInteractiveObject();
  }

  resize() {
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    const pixelBudgetRatio = Math.sqrt(WORLD_CONFIG.maxRenderPixels / (width * height));
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      WORLD_CONFIG.maxPixelRatio,
      Math.max(0.6, pixelBudgetRatio),
    );
    this.camera.aspect = 9 / 16;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.postProcessing.setSize(width, height, pixelRatio);
    if (this.worldEntryDesign) {
      this.worldEntryDesign.style.transform = `scale(${width / 2160})`;
    }
    if (this.haminaEntryDesign) {
      this.haminaEntryDesign.style.transform = `scale(${width / 2160})`;
    }
  }

  updateFocusLighting(delta) {
    const state = this.cameraController.state;
    const character = this.cameraController.focused;
    const region = this.cameraController.interactiveFocus;
    const danceGroup = this.cameraController.danceGroup;
    const characterActive = Boolean(character) && [
      EXPERIENCE_STATES.CHARACTER_FOCUS,
      EXPERIENCE_STATES.CHARACTER_SWITCH,
    ].includes(state);
    const objectActive = Boolean(region)
      && state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS;
    const groupActive = Boolean(danceGroup)
      && state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS;
    const active = characterActive || objectActive || groupActive;
    this.portraitFill.intensity = THREE.MathUtils.damp(
      this.portraitFill.intensity,
      active ? (groupActive ? 0.5 : 1.3) : 0,
      active ? 7 : 5,
      delta,
    );
    this.danceFills.forEach((light, index) => {
      const member = groupActive ? danceGroup.members[index] : null;
      light.intensity = THREE.MathUtils.damp(light.intensity, member ? 1.3 : 0, 7, delta);
      if (!member) return;
      member.getHeadWorldPosition(this.portraitHead);
      this.portraitToCamera.subVectors(this.camera.position, this.portraitHead).normalize();
      light.position.copy(this.portraitHead)
        .addScaledVector(this.portraitToCamera, member.height * 0.48);
      light.distance = Math.max(2.2, member.height * 1.55);
    });
    if (!active) return;

    if (characterActive) {
      character.getHeadWorldPosition(this.portraitHead);
    } else if (groupActive) {
      this.portraitHead.copy(danceGroup.center);
      this.portraitHead.y += danceGroup.height * 0.65;
    } else {
      this.portraitHead.copy(region.center);
      this.portraitHead.y += region.size.y * 0.06;
    }
    this.portraitToCamera.subVectors(this.camera.position, this.portraitHead).normalize();
    this.portraitUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.portraitRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    if (objectActive) {
      const objectScale = Math.max(region.radius, 0.8);
      this.portraitFill.position.copy(this.portraitHead)
        .addScaledVector(this.portraitToCamera, THREE.MathUtils.clamp(objectScale * 0.72, 0.7, 1.8))
        .addScaledVector(this.portraitUp, objectScale * 0.1)
        .addScaledVector(this.portraitRight, objectScale * 0.06);
      this.portraitFill.distance = Math.max(4.2, objectScale * 3.2);
      return;
    }
    if (groupActive) {
      this.portraitFill.position.copy(this.portraitHead)
        .addScaledVector(this.portraitToCamera, Math.max(2.2, danceGroup.radius * 0.6))
        .addScaledVector(this.portraitUp, danceGroup.height * 0.45);
      this.portraitFill.distance = Math.max(6.5, danceGroup.radius * 3.2);
      return;
    }
    this.portraitFill.position.copy(this.portraitHead)
      .addScaledVector(this.portraitToCamera, character.height * 0.48)
      .addScaledVector(this.portraitUp, character.height * 0.05)
      .addScaledVector(this.portraitRight, character.height * 0.035);
    this.portraitFill.distance = Math.max(2.2, character.height * 1.55);
  }

  animate() {
    if (this.disposed) return;
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.05);
    const elapsed = this.timer.getElapsed();
    if (!this.worldRenderingEnabled) return;
    if (this.assetsReady) {
      this.characterManager.update(delta);
      this.worldInteraction.update(delta);
      this.echoTravel.update(delta);
      this.worldBlend?.update();
      if (this.npcWalkQaEnabled) {
        this.npcWalkQaFrames += 1;
        const now = performance.now();
        if (now - this.npcWalkQaStarted >= 1200) {
          this.npcWalkQaFps = Math.round(this.npcWalkQaFrames * 1000 / (now - this.npcWalkQaStarted));
          this.npcWalkQaFrames = 0;
          this.npcWalkQaStarted = now;
          this.updateNpcWalkQa();
        }
      }
      if (import.meta.env.DEV && this.switchQaPair) {
        const [first, second] = this.switchQaPair;
        this.switchQaSide.subVectors(first.root.position, this.camera.position);
        this.switchQaSide.y = 0;
        const qaSpacing = this.cameraController.focused ? 0.3 : 1.2;
        this.switchQaSide.cross(this.switchQaUp).normalize().multiplyScalar(qaSpacing);
        second.root.position.copy(first.root.position).add(this.switchQaSide);
        second.root.rotation.copy(first.root.rotation);
        first.hitVolume.layers.set(this.cameraController.focused ? 1 : 0);
        second.hitVolume.layers.set(0);
      }
      this.cameraController.update(delta);
      if (this.pendingDataCenterArchiveRegion
        && this.cameraController.state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS
        && this.cameraController.interactiveFocus === this.pendingDataCenterArchiveRegion
        && !this.cameraController.transition) {
        this.pendingDataCenterArchiveRegion = null;
        this.dataCenterArchive.open();
      }
      if (this.pendingDanceNarrationGroup === this.cameraController.danceGroup
        && this.cameraController.state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS
        && !this.cameraController.transition) this.showDanceNarration();
      if (this.cameraController.state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS
        && this.cameraController.danceSequenceComplete && this.danceNarrationFinished) {
        this.returnFromDanceGroup();
      }
      this.cameraController.applyInteractiveMotion(delta);
      this.worldInteraction.applyCoolerCameraMotion(this.cameraController.target);
      this.updateEchoActionMenuPosition();
      this.updateFocusLighting(delta);
      this.atmosphere.update(delta, this.camera);
      this.weather?.update(delta, elapsed);
      this.caption.update();
      if (import.meta.env.DEV && this.qaFrame++ % 12 === 0) this.updateQaMetrics();
    }
    if (this.cameraController.state === EXPERIENCE_STATES.WORLD_JUMP_SPLIT) {
      this.renderSplitPortraits();
      return;
    }
    this.postProcessing.render(elapsed, this.cameraController.state, delta, this.worldBlend);
    if (this.currentWorld === 'nevada' && !this.worldTransitioning && this.assetsReady) {
      this.echoReturn.recordFrame(this.camera, this.cameraController);
    }
  }

  updateQaMetrics() {
    const rect = this.stage.getBoundingClientRect();
    const projected = this.characterManager.entities.map((entity) => {
      const point = entity.root.position.clone();
      point.y += entity.height * 0.55;
      point.project(this.camera);
      return {
        id: entity.id,
        x: Math.round(rect.left + (point.x * 0.5 + 0.5) * rect.width),
        y: Math.round(rect.top + (-point.y * 0.5 + 0.5) * rect.height),
        depth: Number(point.z.toFixed(3)),
        visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < 0.96 && Math.abs(point.y) < 0.96,
      };
    });
    this.stage.dataset.qaState = this.cameraController.state;
    this.stage.dataset.qaCharacters = JSON.stringify(projected);
    const interactiveObjects = (this.currentWorld === 'nevada' ? this.world.interactiveRegions : [])
      .map((region) => {
        const point = region.center.clone().project(this.camera);
        return {
          name: region.name,
          x: Math.round(rect.left + (point.x * 0.5 + 0.5) * rect.width),
          y: Math.round(rect.top + (-point.y * 0.5 + 0.5) * rect.height),
          depth: Number(point.z.toFixed(3)),
          visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1,
        };
      });
    this.stage.dataset.qaInteractiveObjects = JSON.stringify(interactiveObjects);
    this.stage.dataset.qaDanceGroups = JSON.stringify(this.characterManager.danceDirector.groups.map((group) => ({
      id: group.id,
      members: group.members.map((member) => member.id),
      center: group.center.toArray().map((value) => Number(value.toFixed(2))),
      radius: Number(group.radius.toFixed(2)),
      focusRadius: Number(group.focusRadius.toFixed(2)),
      remaining: Number(group.remaining.toFixed(1)),
      blockedBy: group.blockedBy ?? null,
      viewed: group.viewed,
    })));
    this.stage.dataset.qaConversations = JSON.stringify(
      this.characterManager.conversationDirector.conversations.map((conversation) => ({
        id: conversation.id,
        members: conversation.members.map((member) => member.id),
        remaining: Number(conversation.remaining.toFixed(1)),
      })),
    );
    if (this.currentWorld === 'nevada') {
      const echo = this.world.echoCenter;
      const characters = this.characterManager.entities;
      let minimumSeparation = Infinity;
      let closest = [];
      for (let a = 0; a < characters.length; a += 1) {
        for (let b = a + 1; b < characters.length; b += 1) {
          const first = characters[a].root.position;
          const second = characters[b].root.position;
          const separation = Math.hypot(first.x - second.x, first.z - second.z);
          if (separation < minimumSeparation) {
            minimumSeparation = separation;
            closest = [characters[a].id, characters[b].id];
          }
        }
      }
      this.stage.dataset.qaCrowd = JSON.stringify({
        nearEcho: characters.filter((entity) => Math.hypot(
          entity.root.position.x - echo.x, entity.root.position.z - echo.z,
        ) < 18).length,
        total: characters.length,
        minimumSeparation: Number(minimumSeparation.toFixed(2)),
        closest,
      });
    }
    this.stage.dataset.qaCamera = JSON.stringify(this.camera.position.toArray().map((value) => Number(value.toFixed(3))));
    this.stage.dataset.qaHoverZoom = this.cameraController.hoverZoom.toFixed(3);
    this.stage.dataset.qaFocusBreath = this.cameraController.focusBreath.toFixed(3);
    this.stage.dataset.qaBreathAmplitude = this.cameraController.focusBreathAmplitude.toFixed(4);
    this.stage.dataset.qaCameraMotion = this.cameraController.hoverOffset.length().toFixed(4);
    this.stage.dataset.qaFocusLight = JSON.stringify({
      intensity: Number(this.portraitFill.intensity.toFixed(3)),
      distance: Number(this.portraitFill.distance.toFixed(3)),
      position: this.portraitFill.position.toArray().map((value) => Number(value.toFixed(3))),
    });
    this.stage.dataset.qaOrbit = JSON.stringify({
      angle: Number(this.cameraController.angle.toFixed(3)),
      farRadius: Number(this.cameraController.farRadius.toFixed(3)),
      nearRadius: Number(this.cameraController.nearRadius.toFixed(3)),
      echoCenter: this.cameraController.echoCenter.toArray().map((value) => Number(value.toFixed(3))),
    });
  }

  updateNpcWalkQa() {
    const npcs = this.characterManager.entities.filter((entity) => entity.nevadaNpc);
    const warnings = [];
    if (this.currentWorld === 'nevada' && npcs.length !== 15) warnings.push(`Expected 15 Nevada NPCs; found ${npcs.length}`);
    if (this.currentWorld === 'hamina' && npcs.length) warnings.push('Nevada NPCs remain in Hamina');
    const rows = npcs.map((entity) => {
      const { x, y, z } = entity.root.position;
      if (!this.navigation.worldBounds.containsPoint(entity.root.position)) warnings.push(`${entity.id}: out of bounds`);
      const ground = this.navigation.sampleHeight(x, z);
      if (ground === null || Math.abs(y - ground) > 0.25) warnings.push(`${entity.id}: ground offset`);
      const state = entity.danceGroup ? 'dance' : entity.conversation ? 'talk' : entity.behavior.state;
      const clip = entity.animator.current?.getClip()?.name ?? 'none';
      return `${entity.id} ${state.padEnd(4)} ${clip}  (${x.toFixed(1)}, ${z.toFixed(1)})`;
    });
    this.npcWalkQaOverlay.textContent = [
      `NEVADA NPC WALK QA · ${this.currentWorld}`,
      `Nevada NPCs ${npcs.length}/15 · Total ${this.characterManager.entities.length} · FPS ${this.npcWalkQaFps}`,
      `Draw calls ${this.renderer.info.render.calls} · Textures ${this.renderer.info.memory.textures}`,
      ...rows,
      `Warnings: ${warnings.length ? warnings.join('; ') : 'none'}`,
    ].join('\n');
    this.stage.dataset.nevadaNpcWalkQa = JSON.stringify({
      world: this.currentWorld,
      count: npcs.length,
      total: this.characterManager.entities.length,
      fps: this.npcWalkQaFps,
      drawCalls: this.renderer.info.render.calls,
      textures: this.renderer.info.memory.textures,
      npcs: npcs.map((entity) => ({
        id: entity.id,
        state: entity.danceGroup ? 'dance' : entity.conversation ? 'talk' : entity.behavior.state,
        animation: entity.animator.current?.getClip()?.name ?? null,
        position: entity.root.position.toArray(),
      })),
      warnings,
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.faceQaFocusTimer) window.clearTimeout(this.faceQaFocusTimer);
    if (this.haminaPreloadTimer) window.clearTimeout(this.haminaPreloadTimer);
    this.cancelDanceNarration();
    if (this.characterDialogueTimer !== null) window.clearTimeout(this.characterDialogueTimer);
    this.cancelEchoMenuHide();
    if (this.dataCenterOpenTimer) window.clearTimeout(this.dataCenterOpenTimer);
    this.dataCenterOpenTimer = null;
    this.clearInteractiveHoverMaterials();
    this.faceQaBadge?.remove();
    this.worldInteraction.dispose();
    this.echoReturn?.dispose();
    this.voice.dispose();
    this.worldBlend?.cancel();
    this.echoTravel.dispose();
    this.npcWalkQaOverlay?.remove();
    this.interactiveTitle.remove();
    this.echoNextButton.removeEventListener('click', this.handleEchoNext);
    this.echoExitButton.removeEventListener('click', this.handleEchoExit);
    this.echoNextButton.removeEventListener('pointerenter', this.handleEchoMenuHover);
    this.echoExitButton.removeEventListener('pointerenter', this.handleEchoMenuHover);
    this.echoActionMenu.remove();
    this.dataCenterArchive.dispose();
    this.renderer.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('dblclick', this.handleWorldDoubleClick);
    this.canvas.removeEventListener('pointerleave', this.handleCanvasPointerLeave);
    this.pointerController?.dispose();
    this.cursor?.dispose();
    this.ui.dispose();
    this.face.dispose();
    this.characterManager.dispose();
    this.atmosphere?.dispose();
    this.weather?.dispose();
    this.world.dispose();
    this.portraitFill.removeFromParent();
    this.danceFills.forEach((light) => light.removeFromParent());
    this.postProcessing.dispose();
    this.renderer.dispose();
  }
}
