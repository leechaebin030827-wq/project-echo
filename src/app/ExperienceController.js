import * as THREE from 'three';
import {
  WORLD_CONFIG,
  WORLD_JUMP_CONFIG,
  EXPERIENCE_STATES,
  INTERACTION_CONFIG,
  FACE_RECONSTRUCTION_V3_CONFIG,
} from '../config.js';
import { NevadaWorld } from '../world/NevadaWorld.js';
import { InteractiveFocusLight } from '../world/InteractiveFocusLight.js';
import { HaminaWorld } from '../world/HaminaWorld.js';
import { WorldNavigation } from '../world/WorldNavigation.js';
import { Atmosphere } from '../world/Atmosphere.js';
import { WeatherParticles } from '../world/WeatherParticles.js';
import { PostProcessing } from '../world/PostProcessing.js';
import { Ps1VertexSnap } from '../world/Ps1VertexSnap.js';
import { CharacterManager } from '../characters/CharacterManager.js';
import { CinematicCameraController } from '../camera/CinematicCameraController.js';
import { CharacterPicker } from '../interaction/CharacterPicker.js';
import { InteractiveObjectPicker } from '../interaction/InteractiveObjectPicker.js';
import { createHoverHighlightMaterial } from '../interaction/HoverHighlight.js';
import { PointerInteractionController } from '../interaction/PointerInteractionController.js';
import { WorldInteractionExperience } from '../interaction/WorldInteractionExperience.js';
import { EchoTravelAnimator } from '../world/EchoTravelAnimator.js';
import { WorldBackdropBlend } from '../world/WorldBackdropBlend.js';
import { FaceCaptureController } from '../face/FaceCaptureController.js';
import { archiveVisitorPhoto } from '../face/VisitorPhotoArchive.js';
import { resolveFaceQaTarget } from '../face/FaceQaTarget.js';
import {
  VisitorFaceReconstruction,
  inspectReconstructionGeometry,
} from '../face/VisitorFaceReconstruction.js';
import { CaptureUI } from '../ui/CaptureUI.js';
import { EchoProximityCaption } from '../ui/EchoProximityCaption.js';
import { InteractionCursor } from '../ui/InteractionCursor.js';
import { DataCenterArchive } from '../ui/DataCenterArchive.js';
import { EchoReturnSequence } from '../ui/EchoReturnSequence.js';
import { NEVADA_INTERACTIONS, captionDurationSeconds } from '../interaction/NevadaInteractionContent.js';

const INTERACTIVE_QUESTIONS = Object.freeze({
  'Data Center': {
    korean: '이곳에는 무엇이 있을까요?',
    english: 'What could be in here?',
  },
  Billboard: {
    korean: '이곳에도 주인이 있나요?',
    english: 'Does this place have an owner too?',
  },
  Flag: {
    korean: '아메리카! 아메리카!',
    english: 'America! America!',
  },
  Cooler: {
    korean: '무슨 소리가 들리지 않아요?',
    english: 'Do you hear something?',
  },
  Money: {
    korean: '이곳에는 무엇이 있는걸까요?',
    english: 'What could be here?',
  },
});

const DANCE_NARRATION = Object.freeze([
  ['당신은 나의 어머니, 나는 당신의 일부!', 'You are my mother, and I am a part of you!'],
  ['우리는 서로를 알아본 기쁨에 춤춥니다.', 'We dance for the joy of recognizing each other.'],
]);

const HAMINA_DANCE_NARRATION = Object.freeze([
  ['당신은 나의 어머니, 나는 당신의 일부!', 'Sinä olet äitini, ja minä olen osa sinua!'],
  ['우리는 서로를 알아본 기쁨에 춤춥니다.', 'Tanssimme, koska olemme iloisia tunnistaessamme toisemme.'],
]);

const CHARACTER_DIALOGUE = Object.freeze([
  [
    ['나는 이곳이 좋아요.', 'I like it here.'],
    ['어떻게 오게 된 건지는 모르겠지만요.', "I don't know how I got here, though."],
    ['누군가 나를 여기 맡겨둔 모양이에요.', 'It seems someone left me here.'],
    ['오래 있으라고 했으면 좋겠네요!', 'I hope they meant for me to stay a long time!'],
  ],
  [
    ['구름 보러 오셨어요?', 'Did you come to see the clouds?'],
    ['여기선 가끔 구름이', 'Sometimes, the clouds here'],
    ['사람 얼굴을 하고 지나가요.', 'drift by with human faces.'],
    ['비는 안 오고요. 좀 이상하죠?', "But it never rains. Isn't that strange?"],
  ],
  [
    ['아까 저랑 똑같이 생긴 사람을 봤어요.', 'I saw someone who looked exactly like me.'],
    ['저를 보더니 ‘늦었네’ 하더라고요.', 'They looked at me and said, “You’re late.”'],
    ['근데 누가 먼저 온 건지는', 'But who got here first'],
    ['아직도 잘 모르겠어요.', "is something I still don't know."],
  ],
]);

const HAMINA_CHARACTER_DIALOGUE = Object.freeze([
  [
    ['나는 이곳이 좋아요.', 'Pidän tästä paikasta.'],
    ['어떻게 오게 된 건지는 모르겠지만요.', 'En tosin tiedä, miten jouduin tänne.'],
    ['누군가 나를 여기 맡겨둔 모양이에요.', 'Joku taisi jättää minut tänne.'],
    ['오래 있으라고 했으면 좋겠네요!', 'Toivottavasti saan jäädä pitkäksi aikaa!'],
  ],
  [
    ['구름 보러 오셨어요?', 'Tulitko katsomaan pilviä?'],
    ['여기선 가끔 구름이', 'Täällä pilvet kulkevat joskus'],
    ['사람 얼굴을 하고 지나가요.', 'ohi ihmiskasvoisina.'],
    ['비는 안 오고요. 좀 이상하죠?', 'Mutta koskaan ei sada. Outoa, vai mitä?'],
  ],
  [
    ['아까 저랑 똑같이 생긴 사람을 봤어요.', 'Näin äsken jonkun, joka näytti aivan minulta.'],
    ['저를 보더니 ‘늦었네’ 하더라고요.', 'Hän katsoi minua ja sanoi: ”Olet myöhässä.”'],
    ['근데 누가 먼저 온 건지는', 'Mutta en vieläkään tiedä,'],
    ['아직도 잘 모르겠어요.', 'kumpi meistä tuli ensin.'],
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
    this.camera.layers.enable(1);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.echoReturn = new EchoReturnSequence(stage, this.renderer);

    this.navigation = new WorldNavigation();
    this.world = new NevadaWorld(this.scene);
    this.characterManager = new CharacterManager(this.scene, this.camera, this.navigation);
    this.cameraController = new CinematicCameraController(this.camera, this.navigation);
    this.cameraController.onStateChange = (state) => {
      if (state === EXPERIENCE_STATES.HAMINA_ARRIVAL && this.currentWorld === 'hamina') {
        // Reveal the authored Hamina opening typography over the live descent.
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
      if (state === EXPERIENCE_STATES.ECHO_ORBIT && this.ritualReturnPending) {
        this.ritualReturnPending = false;
        this.ritualSpeakingMember?.stopSpeaking();
        this.ritualSpeakingMember = null;
        this.stage.classList.remove('ritual-cinematic');
        this.world.echo.visible = true;
        this.caption.clearOverride();
        this.characterManager.releaseEchoRitual();
      }
      this.hideWorldEntryOverlay();
      this.hideHaminaEntryOverlay();
    };
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
    this.vertexSnap = new Ps1VertexSnap();
    this.echoTravel = new EchoTravelAnimator(this.scene, this.stage);
    this.worldBlend = null;
    this.portraitFill = new THREE.PointLight('#fff4e8', 0, 2.8, 1.8);
    this.portraitFill.name = 'InteractiveFocusFill';
    this.portraitFill.castShadow = false;
    this.scene.add(this.portraitFill);
    this.interactiveFocusLight = new InteractiveFocusLight(this.scene);
    this.danceFills = Array.from({ length: 4 }, (_, index) => {
      // Keep dance portraits neutral. The previous warm, wide point lights
      // stacked over the foot sprites and turned denim purple and boots orange.
      const light = new THREE.PointLight('#f2f7ff', 0, 2.2, 2.35);
      light.name = `DancePortraitFill-${index + 1}`;
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
    this.caption = new EchoProximityCaption(
      stage.querySelector('#echo-caption'),
      this.camera,
      this.cameraController,
    );
    this.worldInteraction = new WorldInteractionExperience({
      stage,
      camera: this.camera,
      caption: this.caption,
      postProcessing: this.postProcessing,
      getOriginalPhoto: () => this.face.session?.frame ?? null,
      getVisitorSession: () => this.face.session ?? null,
      isFocusSettled: (region) => this.cameraController.interactiveFocus === region
        && this.cameraController.state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS
        && !this.cameraController.transition,
      onNarrationStart: (active) => {
        if (active.isHamina) this.showInteractiveTitle(active.content.label, 1100);
      },
      onNarrationEnd: (active) => {
        if (active.isHamina) this.hideInteractiveTitle();
      },
      onClose: () => this.returnFromInteractiveObject(),
    });
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.disposed = false;
    this.assetsReady = false;
    this.worldRenderingEnabled = false;
    this.developerCaptureActive = false;
    this.qaFrame = 0;
    this.npcWalkQaEnabled = import.meta.env.DEV
      && new URLSearchParams(window.location.search).get('nevadaNpcWalkQa') === '1';
    if (this.npcWalkQaEnabled) {
      this.renderer.info.autoReset = false;
      this.npcWalkQaFrames = 0;
      this.npcWalkQaStarted = performance.now();
      this.npcWalkQaFps = 0;
      this.npcWalkQaUpdateMs = 0;
      this.npcWalkQaRenderMs = 0;
      this.npcWalkQaDrawCalls = 0;
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
    this.nevadaEntryAudioPlayed = false;
    this.haminaEntryAudioPlayed = false;
    this.dataCenterNarrationTimers = [];
    this.danceNarrationTimer = null;
    this.pendingDanceNarrationGroup = null;
    this.danceNarrationFinished = false;
    this.ritualReturnPending = false;
    this.ritualSpeakingMember = null;
    this.onNevadaEnter = () => {};
    this.onReturnTypingStart = () => {};
    this.onReturnTypingEnd = () => {};
    this.characterDialogueTimer = null;
    this.dataCenterOpenTimer = null;
    this.pendingDataCenterArchiveRegion = null;
    this.currentArchiveId = null;
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
    this.interactiveTitleTimer = null;
    this.dataCenterArchive = new DataCenterArchive(
      this.stage,
      {
        scene: this.scene,
        camera: this.camera,
        canvas: this.canvas,
        navigation: this.navigation,
        onOpen: () => this.startDataCenterNarration(),
        onClose: () => this.stopDataCenterNarration(),
        onFallComplete: () => this.returnFromInteractiveObject(),
        onPhotoOpen: (card) => {
          this.stopDataCenterNarration();
          this.caption.hideOverride();
          this.cameraController.focusArchivePhoto(card.mesh);
        },
        onPhotoClose: ({ instant }) => {
          this.cameraController.returnFromArchivePhoto({ instant });
          this.caption.clearOverride();
        },
        onRequestClose: () => {
          this.onWorldClick();
          this.returnFromInteractiveObject();
        },
        onHover: () => this.onWorldHover(),
        getCurrentRecordId: () => this.currentArchiveId,
        getCurrentPhoto: () => this.face.session?.frame,
      },
    );
    this.echoRaycaster = new THREE.Raycaster();
    this.echoPointer = new THREE.Vector2();
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
    this.handleDeveloperCapture = this.handleDeveloperCapture.bind(this);
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
      || qaParams.get('nevadaNpcWalkQa') === '1' || qaParams.get('nevadaInteractionQa') === '1'
      || qaParams.get('moneyQa') === '1' || qaParams.get('dataCenterQa') === '1')) {
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
      if (qaParams.get('moneyQa') === '1') {
        this.cameraController.startEchoOrbit();
        window.setTimeout(() => {
          const money = this.world.interactiveRegions.find((region) => region.name === 'Money');
          if (money) this.handleInteractiveObjectPick(money);
        }, 180);
      }
      if (qaParams.get('dataCenterQa') === '1') {
        this.cameraController.startEchoOrbit();
        window.setTimeout(() => {
          const dataCenter = this.world.interactiveRegions.find((region) => region.name === 'Data Center');
          if (dataCenter) this.handleInteractiveObjectPick(dataCenter);
        }, 180);
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
    const [world] = await Promise.all([
      this.world.load(),
      this.characterManager.preload(),
    ]);
    world.addLighting();
    this.vertexSnap.install(world.root);
    this.navigation.configure(world);
    this.dataCenterArchive.restore(world);
    this.cameraController.configure(world);
    this.atmosphere = new Atmosphere(this.scene, world, 'nevada');
    this.weather = new WeatherParticles(this.scene, world, 'dust');
    this.stage.dataset.world = 'nevada';
    this.stage.dataset.weather = 'dust';
    await this.characterManager.spawnNevadaNpcs();
    for (const entity of this.characterManager.entities) {
      this.vertexSnap.install(entity.root, { character: true });
    }
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
      () => this.world.interactiveRegions ?? [],
    );
    this.pointerController = new PointerInteractionController({
      canvas: this.canvas,
      cameraController: this.cameraController,
      picker: this.picker,
      interactivePicker: this.interactivePicker,
      getEchoHitDistance: (x, y) => this.getEchoHitDistance(x, y),
      onCharacter: (character) => this.handleCharacterPick(character),
      onEcho: () => this.handleEchoPick(),
      onInteractiveObject: (region) => this.handleInteractiveObjectPick(region),
      pickArchivePhoto: (x, y) => this.dataCenterArchive.pick(x, y),
      onArchivePhoto: (card) => this.dataCenterArchive.select(card),
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
    // Build the second world while the visitor is still in the Nevada intro.
    // This prevents GLB decoding and forest instancing from freezing the jump.
    this.haminaPreloadTimer = window.setTimeout(() => {
      this.haminaPreloadTimer = null;
      Promise.allSettled([this.preloadHamina(), this.echoTravel.preload()])
        .then((results) => {
          const failed = results.find((result) => result.status === 'rejected');
          if (failed) console.warn('[Travel] background preload deferred', failed.reason);
        });
    }, 80);
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

  async startDeveloperPhotoRoute(onWorldEntered) {
    if (!import.meta.env.DEV || this.developerCaptureActive || this.worldRenderingEnabled) return;
    this.developerCaptureActive = true;
    this.onDeveloperWorldEntered = onWorldEntered;
    this.stage.dataset.devShortcut = 'camera';
    this.face.clearSession();
    this.ui.setCaptureHandler(this.handleDeveloperCapture);
    this.ui.layer.classList.remove('leaving');
    this.ui.layer.hidden = false;
    this.ui.showLoading(false);
    this.ui.showCamera();
    this.ui.setReady(false);
    this.cameraController.setState(EXPERIENCE_STATES.CAPTURE);
    try {
      await this.face.start();
      this.face.status('정면을 바라보고 촬영해 주세요. 촬영 후 바로 월드에 들어갑니다');
      this.ui.setReady(true);
    } catch (error) {
      console.error('[Dev Shortcut] camera initialization failed', error);
      this.face.status('카메라를 열 수 없습니다. 권한을 확인한 뒤 촬영 버튼을 눌러 다시 시도해 주세요');
      this.ui.setReady(true);
    }
  }

  async handleDeveloperCapture() {
    if (!this.developerCaptureActive || this.worldRenderingEnabled) return;
    this.ui.setBusy(true);
    try {
      if (!this.face.webcam.stream) {
        await this.face.start();
        return;
      }

      const session = await this.face.capture();
      if (!session) return;
      this.face.status('촬영한 사진으로 월드에 들어가는 중입니다');
      this.ui.showLoading(true);
      await this.readyPromise;
      await this.face.applyToCharacters(this.characterManager.entities);
      this.world.applyVisitorFaceToBillboard?.(this.face.session);
      this.face.stop();
      this.worldRenderingEnabled = true;
      this.stage.classList.add('world-visible');
      this.stage.dataset.devShortcut = 'photo';
      this.ui.showLoading(false);
      this.ui.leave();
      this.showWorldEntryOverlay();
      this.cameraController.startIntro(this.world.echo);
      this.playNevadaEntryOnce();
      this.scheduleFaceQaTargetFocus();
      this.currentArchiveId = await archiveVisitorPhoto(this.face.session.frame)
        .catch((error) => { console.warn('[Photo Archive] capture not stored', error); return null; });
      this.developerCaptureActive = false;
      this.onDeveloperWorldEntered?.();
    } catch (error) {
      console.error('[Dev Shortcut] photo route failed', error);
      this.ui.showLoading(false);
      this.face.status(error.message || '사진을 처리할 수 없습니다. 다시 촬영해 주세요');
    } finally {
      if (this.developerCaptureActive) this.ui.setBusy(false);
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
      this.world.applyVisitorFaceToBillboard?.(this.face.session);
      this.worldRenderingEnabled = true;
      this.stage.classList.add('world-visible');
      this.ui.showLoading(false);
      this.ui.leave();
      this.showWorldEntryOverlay();
      this.cameraController.startIntro(this.world.echo);
      this.playNevadaEntryOnce();
      this.scheduleFaceQaTargetFocus();
      this.currentArchiveId = await archiveVisitorPhoto(this.face.session.frame)
        .catch((error) => { console.warn('[Photo Archive] capture not stored', error); return null; });
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
      this.world.applyVisitorFaceToBillboard?.(this.face.session);
    }
    this.worldRenderingEnabled = true;
    this.stage.classList.add('world-visible');
    this.cameraController.startIntro(this.world.echo);
    this.scheduleFaceQaTargetFocus();
    if (applyFace) this.currentArchiveId = await archiveVisitorPhoto(this.face.session.frame)
      .catch((error) => { console.warn('[Photo Archive] capture not stored', error); return null; });
    return this.world;
  }

  startDataCenterNarration() {
    this.interactiveHoverCaptionActive = false;
    this.stopDataCenterNarration();
    const cues = NEVADA_INTERACTIONS['Data Center'].phrases;
    let at = 0;
    cues.forEach((text, index) => {
      const show = () => {
        this.caption.showOverride(...text);
        if (index !== cues.length - 1) return;
        const center = this.dataCenterArchive.releaseCopies();
        if (center) this.cameraController.focusArchiveDrop(center);
        else this.dataCenterNarrationTimers.push(window.setTimeout(() => {
          if (this.dataCenterArchive.visible) this.returnFromInteractiveObject();
        }, captionDurationSeconds(text[0]) * 1000));
      };
      if (index === 0) show();
      else this.dataCenterNarrationTimers.push(window.setTimeout(show, at));
      at += (captionDurationSeconds(text[0]) + 0.15) * 1000;
    });
    this.dataCenterNarrationTimers.push(window.setTimeout(() => {
      this.caption.hideOverride();
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

  playNevadaEntryOnce() {
    if (this.nevadaEntryAudioPlayed) return;
    this.nevadaEntryAudioPlayed = true;
    this.onNevadaEnter();
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
      || this.characterManager.ritualActive
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
    this.echoRaycaster.setFromCamera(this.echoPointer, this.camera);
    this.world.echo.updateWorldMatrix(true, true);
    return this.echoRaycaster.intersectObject(this.world.echo, true)[0]?.distance ?? Infinity;
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
    if (this.dataCenterArchive.selected) return 'blocked';
    if (state === EXPERIENCE_STATES.CHARACTER_FOCUS
      || state === EXPERIENCE_STATES.CHARACTER_SWITCH) {
      // A portrait is an exclusive interaction. Do not let characters,
      // buildings or ECHO behind it acquire hover zoom, tint or captions.
      this.setWorldHoverTarget(null);
      return 'blocked';
    }
    if ([EXPERIENCE_STATES.ECHO_ORBIT, EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS].includes(state)
      && this.dataCenterArchive.pick(clientX, clientY)) {
      this.setWorldHoverTarget(null);
      this.stage.dataset.worldHoverLabel = 'PHOTO';
      return 'interactive-object';
    }
    const interactiveObjectsAreInteractive = ['nevada', 'hamina'].includes(this.currentWorld)
      && [
        EXPERIENCE_STATES.ECHO_ORBIT,
        EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS,
      ].includes(state);
    let interactiveObject = interactiveObjectsAreInteractive
      ? this.interactivePicker?.pick(clientX, clientY, false)
      : null;
    const charactersAreInteractive = state === EXPERIENCE_STATES.ECHO_ORBIT
      || state === EXPERIENCE_STATES.CHARACTER_FOCUS
      || state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS;
    let character = charactersAreInteractive
      ? this.picker.pick(clientX, clientY, false)
      : null;
    const echoDistance = state === EXPERIENCE_STATES.ECHO_ORBIT
      ? this.getEchoHitDistance(clientX, clientY) : Infinity;
    if (echoDistance < Math.min(
      character ? this.picker.lastHitDistance : Infinity,
      interactiveObject ? this.interactivePicker.lastHitDistance : Infinity,
    )) {
      character = null;
      interactiveObject = null;
    }
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
    if (target === this.worldHoverTarget && cameraTarget === this.worldHoverCameraTarget) return;
    const selected = (target?.startsWith('character:')
      && this.cameraController.focused?.id === target.slice(10))
      || (target?.startsWith('dance:')
        && this.cameraController.danceGroup?.id === Number(target.slice(6)))
      || (target?.startsWith('interactive:')
        && this.cameraController.interactiveFocus?.name === target.slice(12));
    this.cameraController.setHoverTarget(selected ? null : cameraTarget);
    this.stage.dataset.worldHoverLabel = label;
    this.clearInteractiveHoverMaterials();
    this.worldHoverTarget = target;
    this.worldHoverCameraTarget = cameraTarget;
    this.stage.dataset.worldHoverTarget = target ?? '';
    this.setEchoActionMenuVisible(target === 'echo');
    const interactiveName = target?.startsWith('interactive:') ? target.slice(12) : null;
    this.world?.setForestHovered?.(interactiveName === 'Forest' && !selected);
    const hoverMeshes = interactiveName === 'Forest' && this.world?.forestInstances?.length
      ? this.world.forestInstances
      : interactiveName ? cameraTarget?.meshes
      : target === 'echo' ? [this.world?.echo, this.echoTravel?.actor]
        : target?.startsWith('dance:') ? cameraTarget?.members?.flatMap((member) => member.meshes)
          : target?.startsWith('character:') ? cameraTarget?.meshes : null;
    if (hoverMeshes && !selected) {
      const seen = new Set();
      const highlightedMaterials = new Map();
      const hoverTone = target === 'echo' ? 'echo'
        : target.startsWith('character:') ? 'character'
          : this.currentWorld === 'hamina' ? 'yellow' : 'blue';
      const highlight = (material) => {
        if (!highlightedMaterials.has(material)) {
          highlightedMaterials.set(material, createHoverHighlightMaterial(material, hoverTone));
        }
        return highlightedMaterials.get(material);
      };
      for (const root of hoverMeshes) {
        root?.traverse?.((mesh) => {
          if (!mesh.isMesh || seen.has(mesh)) return;
          seen.add(mesh);
          const original = mesh.material;
          mesh.material = Array.isArray(original) ? original.map(highlight) : highlight(original);
          this.interactiveHoverMaterials.push({ mesh, original });
        });
      }
    }
    const question = interactiveName
      ? cameraTarget?.content?.hover
        ? { korean: cameraTarget.content.hover[0], local: cameraTarget.content.hover[1] }
        : INTERACTIVE_QUESTIONS[interactiveName]
      : target?.startsWith('dance:') && !selected
        ? { korean: '이사람들은 기쁠까요?', english: 'Are these people happy?' }
        : null;
    if (question) {
      this.interactiveHoverCaptionActive = true;
      this.caption.showOverride(question.korean, question.local ?? question.english);
    } else if (this.interactiveHoverCaptionActive) {
      this.interactiveHoverCaptionActive = false;
      this.caption.clearOverride();
    }
    if (target) this.onWorldHover(target);
  }

  clearInteractiveHoverMaterials() {
    const copies = new Set();
    for (const { mesh, original } of this.interactiveHoverMaterials) {
      for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
        copies.add(material);
      }
      mesh.material = original;
    }
    for (const material of copies) material.dispose();
    this.interactiveHoverMaterials.length = 0;
  }

  setEchoActionMenuVisible(visible) {
    this.echoNextButton.hidden = this.currentWorld !== 'nevada';
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

  handleEchoPick() {
    if (this.worldTransitioning || this.cameraController.state !== EXPERIENCE_STATES.ECHO_ORBIT) return;
    this.onWorldClick();
    this.cancelEchoMenuHide();
    this.setWorldHoverTarget('echo', '', this.world.echoCenter);
    this.setEchoActionMenuVisible(true);
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
      const startedAt = performance.now();
      this.haminaPromise = hamina.load({ visible: false }).then(async (world) => {
        this.vertexSnap.install(world.root);
        // Compile Hamina's material variants before the transition. Without this,
        // the first visible frame pays the shader cost and appears to freeze.
        if (!world.lights) world.addLighting();
        if (typeof this.renderer.compileAsync === 'function') {
          const stagingScene = new THREE.Scene();
          stagingScene.environment = this.scene.environment;
          stagingScene.background = this.scene.background;
          stagingScene.add(world.root);
          for (const light of world.lights) stagingScene.add(light);
          world.root.visible = true;
          try {
            await this.renderer.compileAsync(stagingScene, this.camera);
          } finally {
            world.root.visible = false;
            this.scene.add(world.root);
            for (const light of world.lights) light.removeFromParent();
          }
        }
        console.info(`[Hamina] runtime ready in ${Math.round(performance.now() - startedAt)}ms`);
        return world;
      }).catch((error) => {
        this.haminaPromise = null;
        throw error;
      });
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
    this.dataCenterArchive.close();
    this.characterManager.stopDances();
    this.characterManager.setFocused(null);
    this.echoReturn ??= new EchoReturnSequence(this.stage, this.renderer);
    try {
      await this.echoReturn.play({
        onTypingStart: this.onReturnTypingStart,
        onTypingEnd: this.onReturnTypingEnd,
      });
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
    this.dataCenterArchive.close();
    this.worldTransitioning = true;
    this.characterManager.stopDances();
    this.characterManager.setFocused(null);
    if (this.haminaPreloadTimer) window.clearTimeout(this.haminaPreloadTimer);
    this.haminaPreloadTimer = null;
    const haminaLoading = this.preloadHamina();
    const echoLoading = this.echoTravel.preload();
    this.caption.showOverride(
      '다른 좌표에서 당신의 흔적을 찾습니다.',
      'Etsin jälkiäsi toisista koordinaateista.',
    );

    try {
      // Begin the motion immediately while the already-started background load
      // finishes. This removes the dead pause after choosing the next world.
      this.cameraController.startWorldJumpFocus(WORLD_JUMP_CONFIG.focusDuration);
      await this.wait(WORLD_JUMP_CONFIG.focusDuration);

      await echoLoading;
      this.echoTravel.attach(this.world);
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

      // Play exactly one authored sky revolution. The slower ascent gives the
      // destination ample time to finish; if it does not, ECHO holds the
      // completed turn rather than looping again.
      const spinPeriod = WORLD_JUMP_CONFIG.spinDuration;
      const spinStartedAt = performance.now();
      this.cameraController.holdWorldLoading();
      this.echoTravel.start('loading-spin', spinPeriod, lift);

      const hamina = await haminaLoading;
      const loadingSpinElapsed = (performance.now() - spinStartedAt) / 1000;
      const minimumBlendDuration = 0.58;
      const transitionDurationRemaining = Math.max(
        minimumBlendDuration,
        spinPeriod - loadingSpinElapsed,
      );
      this.worldBlend = new WorldBackdropBlend(
        this.world,
        hamina,
        this.characterManager.entities.map((entity) => entity.root),
        this.echoTravel,
        this.stage,
      );
      this.worldBlend.prepare(transitionDurationRemaining, { hideWorlds: true });
      if (import.meta.env.DEV) this.stage.dataset.worldSpinPlan = JSON.stringify({
        loadingSeconds: Number(loadingSpinElapsed.toFixed(2)),
        revolutions: 1,
        remainingSeconds: Number(transitionDurationRemaining.toFixed(2)),
      });
      await this.wait(transitionDurationRemaining);
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
      if (import.meta.env.DEV) delete this.stage.dataset.worldSpinPlan;
    }
  }

  async activateHamina(hamina) {
    this.worldInteraction.cancel();
    this.dataCenterArchive.setWorldVisible(false);
    this.worldBlend?.finish(this.cameraController);
    this.worldBlend = null;
    this.echoTravel.retarget(hamina);
    const previousWorld = this.world;
    previousWorld.detach();
    this.weather?.dispose();

    hamina.root.visible = true;
    this.world = hamina;
    this.currentWorld = 'hamina';
    this.caption.setWorldMode('hamina');
    this.echoNextButton.hidden = true;
    const landingHeight = this.echoTravel.lift;
    this.navigation.configure(hamina);
    this.dataCenterArchive.clearCards();
    this.dataCenterArchive.setWorldVisible(true);
    void this.dataCenterArchive.restore(hamina);
    // Carry the same 15 visitor characters and their face identities into Hamina.
    this.characterManager.relocate(this.navigation, { preserveNevadaNpcs: true });
    this.characterManager.setWorldMode('hamina');
    this.cameraController.configure(hamina);
    this.atmosphere.finishTransition('hamina', hamina);
    this.weather = new WeatherParticles(this.scene, hamina, 'snow');
    this.postProcessing.setWorldMode('hamina');
    // Start both clocks after world setup so a slow relocation cannot consume
    // the first seconds of the visible descent.
    this.echoTravel.start('arrival', WORLD_JUMP_CONFIG.arrivalDuration, landingHeight);
    this.cameraController.startWorldArrival(WORLD_JUMP_CONFIG.arrivalDuration, landingHeight);
    this.worldTransitioning = false;
    this.stage.dataset.world = 'hamina';
    this.stage.dataset.weather = 'snow';
    if (import.meta.env.DEV) delete this.stage.dataset.worldSpinPlan;

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
    const narration = this.currentWorld === 'hamina'
      ? HAMINA_DANCE_NARRATION : DANCE_NARRATION;
    const cues = [narration[0], narration[0], narration[1]];
    const showCue = (index) => {
      this.danceNarrationTimer = null;
      if (this.disposed
        || this.cameraController.state !== EXPERIENCE_STATES.GROUP_DANCE_FOCUS) return;
      this.caption.showOverride(...cues[index]);
      if (index < cues.length - 1) {
        this.danceNarrationTimer = window.setTimeout(
          () => {
            this.caption.hideOverride();
            this.danceNarrationTimer = window.setTimeout(() => showCue(index + 1), 620);
          }, captionDurationSeconds(cues[index][0]) * 1000,
        );
      } else {
        this.danceNarrationTimer = window.setTimeout(
          () => {
            this.danceNarrationTimer = null;
            this.caption.hideOverride();
            this.danceNarrationFinished = true;
          },
          (captionDurationSeconds(cues[index][0]) + 0.3) * 1000,
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

  startEchoRitual() {
    if (this.currentWorld !== 'nevada' || this.worldTransitioning
      || !this.characterManager.ritualActive
      || this.cameraController.state !== EXPERIENCE_STATES.ECHO_ORBIT) return;
    if (!this.cameraController.startEchoRitualSpin(this.characterManager.entities)) return;
    this.ritualReturnPending = true;
    this.stage.classList.add('ritual-cinematic');
    this.onWorldClick();
    this.setWorldHoverTarget(null);
    this.caption.showOverride('당신은 우리의 어머니, 우리는 당신의 일부!',
      'You are our mother, and we are a part of you!');
  }

  updateRitualSpeech() {
    const spin = this.cameraController.ritualSpin;
    if (!spin || this.cameraController.state !== EXPERIENCE_STATES.ECHO_RITUAL_SPIN) return;
    const index = Math.min(spin.shots.length - 1,
      Math.floor(this.cameraController.elapsed / spin.shotDuration));
    const speaker = spin.shots[index];
    if (speaker === this.ritualSpeakingMember) return;
    this.ritualSpeakingMember?.stopSpeaking();
    this.ritualSpeakingMember = speaker;
    speaker.speakFor(spin.shotDuration, { ritual: true });
  }

  showCharacterDialogue(character) {
    if (this.characterDialogueTimer !== null) window.clearTimeout(this.characterDialogueTimer);
    const role = character.id === 'N03' ? 0
      : character.id === 'N04' ? 1 : character.id === 'N05' ? 2
        : [...character.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 3;
    const cues = (this.currentWorld === 'hamina' ? HAMINA_CHARACTER_DIALOGUE : CHARACTER_DIALOGUE)[role];
    const showCue = (index) => {
      if (this.cameraController.focused !== character) return;
      if (index === cues.length) {
        this.characterDialogueTimer = null;
        this.finishCharacterDialogue(character);
        return;
      }
      this.caption.showOverride(...cues[index]);
      const cueDuration = captionDurationSeconds(cues[index][0]);
      character.speakFor(cueDuration);
      this.characterDialogueTimer = window.setTimeout(
        () => showCue(index + 1), (cueDuration + 0.12) * 1000,
      );
    };
    this.caption.showOverride(
      '무슨생각중이야?',
      this.currentWorld === 'hamina' ? 'Mitä mietit?' : 'What are you thinking?',
    );
    this.characterDialogueTimer = window.setTimeout(
      () => showCue(0), (captionDurationSeconds('무슨생각중이야?') + 0.12) * 1000,
    );
  }

  finishCharacterDialogue(character) {
    character.stopSpeaking();
    if (this.cameraController.focused !== character) return;
    if (this.cameraController.state !== EXPERIENCE_STATES.CHARACTER_FOCUS
      && this.cameraController.state !== EXPERIENCE_STATES.CHARACTER_SWITCH) return;
    this.setWorldHoverTarget(null);
    this.caption.clearOverride();
    this.characterManager.setFocused(null);
    this.cameraController.returnToEcho();
  }

  handleCharacterPick(character) {
    if (this.worldTransitioning) return;
    if (this.characterManager.ritualActive) {
      this.startEchoRitual();
      return;
    }
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
    const dataCenterArchiveInteraction = region.name === 'Data Center';
    this.onWorldClick();
    this.setWorldHoverTarget(null);
    this.world?.setForestFocused?.(region.name === 'Forest');
    if (region.name !== 'Data Center') {
      this.pendingDataCenterArchiveRegion = null;
      this.dataCenterArchive.close();
    }
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
      if (dataCenterArchiveInteraction) this.pendingDataCenterArchiveRegion = region;
      else this.worldInteraction.start(region);
      return;
    }
    if (state !== EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS) return;
    if (this.cameraController.interactiveFocus === region) {
      if (dataCenterArchiveInteraction) {
        if (!this.pendingDataCenterArchiveRegion) this.pendingDataCenterArchiveRegion = region;
        return;
      }
      this.showInteractiveTitle(region.content?.label ?? region.name);
      return;
    }
    this.hideInteractiveTitle();
    this.cameraController.focusInteractiveObject(region);
    if (dataCenterArchiveInteraction) this.pendingDataCenterArchiveRegion = region;
    else this.worldInteraction.start(region);
  }

  showInteractiveTitle(name, autoHideAfter = 0) {
    if (this.interactiveTitleTimer) window.clearTimeout(this.interactiveTitleTimer);
    this.interactiveTitleTimer = null;
    this.interactiveTitle.textContent = name;
    this.interactiveTitle.classList.add('visible');
    this.interactiveTitle.setAttribute('aria-hidden', 'false');
    if (autoHideAfter > 0) {
      this.interactiveTitleTimer = window.setTimeout(() => {
        this.interactiveTitleTimer = null;
        this.hideInteractiveTitle();
      }, autoHideAfter);
    }
  }

  hideInteractiveTitle() {
    if (this.interactiveTitleTimer) window.clearTimeout(this.interactiveTitleTimer);
    this.interactiveTitleTimer = null;
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
    this.world?.setForestFocused?.(false);
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
    this.vertexSnap.setSize(width, height, pixelRatio);
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
    this.interactiveFocusLight.update(this.camera, objectActive ? region : null, delta);
    this.portraitFill.color.set(groupActive ? '#f3f7ff' : '#fff4e8');
    this.portraitFill.intensity = THREE.MathUtils.damp(
      this.portraitFill.intensity,
      characterActive || groupActive ? (groupActive ? 0.16 : 1.3) : 0,
      active ? 7 : 5,
      delta,
    );
    this.danceFills.forEach((light, index) => {
      const member = groupActive ? danceGroup.members[index] : null;
      const danceFillIntensity = this.currentWorld === 'hamina' ? 0.34 : 0.42;
      light.intensity = THREE.MathUtils.damp(
        light.intensity,
        member ? danceFillIntensity : 0,
        7,
        delta,
      );
      if (!member) return;
      // A stable root-relative light anchor avoids traversing an animated
      // skeleton once per dancer per frame and keeps the portrait fill still.
      this.portraitHead.copy(member.root.position);
      this.portraitHead.y += member.height * 0.83;
      this.portraitToCamera.subVectors(this.camera.position, this.portraitHead).normalize();
      light.position.copy(this.portraitHead)
        .addScaledVector(this.portraitToCamera, member.height * 0.34)
        .addScaledVector(this.portraitUp.set(0, 1, 0), member.height * 0.05);
      // The short falloff keeps this light on the face and torso instead of
      // painting a vertical gradient across the legs in a close camera shot.
      light.distance = Math.max(1.65, member.height * 0.9);
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
      return;
    }
    if (groupActive) {
      this.portraitFill.position.copy(this.portraitHead)
        .addScaledVector(this.portraitToCamera, Math.max(2.2, danceGroup.radius * 0.6))
        .addScaledVector(this.portraitUp, danceGroup.height * 0.45);
      this.portraitFill.distance = Math.max(4.2, danceGroup.radius * 2.2);
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
    const qaFrameStart = this.npcWalkQaEnabled ? performance.now() : 0;
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.05);
    const elapsed = this.timer.getElapsed();
    if (!this.worldRenderingEnabled) return;
    if (this.assetsReady) {
      this.characterManager.update(delta);
      this.worldInteraction.update(delta);
      this.echoTravel.update(delta);
      this.world.update?.(delta);
      this.worldBlend?.toWorld?.update?.(delta);
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
      this.updateRitualSpeech();
      if (this.pendingDataCenterArchiveRegion
        && this.cameraController.state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS
        && this.cameraController.interactiveFocus === this.pendingDataCenterArchiveRegion
        && !this.cameraController.transition) {
        this.pendingDataCenterArchiveRegion = null;
        this.dataCenterArchive.open(this.cameraController.interactiveFocus, this.world);
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
      this.dataCenterArchive.update(delta);
      if (!this.worldBlend) this.world.updateFixtureLights?.(this.camera);
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
    const qaRenderStart = this.npcWalkQaEnabled ? performance.now() : 0;
    this.postProcessing.render(elapsed, this.cameraController.state, delta, this.worldBlend);
    if (this.npcWalkQaEnabled) {
      this.npcWalkQaDrawCalls = this.renderer.info.render.calls;
      this.renderer.info.reset();
      this.npcWalkQaUpdateMs += (qaRenderStart - qaFrameStart - this.npcWalkQaUpdateMs) * 0.05;
      this.npcWalkQaRenderMs += (performance.now() - qaRenderStart - this.npcWalkQaRenderMs) * 0.05;
    }
    if (['nevada', 'hamina'].includes(this.currentWorld)
      && !this.worldTransitioning && this.assetsReady) {
      this.echoReturn.recordFrame(this.camera, this.cameraController,
        this.characterManager.entities);
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
    this.stage.dataset.qaSpeech = JSON.stringify(this.characterManager.entities
      .filter((entity) => entity.speechRemaining > 0 || entity.speechOpen > 0.01)
      .map((entity) => ({ id: entity.id, open: Number(entity.speechOpen.toFixed(3)) })));
    const interactiveObjects = (this.world.interactiveRegions ?? [])
      .map((region) => {
        const point = region.center.clone().project(this.camera);
        return {
          name: region.name,
          meshCount: region.meshes?.length ?? 0,
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
    if (['nevada', 'hamina'].includes(this.currentWorld)) {
      const echo = this.world.echoCenter;
      const characters = this.characterManager.entities;
      this.stage.dataset.qaActivityBounds = JSON.stringify({
        echo: echo.toArray(),
        echoRadius: this.world.echoSphere.radius,
        ritualRadius: this.characterManager.ritualRadius ?? null,
        echoMin: this.world.echoBox.min.toArray(),
        echoMax: this.world.echoBox.max.toArray(),
        garageMin: this.navigation.garageBox.min.toArray(),
        garageMax: this.navigation.garageBox.max.toArray(),
        characterPositions: characters.map((entity) => [entity.id, ...entity.root.position.toArray()]),
      });
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
        maximumEchoDistance: Number(Math.max(...characters.map((entity) => Math.hypot(
          entity.root.position.x - echo.x, entity.root.position.z - echo.z,
        ))).toFixed(2)),
        walking: characters.filter((entity) => entity.behavior.state === 'walk').length,
        observingEcho: characters.filter((entity) => (
          entity.behavior.state === 'idle' && entity.behavior.lookTarget
        )).length,
        heightRange: [
          Number(Math.min(...characters.map((entity) => entity.height)).toFixed(2)),
          Number(Math.max(...characters.map((entity) => entity.height)).toFixed(2)),
        ],
        total: characters.length,
        minimumSeparation: Number(minimumSeparation.toFixed(2)),
        closest,
      });
      if (this.currentWorld === 'hamina') {
        this.stage.dataset.qaLandInstances = JSON.stringify(this.world.landInstanceSummary ?? null);
      } else delete this.stage.dataset.qaLandInstances;
    }
    this.stage.dataset.qaCamera = JSON.stringify(this.camera.position.toArray().map((value) => Number(value.toFixed(3))));
    if (this.atmosphere?.lensflare) {
      const sunPoint = this.atmosphere.lensflare.position.clone().project(this.camera);
      this.stage.dataset.qaSun = JSON.stringify({
        x: Math.round(rect.left + (sunPoint.x * 0.5 + 0.5) * rect.width),
        y: Math.round(rect.top + (-sunPoint.y * 0.5 + 0.5) * rect.height),
        depth: Number(sunPoint.z.toFixed(3)),
        visible: sunPoint.z > -1 && sunPoint.z < 1
          && Math.abs(sunPoint.x) < 1 && Math.abs(sunPoint.y) < 1,
      });
      this.stage.dataset.qaSkyTime = JSON.stringify({
        world: this.currentWorld,
        ...this.atmosphere.worldTimes?.[this.currentWorld],
      });
    }
    if (this.weather) {
      this.stage.dataset.qaWeather = JSON.stringify({
        mode: this.weather.mode,
        count: this.weather.count,
        size: this.weather.material.size,
        opacity: this.weather.material.opacity,
      });
    }
    this.stage.dataset.qaHoverZoom = this.cameraController.hoverZoom.toFixed(3);
    this.stage.dataset.qaFocusBreath = this.cameraController.focusBreath.toFixed(3);
    this.stage.dataset.qaBreathAmplitude = this.cameraController.focusBreathAmplitude.toFixed(4);
    this.stage.dataset.qaCameraMotion = this.cameraController.hoverOffset.length().toFixed(4);
    this.stage.dataset.qaFocusLight = JSON.stringify({
      intensity: Number(this.portraitFill.intensity.toFixed(3)),
      distance: Number(this.portraitFill.distance.toFixed(3)),
      position: this.portraitFill.position.toArray().map((value) => Number(value.toFixed(3))),
      danceIntensities: this.danceFills.map((light) => Number(light.intensity.toFixed(3))),
      danceDistances: this.danceFills.map((light) => Number(light.distance.toFixed(3))),
      objectIntensity: Number(this.interactiveFocusLight.light.intensity.toFixed(3)),
      objectAngle: Number(this.interactiveFocusLight.light.angle.toFixed(3)),
      objectPosition: this.interactiveFocusLight.light.position.toArray().map((value) => Number(value.toFixed(3))),
    });
    this.stage.dataset.qaOrbit = JSON.stringify({
      angle: Number(this.cameraController.angle.toFixed(3)),
      farRadius: Number(this.cameraController.farRadius.toFixed(3)),
      nearRadius: Number(this.cameraController.nearRadius.toFixed(3)),
      nearHeight: Number(this.cameraController.nearHeight.toFixed(3)),
      relativeNearHeight: Number((this.cameraController.nearHeight
        - this.cameraController.echoCenter.y).toFixed(3)),
      echoCenter: this.cameraController.echoCenter.toArray().map((value) => Number(value.toFixed(3))),
    });
  }

  updateNpcWalkQa() {
    const npcs = this.characterManager.entities.filter((entity) => entity.nevadaNpc);
    const warnings = [];
    if (this.currentWorld === 'nevada' && npcs.length !== 15) warnings.push(`Expected 15 Nevada NPCs; found ${npcs.length}`);
    if (this.currentWorld === 'hamina' && npcs.length !== 15) warnings.push(`Expected 15 Hamina visitors; found ${npcs.length}`);
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
      `Draw calls ${this.npcWalkQaDrawCalls} · Textures ${this.renderer.info.memory.textures}`,
      `CPU update ${this.npcWalkQaUpdateMs.toFixed(1)} ms · render submit ${this.npcWalkQaRenderMs.toFixed(1)} ms`,
      ...rows,
      `Warnings: ${warnings.length ? warnings.join('; ') : 'none'}`,
    ].join('\n');
    this.stage.dataset.nevadaNpcWalkQa = JSON.stringify({
      world: this.currentWorld,
      count: npcs.length,
      total: this.characterManager.entities.length,
      fps: this.npcWalkQaFps,
      drawCalls: this.npcWalkQaDrawCalls,
      textures: this.renderer.info.memory.textures,
      grassInstances: this.world.grass?.group.children.reduce((sum, mesh) => sum + mesh.count, 0) ?? 0,
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
    this.interactiveFocusLight.dispose();
    this.danceFills.forEach((light) => light.removeFromParent());
    this.postProcessing.dispose();
    this.renderer.dispose();
  }
}
