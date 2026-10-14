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
import { PointerInteractionController } from '../interaction/PointerInteractionController.js';
import { FaceCaptureController } from '../face/FaceCaptureController.js';
import {
  VisitorFaceReconstruction,
  inspectReconstructionGeometry,
} from '../face/VisitorFaceReconstruction.js';
import { CaptureUI } from '../ui/CaptureUI.js';
import { EchoProximityCaption } from '../ui/EchoProximityCaption.js';
import { InteractionCursor } from '../ui/InteractionCursor.js';

export class ExperienceController {
  constructor(stage) {
    this.stage = stage;
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

    this.navigation = new WorldNavigation();
    this.world = new NevadaWorld(this.scene);
    this.characterManager = new CharacterManager(this.scene, this.camera, this.navigation);
    this.cameraController = new CinematicCameraController(this.camera, this.navigation);
    this.cameraController.onStateChange = (state) => {
      if (state === EXPERIENCE_STATES.INTRO_FAR_ORBIT) {
        if (this.currentWorld === 'hamina') {
          this.showHaminaEntryOverlay();
          if (!this.haminaEntryAudioPlayed) {
            this.haminaEntryAudioPlayed = true;
            this.onHaminaEnter();
          }
        }
        return;
      }
      if (state !== EXPERIENCE_STATES.HAMINA_ARRIVAL) {
        this.hideWorldEntryOverlay();
        this.hideHaminaEntryOverlay();
      }
    };
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
    this.portraitFill = new THREE.PointLight('#fff4e8', 0, 2.8, 1.8);
    this.portraitFill.name = 'FocusedCharacterPortraitFill';
    this.portraitFill.castShadow = false;
    this.scene.add(this.portraitFill);
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
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.disposed = false;
    this.assetsReady = false;
    this.worldRenderingEnabled = false;
    this.qaFrame = 0;
    this.currentWorld = 'nevada';
    this.worldTransitioning = false;
    this.haminaPromise = null;
    this.haminaEntryAudioPlayed = false;
    this.onHaminaEnter = () => {};
    this.onWorldHover = () => {};
    this.worldHoverTarget = null;
    this.echoRaycaster = new THREE.Raycaster();
    this.echoPointer = new THREE.Vector2();
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
    this.resize();
    this.renderer.setAnimationLoop(this.animate);

    this.readyPromise = this.preloadWorld();
    const qaParams = new URLSearchParams(window.location.search);
    if (import.meta.env.DEV && (qaParams.has('worldQa') || qaParams.has('orbitQa'))) {
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
      if (qaParams.has('orbitQa')) {
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
          if (target) this.handleCharacterPick(target);
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
    await this.characterManager.spawn(WORLD_CONFIG.characterCount);
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
    this.pointerController = new PointerInteractionController({
      canvas: this.canvas,
      cameraController: this.cameraController,
      picker: this.picker,
      onCharacter: (character) => this.handleCharacterPick(character),
    });
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('longPressQa')) {
      window.setTimeout(() => this.runLongPressQa(), 120);
    }
    this.assetsReady = true;
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
    const result = reconstruction.reconstruct(frame, points, baseImage);
    if (result.applied) target.setFaceTexture(result.texture);
    window.__ECHO_FACE_RECONSTRUCTION_V3__ = {
      qa: true,
      targetCharacterId: target.id,
      appliedCharacterCount: result.applied ? 1 : 0,
      reconstruction: result.diagnostics,
      geometry: inspectReconstructionGeometry(target),
    };
    this.stage.dataset.faceReconstructionV3 = JSON.stringify(
      window.__ECHO_FACE_RECONSTRUCTION_V3__,
    );
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
    if (applyFace) await this.face.applyToCharacters(this.characterManager.entities);
    this.worldRenderingEnabled = true;
    this.stage.classList.add('world-visible');
    this.showWorldEntryOverlay();
    this.cameraController.startIntro(this.world.echo);
    return this.world;
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
    const rect = this.canvas.getBoundingClientRect();
    this.echoPointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.echoRaycaster.setFromCamera(this.echoPointer, this.camera);
    if (!this.echoRaycaster.intersectObject(this.world.echo, true).length) return;
    this.startWorldJump();
  }

  resolveWorldCursorMode(clientX, clientY) {
    if (!this.worldRenderingEnabled || this.worldTransitioning || !this.picker) {
      this.setWorldHoverTarget(null);
      return 'blocked';
    }
    const state = this.cameraController.state;
    const charactersAreInteractive = state === EXPERIENCE_STATES.ECHO_ORBIT
      || state === EXPERIENCE_STATES.CHARACTER_FOCUS;
    const character = charactersAreInteractive
      ? this.picker.pick(clientX, clientY, false)
      : null;
    if (character) {
      this.setWorldHoverTarget(`character:${character.id}`);
      if (state === EXPERIENCE_STATES.CHARACTER_FOCUS
        && this.cameraController.focused === character) {
        return 'character-back';
      }
      return 'character';
    }
    if (this.currentWorld !== 'nevada' || state !== EXPERIENCE_STATES.ECHO_ORBIT) {
      this.setWorldHoverTarget(null);
      return 'blocked';
    }
    const rect = this.canvas.getBoundingClientRect();
    this.echoPointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.echoRaycaster.setFromCamera(this.echoPointer, this.camera);
    if (this.echoRaycaster.intersectObject(this.world.echo, true).length) {
      this.setWorldHoverTarget('echo');
      return 'echo';
    }
    this.setWorldHoverTarget(null);
    return 'blocked';
  }

  setWorldHoverTarget(target) {
    if (target === this.worldHoverTarget) return;
    this.worldHoverTarget = target;
    this.stage.dataset.worldHoverTarget = target ?? '';
    if (target) this.onWorldHover(target);
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
    const chosen = [];
    for (const base of ['A', 'B', 'C']) {
      const candidates = pool.filter((entity) => entity.id.startsWith(base));
      if (candidates.length) chosen.push(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    const remaining = pool.filter((entity) => !chosen.includes(entity));
    if (remaining.length) chosen.push(remaining[Math.floor(Math.random() * remaining.length)]);
    return chosen.sort(() => Math.random() - 0.5).slice(0, 4);
  }

  async startWorldJump() {
    if (this.worldTransitioning || this.currentWorld !== 'nevada') return;
    this.worldTransitioning = true;
    this.characterManager.setFocused(null);
    this.caption.showOverride(
      '다른 좌표에서 당신의 흔적을 찾습니다.',
      'Searching for your trace at another coordinate.',
    );
    this.cameraController.startWorldJumpOverview(WORLD_JUMP_CONFIG.overviewDuration);
    const haminaLoading = this.preloadHamina();

    try {
      await this.wait(WORLD_JUMP_CONFIG.overviewDuration);
      this.splitCharacters = this.chooseSplitCharacters();
      this.characterManager.setLookingUp(true, this.splitCharacters);
      this.prepareSplitPortraits();
      this.cameraController.holdWorldJumpSplit();
      this.worldJumpOverlay.classList.add('visible', 'split-active');
      this.worldJumpOverlay.setAttribute('aria-hidden', 'false');
      await this.wait(WORLD_JUMP_CONFIG.splitDuration);

      await this.captureSplitFrame();
      this.cameraController.holdWorldJumpEcho();
      this.worldJumpOverlay.classList.remove('split-active');
      this.characterManager.setLookingUp(false);
      this.splitCharacters = [];
      await this.wait(0.06);
      this.worldJumpOverlay.classList.add('dissolve-active');
      await this.wait(WORLD_JUMP_CONFIG.dissolveDuration);
      this.worldJumpOverlay.classList.remove('snapshot-active', 'dissolve-active');
      await this.wait(WORLD_JUMP_CONFIG.echoHoldDuration);
      this.caption.clearOverride();
      this.cameraController.startSkyLook(WORLD_JUMP_CONFIG.skyDuration);
      this.atmosphere.transitionTo('hamina', WORLD_JUMP_CONFIG.skyDuration);
      await this.wait(WORLD_JUMP_CONFIG.skyDuration);
      this.cameraController.holdWorldLoading();
      this.worldJumpOverlay.classList.add('loading-active');

      const [hamina] = await Promise.all([
        haminaLoading,
        this.wait(WORLD_JUMP_CONFIG.minimumLoadingHold),
      ]);
      this.activateHamina(hamina);
    } catch (error) {
      console.error('[World jump] Hamina transition failed', error);
      await this.wait(1.8);
      this.worldJumpOverlay.classList.remove(
        'visible', 'split-active', 'snapshot-active', 'dissolve-active', 'loading-active', 'revealing',
      );
      this.worldJumpOverlay.setAttribute('aria-hidden', 'true');
      this.caption.clearOverride();
      this.characterManager.setLookingUp(false);
      this.cameraController.startEchoOrbit();
      this.worldTransitioning = false;
    }
  }

  activateHamina(hamina) {
    const previousWorld = this.world;
    previousWorld.detach();
    this.weather?.dispose();

    hamina.root.visible = true;
    hamina.addLighting();
    this.world = hamina;
    this.currentWorld = 'hamina';
    this.navigation.configure(hamina);
    this.characterManager.relocate(this.navigation);
    this.characterManager.setWorldMode('hamina');
    this.cameraController.configure(hamina);
    this.atmosphere.finishTransition('hamina', hamina);
    this.weather = new WeatherParticles(this.scene, hamina, 'snow');
    this.postProcessing.setWorldMode('hamina');
    this.worldJumpOverlay.classList.remove(
      'split-active', 'snapshot-active', 'dissolve-active', 'loading-active',
    );
    this.worldJumpOverlay.classList.add('revealing');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => this.worldJumpOverlay.classList.remove('visible'));
    });
    this.worldJumpOverlay.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => this.worldJumpOverlay.classList.remove('revealing'), 1250);
    this.cameraController.startWorldArrival();
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

  handleCharacterPick(character) {
    const state = this.cameraController.state;
    if (state === EXPERIENCE_STATES.ECHO_ORBIT) {
      console.info(`[Experience] focus character: ${character.id}`);
      this.characterManager.setFocused(character);
      this.cameraController.focusCharacter(character);
      return;
    }
    if (state !== EXPERIENCE_STATES.CHARACTER_FOCUS) return;
    if (this.cameraController.focused === character) {
      console.info(`[Experience] return from character: ${character.id}`);
      this.characterManager.setFocused(null);
      this.cameraController.returnToEcho();
    } else {
      console.info(`[Experience] switch character: ${this.cameraController.focused.id} -> ${character.id}`);
      this.characterManager.setFocused(character);
      this.cameraController.switchCharacter(character);
    }
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

  updatePortraitLighting(delta) {
    const state = this.cameraController.state;
    const character = this.cameraController.focused;
    const active = Boolean(character) && [
      EXPERIENCE_STATES.CHARACTER_FOCUS,
      EXPERIENCE_STATES.CHARACTER_SWITCH,
    ].includes(state);
    this.portraitFill.intensity = THREE.MathUtils.damp(
      this.portraitFill.intensity,
      active ? 1.3 : 0,
      active ? 7 : 5,
      delta,
    );
    if (!character) return;

    character.getHeadWorldPosition(this.portraitHead);
    this.portraitToCamera.subVectors(this.camera.position, this.portraitHead).normalize();
    this.portraitUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.portraitRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
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
      this.updatePortraitLighting(delta);
      this.atmosphere.update(delta, elapsed);
      this.weather?.update(delta, elapsed);
      this.caption.update();
      if (import.meta.env.DEV && this.qaFrame++ % 12 === 0) this.updateQaMetrics();
    }
    if (this.cameraController.state === EXPERIENCE_STATES.WORLD_JUMP_SPLIT) {
      this.renderSplitPortraits();
      return;
    }
    this.postProcessing.render(elapsed, this.cameraController.state, delta);
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
    this.stage.dataset.qaCamera = JSON.stringify(this.camera.position.toArray().map((value) => Number(value.toFixed(3))));
    this.stage.dataset.qaOrbit = JSON.stringify({
      angle: Number(this.cameraController.angle.toFixed(3)),
      farRadius: Number(this.cameraController.farRadius.toFixed(3)),
      nearRadius: Number(this.cameraController.nearRadius.toFixed(3)),
      echoCenter: this.cameraController.echoCenter.toArray().map((value) => Number(value.toFixed(3))),
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('dblclick', this.handleWorldDoubleClick);
    this.pointerController?.dispose();
    this.cursor?.dispose();
    this.ui.dispose();
    this.face.dispose();
    this.characterManager.dispose();
    this.atmosphere?.dispose();
    this.weather?.dispose();
    this.world.dispose();
    this.portraitFill.removeFromParent();
    this.postProcessing.dispose();
    this.renderer.dispose();
  }
}
