import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { FaceCaptureController } from '../face/FaceCaptureController.js';
import { FaceMaterialController } from '../face/FaceMaterialController.js';
import { FaceMorphController } from '../face/FaceMorphController.js';
import { CharacterAnimator } from '../characters/CharacterAnimator.js';
import { FACE_IDENTITY_CONFIG } from '../config.js';
import './n01-face-qa.css';

const MODEL_URL = '/models/semantic/character_n01_face_ready.glb';
const VIEWS = ['front', 'left', 'right', 'full'];
const MODES = ['original', 'v2', 'v3'];
const ANIMATIONS = ['idle', 'walk', 'dance'];
const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0, 1),
  left: new THREE.Vector3(-Math.SQRT1_2, 0, Math.SQRT1_2),
  right: new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2),
};

function inspectFaceGeometry(meshes, canonical) {
  let vertices = 0;
  let validUv = 0;
  let triangles = 0;
  const uvBounds = { minU: 1, maxU: 0, minV: 1, maxV: 0 };
  const featureDistances = {};
  const features = { leftEye: 33, rightEye: 263, nose: 1, mouth: 13, chin: 152, forehead: 10 };
  for (const [name, index] of Object.entries(features)) featureDistances[name] = Infinity;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const uv = geometry.getAttribute('uv1');
    const position = geometry.getAttribute('position');
    if (!uv || !position || uv.count !== position.count) continue;
    vertices += uv.count;
    triangles += (geometry.index?.count ?? position.count) / 3;
    for (let i = 0; i < uv.count; i += 1) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) continue;
      validUv += 1;
      uvBounds.minU = Math.min(uvBounds.minU, u);
      uvBounds.maxU = Math.max(uvBounds.maxU, u);
      uvBounds.minV = Math.min(uvBounds.minV, v);
      uvBounds.maxV = Math.max(uvBounds.maxV, v);
      for (const [name, index] of Object.entries(features)) {
        const [targetU, targetV] = canonical.landmarks[index];
        featureDistances[name] = Math.min(featureDistances[name], Math.hypot(u - targetU, v - targetV));
      }
    }
  }
  return {
    baseId: 'N01', faceMeshCount: meshes.length, vertices,
    triangles: Math.round(triangles), validUv, uvCoverage: validUv / Math.max(1, vertices),
    uvBounds, featureDistances,
    maxFeatureDistance: Math.max(...Object.values(featureDistances)),
    compatible: meshes.length > 0 && vertices > 0 && validUv === vertices
      && Object.values(featureDistances).every((distance) => distance <= 0.04),
  };
}

class N01FaceQa {
  constructor() {
    document.querySelector('.app-shell').hidden = true;
    this.root = document.createElement('main');
    this.root.className = 'n01-qa';
    this.root.innerHTML = `
      <header class="n01-qa__header">
        <span>PROJECT ECHO / DEVELOPER QA</span><strong>N01 · WINTER TRAVELER</strong>
      </header>
      <section class="n01-qa__input" aria-label="Face input">
        <div class="n01-qa__input-media">
          <video id="n01-video" autoplay muted playsinline aria-label="Webcam preview"></video>
          <img id="n01-photo" alt="Captured face" hidden />
        </div>
        <div class="n01-qa__input-actions">
          <button type="button" data-command="camera">CAMERA ON</button>
          <button type="button" data-command="capture" disabled>CAPTURE</button>
          <button type="button" data-command="retake">RETAKE</button>
          <label class="n01-qa__upload">UPLOAD IMAGE<input id="n01-upload" type="file" accept="image/*" /></label>
        </div>
        <p id="n01-input-status" role="status">Preparing N01 and face detection…</p>
      </section>
      <section class="n01-qa__preview" aria-label="N01 character preview">
        <canvas id="n01-canvas" aria-label="3D N01 character"></canvas>
        <div class="n01-qa__preview-label"><span id="n01-preview-mode">ORIGINAL</span><span id="n01-preview-view">FRONT</span></div>
      </section>
      <section class="n01-qa__controls" aria-label="QA controls">
        <div class="n01-qa__row" role="group" aria-label="Face mode">
          <span>FACE</span><button data-mode="original" class="active">ORIGINAL</button><button data-mode="v2" disabled>V2 GEOMETRY</button><button data-mode="v3" disabled>V3 RECON</button>
        </div>
        <div class="n01-qa__row" role="group" aria-label="Camera view">
          <span>VIEW</span><button data-view="front" class="active">FRONT</button><button data-view="left">LEFT 45°</button><button data-view="right">RIGHT 45°</button><button data-view="full">FULL BODY</button>
        </div>
        <div class="n01-qa__row" role="group" aria-label="Animation">
          <span>MOTION</span><button data-animation="idle" class="active">IDLE</button><button data-animation="walk">WALK</button><button data-animation="dance">DANCE</button>
        </div>
        <div class="n01-qa__row" role="group" aria-label="Lighting">
          <span>LIGHT</span><button data-light="neutral" class="active">NEUTRAL</button><button data-light="nevada">NEVADA</button><button data-command="reset">RESET</button>
        </div>
      </section>
      <section class="n01-qa__diagnostics" aria-label="QA diagnostics">
        <div><span>LANDMARK QUALITY</span><strong id="n01-quality">—</strong></div>
        <div><span>FACE / UV1</span><strong id="n01-geometry">Loading…</strong></div>
        <div><span>TEXTURE</span><strong id="n01-texture">Original</strong></div>
        <div><span>WARNINGS</span><strong id="n01-warnings">Upper forehead remains on original material; source mouth has a slight smile.</strong></div>
      </section>`;
    document.body.append(this.root);
    this.video = this.root.querySelector('#n01-video');
    this.photo = this.root.querySelector('#n01-photo');
    this.canvas = this.root.querySelector('#n01-canvas');
    this.status = this.root.querySelector('#n01-input-status');
    this.face = new FaceCaptureController({ video: this.video, status: this.status });
    this.abort = new AbortController();
    this.mode = 'original';
    this.view = 'front';
    this.motion = 'idle';
    this.light = 'neutral';
    this.warnings = [];
    this.disposed = false;
    this.bind();
  }

  bind() {
    const signal = this.abort.signal;
    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      this.runAction(async () => {
        if (button.dataset.command === 'camera') await this.startCamera();
        if (button.dataset.command === 'capture') await this.capture();
        if (button.dataset.command === 'retake') this.resetFace();
        if (button.dataset.command === 'reset') this.resetAll();
        if (MODES.includes(button.dataset.mode)) this.applyMode(button.dataset.mode);
        if (VIEWS.includes(button.dataset.view)) this.setView(button.dataset.view);
        if (ANIMATIONS.includes(button.dataset.animation)) this.setAnimation(button.dataset.animation);
        if (['neutral', 'nevada'].includes(button.dataset.light)) this.setLighting(button.dataset.light);
      });
    }, { signal });
    this.root.querySelector('#n01-upload').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) this.runAction(() => this.upload(file));
    }, { signal });
    window.addEventListener('pagehide', () => this.dispose(), { once: true, signal });
  }

  async runAction(action) {
    try { await action(); }
    catch (error) {
      console.error('[N01 Face QA]', error);
      this.warnings.push(error.message);
      this.updateDiagnostics();
      this.status.textContent = error.message;
    }
  }

  async initialize() {
    if (!import.meta.env.DEV) throw new Error('Developer mode required');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#aeb8c1');
    this.camera = new THREE.PerspectiveCamera(38, 9 / 16, 0.02, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.neutralLights = new THREE.Group();
    this.neutralLights.add(new THREE.HemisphereLight('#ffffff', '#aeb9c6', 1.35));
    const neutralKey = new THREE.DirectionalLight('#ffffff', 2.0);
    neutralKey.position.set(-2, 3, 4);
    this.neutralLights.add(neutralKey);
    const neutralFill = new THREE.DirectionalLight('#f4f6ff', 0.85);
    neutralFill.position.set(2, 1, 2);
    this.neutralLights.add(neutralFill);
    this.nevadaLights = new THREE.Group();
    this.nevadaLights.add(new THREE.HemisphereLight('#9cb8e8', '#455033', 1.12));
    const nevadaSun = new THREE.DirectionalLight('#fff0d2', 2.45);
    nevadaSun.position.set(-3, 5, 2);
    this.nevadaLights.add(nevadaSun);
    this.nevadaLights.visible = false;
    this.scene.add(this.neutralLights, this.nevadaLights);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    await this.loadModel();
    this.resize();
    this.setView('front');
    // Begin at a reproducible pose; clicking IDLE starts the animated clip.
    this.animator.hold('idle', 0);
    this.selectButtons('animation', 'idle');
    if (this.headBone) {
      this.characterRoot.updateMatrixWorld(true);
      this.headBone.getWorldPosition(this.headWorld);
      this.headTargetOffset = this.basePortraitTarget.clone().sub(this.headWorld);
    }
    this.frameTime = performance.now();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
    try {
      await this.face.initialize();
      this.status.textContent = 'Face detector ready. Turn on the camera or upload a local image.';
    } catch (error) {
      this.warnings.push(`Face detector: ${error.message}`);
      this.status.textContent = 'Face detector could not start; check local MediaPipe files.';
    }
    this.updateDiagnostics();
  }

  async loadModel() {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    this.sourceScene = gltf.scene;
    this.model = clone(gltf.scene);
    this.characterRoot = new THREE.Group();
    this.characterRoot.name = 'N01-QA-only';
    this.characterRoot.add(this.model);
    this.scene.add(this.characterRoot);
    this.characterRoot.updateMatrixWorld(true);
    const initialBounds = new THREE.Box3().setFromObject(this.characterRoot);
    this.characterRoot.position.y -= initialBounds.min.y;
    this.characterRoot.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(this.characterRoot);
    this.height = this.bounds.getSize(new THREE.Vector3()).y;
    this.center = this.bounds.getCenter(new THREE.Vector3());
    this.basePortraitTarget = new THREE.Vector3(
      this.center.x, this.bounds.min.y + this.height * 0.875, this.center.z,
    );
    this.headWorld = new THREE.Vector3();
    this.followTarget = new THREE.Vector3();
    this.headBone = this.characterRoot.getObjectByName('Head');
    this.meshes = [];
    this.faceMeshes = [];
    this.characterRoot.traverse((object) => {
      if (!object.isMesh) return;
      this.meshes.push(object);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => material?.name === 'FACE')) this.faceMeshes.push(object);
    });
    this.faceController = new FaceMaterialController(this.characterRoot);
    if (!this.faceMeshes.length || !this.faceController.baseImage) throw new Error('N01 FACE material or base texture missing');
    this.animator = new CharacterAnimator(this.characterRoot, gltf.animations, () => 0);
    this.character = {
      id: 'N01', baseId: 'N01', faceMeshes: this.faceMeshes,
      faceController: this.faceController,
      setFaceTexture: (texture) => this.faceController.set(texture),
      resetFaceShape: () => this.faceMorphController?.reset(),
      resetFaceIdentity: () => { this.faceController.reset(); this.faceMorphController?.reset(); },
      applyFaceShape: (profile, canonical, options = {}) => {
        this.faceMorphController ??= new FaceMorphController(
          this.faceMeshes, canonical, 'N01', { allMeshes: this.meshes, ...options },
        );
        return this.faceMorphController.apply(profile);
      },
    };
    this.faceBounds = new THREE.Box3().setFromObject(this.faceMeshes[0]);
    const canonical = await fetch('/face/canonical.json').then((response) => response.json());
    this.geometryReport = inspectFaceGeometry(this.faceMeshes, canonical);
    if (!this.geometryReport.compatible) throw new Error('N01 FACE UV1 contract failed');
    this.updateDiagnostics();
  }

  async startCamera() {
    await this.face.start();
    this.video.hidden = false;
    this.root.querySelector('[data-command="capture"]').disabled = false;
    this.status.textContent = 'Camera ready. Look straight ahead and capture.';
  }

  async capture() {
    const session = await this.face.capture();
    if (session) this.acceptSession(session);
  }

  async upload(file) {
    if (!file.type.startsWith('image/')) throw new Error('Select an image file.');
    const image = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const frame = document.createElement('canvas');
      frame.width = Math.round(image.width * scale);
      frame.height = Math.round(image.height * scale);
      frame.getContext('2d').drawImage(image, 0, 0, frame.width, frame.height);
      const session = await this.face.processFrame(frame);
      if (session) this.acceptSession(session);
    } finally { image.close(); }
  }

  acceptSession(session) {
    this.photo.src = session.frame.toDataURL('image/jpeg', 0.9);
    this.photo.hidden = false;
    this.root.querySelector('[data-mode="v2"]').disabled = false;
    this.root.querySelector('[data-mode="v3"]').disabled = false;
    this.warnings = [];
    this.updateDiagnostics();
    this.status.textContent = 'Face detected. Compare Original, V2 and V3 with this same capture.';
    if (this.mode !== 'original') this.applyMode(this.mode);
  }

  applyMode(mode) {
    this.mode = mode;
    this.character.resetFaceIdentity();
    this.root.querySelector('#n01-texture').textContent = 'Original';
    if (mode !== 'original' && !this.face.session) throw new Error('Capture or upload a face first.');
    const session = this.face.session;
    if (mode === 'v2') {
      const morph = this.character.applyFaceShape(session.shapeProfile, this.face.canonical, {
        silhouetteMorphEnabled: FACE_IDENTITY_CONFIG.silhouetteMorphEnabled,
        geometryStrength: FACE_IDENTITY_CONFIG.geometryStrength,
        maximumHorizontalDisplacement: FACE_IDENTITY_CONFIG.maximumHorizontalDisplacement,
        maximumVerticalDisplacement: FACE_IDENTITY_CONFIG.maximumVerticalDisplacement,
      });
      const texture = this.face.generator.generate(
        session.frame, session.points, session.segmentation,
        this.faceController.baseImage, {
          featureEnhancementEnabled: FACE_IDENTITY_CONFIG.featureEnhancementEnabled,
          featureDetailStrength: FACE_IDENTITY_CONFIG.featureDetailStrength,
          adaptiveFeatureMappingEnabled: FACE_IDENTITY_CONFIG.adaptiveFeatureMappingEnabled,
          adaptiveFeatureStrength: FACE_IDENTITY_CONFIG.adaptiveFeatureStrength,
          deformationParameters: morph?.parameters ?? null,
        },
      );
      this.character.setFaceTexture(texture);
      this.root.querySelector('#n01-texture').textContent = morph.applied
        ? `V2 ready · ${morph.changedVertices} vertices` : `V2 texture · morph ${morph.reason}`;
    }
    if (mode === 'v3') {
      const result = this.face.reconstructor.reconstruct(
        session.frame, session.points, this.faceController.baseImage,
        { debugOutputsEnabled: true },
      );
      if (!result.applied) {
        this.root.querySelector('#n01-texture').textContent = `V3 rejected · ${result.reason}`;
        this.warnings.push(`V3 quality gate: ${result.reason}`);
      } else {
        this.character.setFaceTexture(result.texture);
        this.root.querySelector('#n01-texture').textContent = `V3 ready · ${(result.diagnostics.triangleCoverage * 100).toFixed(1)}% atlas triangles`;
      }
      this.v3Diagnostics = result.diagnostics;
    }
    this.selectButtons('mode', mode);
    this.root.querySelector('#n01-preview-mode').textContent = mode.toUpperCase();
    this.updateDiagnostics();
  }

  setView(view) {
    this.view = view;
    // A skinned mesh's static box can sit above its posed face. Use the
    // measured character height for a stable N01 portrait target.
    const target = view === 'full' ? this.center : this.basePortraitTarget;
    this.positionCamera(target, view);
    this.selectButtons('view', view);
    this.root.querySelector('#n01-preview-view').textContent = view === 'full' ? 'FULL BODY' : view === 'front' ? 'FRONT' : `${view.toUpperCase()} 45°`;
  }

  positionCamera(target, view) {
    const distance = this.height * (view === 'full' ? 1.9 : 0.40);
    const direction = VIEW_DIRECTIONS[view] ?? VIEW_DIRECTIONS.front;
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.camera.lookAt(target);
  }

  setAnimation(motion) {
    this.motion = motion;
    this.animator.play(motion);
    this.selectButtons('animation', motion);
  }

  setLighting(light) {
    this.light = light;
    this.neutralLights.visible = light === 'neutral';
    this.nevadaLights.visible = light === 'nevada';
    this.scene.background.set(light === 'neutral' ? '#aeb8c1' : '#83b8ee');
    this.selectButtons('light', light);
  }

  selectButtons(group, value) {
    this.root.querySelectorAll(`[data-${group}]`).forEach((button) => {
      const selected = button.dataset[group] === value;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  resetFace() {
    this.character?.resetFaceIdentity();
    this.face.clearSession();
    this.photo.hidden = true;
    this.photo.removeAttribute('src');
    this.root.querySelector('#n01-upload').value = '';
    this.root.querySelector('[data-mode="v2"]').disabled = true;
    this.root.querySelector('[data-mode="v3"]').disabled = true;
    this.mode = 'original';
    this.selectButtons('mode', 'original');
    this.root.querySelector('#n01-preview-mode').textContent = 'ORIGINAL';
    this.root.querySelector('#n01-texture').textContent = 'Original';
    this.v3Diagnostics = null;
    this.warnings = [];
    this.status.textContent = 'Previous face cleared. Capture or upload a new image.';
    this.updateDiagnostics();
  }

  resetAll() {
    this.resetFace();
    this.setView('front');
    this.animator.hold('idle', 0);
    this.motion = 'idle';
    this.selectButtons('animation', 'idle');
    this.setLighting('neutral');
  }

  updateDiagnostics() {
    const profile = this.face.session?.shapeProfile;
    this.root.querySelector('#n01-quality').textContent = profile
      ? `${(profile.quality * 100).toFixed(0)}% · ${profile.valid ? 'valid' : 'low confidence'}` : '—';
    const report = this.geometryReport;
    this.root.querySelector('#n01-geometry').textContent = report
      ? `${report.triangles} triangles · ${report.vertices} UV1 vertices · ${(report.uvCoverage * 100).toFixed(0)}% valid · Δ${report.maxFeatureDistance.toFixed(3)}`
      : 'Loading…';
    this.root.querySelector('#n01-warnings').textContent = [
      'Upper forehead remains original; source mouth has a slight smile. V2 morph can expose forehead triangles; inspect before deployment.',
      ...this.warnings.slice(-2),
    ].join(' ');
  }

  resize() {
    if (!this.renderer) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  frame(now) {
    if (this.disposed) return;
    const delta = Math.min((now - this.frameTime) / 1000, 0.05);
    this.frameTime = now;
    this.animator?.update(delta, 0, true);
    if (this.motion !== 'idle' && this.view !== 'full' && this.headBone && this.headTargetOffset) {
      this.characterRoot.updateMatrixWorld(true);
      this.headBone.getWorldPosition(this.headWorld);
      this.followTarget.copy(this.headWorld).add(this.headTargetOffset);
      this.positionCamera(this.followTarget, this.view);
    }
    this.renderer?.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver?.disconnect();
    this.face.dispose();
    this.animator?.dispose();
    this.faceMorphController?.dispose();
    this.faceController?.dispose();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    this.model?.traverse((object) => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        materials.add(material);
        if (material.map) textures.add(material.map);
      }
      if (object.isSkinnedMesh) object.skeleton.dispose();
    });
    geometries.forEach((resource) => resource.dispose());
    materials.forEach((resource) => resource.dispose());
    textures.forEach((resource) => resource.dispose());
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.root.remove();
  }
}

export function startN01FaceQa() {
  if (!import.meta.env.DEV) return null;
  const qa = new N01FaceQa();
  qa.initialize().catch((error) => {
    console.error('[N01 Face QA] failed', error);
    qa.status.textContent = `N01 QA failed: ${error.message}`;
  });
  return qa;
}
