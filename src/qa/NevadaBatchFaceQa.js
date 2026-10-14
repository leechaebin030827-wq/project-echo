import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FaceCaptureController } from '../face/FaceCaptureController.js';
import { FaceMaterialController } from '../face/FaceMaterialController.js';
import { FaceMorphController } from '../face/FaceMorphController.js';
import { CharacterAnimator } from '../characters/CharacterAnimator.js';
import { FACE_IDENTITY_CONFIG } from '../config.js';
import './nevada-batch-face-qa.css';

// These are QA candidates only. Exhibition registration remains unchanged.
export const NEVADA_QA_IDS = Object.freeze(['N03', 'N04', 'N05', 'N06', 'N07', 'N08', 'N09', 'N10']);
const VIEWS = ['front', 'left', 'right', 'full'];
const MODES = ['original', 'v2', 'v3'];
const MOTIONS = ['idle', 'walk', 'dance'];
const LIGHTS = ['neutral', 'nevada'];
const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0, 1),
  left: new THREE.Vector3(-Math.SQRT1_2, 0, Math.SQRT1_2),
  right: new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2),
};
const FEATURES = { leftEye: 33, rightEye: 263, nose: 1, mouth: 13, chin: 152, forehead: 10 };

function inspectFace(root, faceMeshes, baseImage, clips, canonical) {
  const report = {
    faceMeshCount: faceMeshes.length, faceTriangles: 0, vertices: 0, uv1Vertices: 0,
    uv0Vertices: 0, skinVertices: 0, uvOutOfRange: 0, featureDistances: {},
    textureChannel: null, textureSize: null, bones: 0, clips: {}, compatible: false, issues: [], warnings: [],
  };
  const target = Object.fromEntries(Object.entries(FEATURES).map(([name, index]) => [name, canonical.landmarks[index]]));
  for (const name of Object.keys(target)) report.featureDistances[name] = Infinity;
  for (const mesh of faceMeshes) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const uv1 = geometry.getAttribute('uv1');
    const uv0 = geometry.getAttribute('uv');
    const joints = geometry.getAttribute('skinIndex');
    const weights = geometry.getAttribute('skinWeight');
    if (!position) continue;
    report.faceTriangles += (geometry.index?.count ?? position.count) / 3;
    report.vertices += position.count;
    if (uv0?.count === position.count) report.uv0Vertices += position.count;
    if (uv1?.count === position.count) report.uv1Vertices += position.count;
    if (joints?.count === position.count && weights?.count === position.count) report.skinVertices += position.count;
    if (mesh.isSkinnedMesh) report.bones = Math.max(report.bones, mesh.skeleton.bones.length);
    if (!uv1 || uv1.count !== position.count) continue;
    for (let index = 0; index < uv1.count; index += 1) {
      const u = uv1.getX(index);
      const v = uv1.getY(index);
      if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) {
        report.uvOutOfRange++;
        continue;
      }
      for (const [name, point] of Object.entries(target)) {
        report.featureDistances[name] = Math.min(report.featureDistances[name], Math.hypot(u - point[0], v - point[1]));
      }
    }
  }
  root.traverse((object) => {
    if (object.isSkinnedMesh) report.bones = Math.max(report.bones, object.skeleton.bones.length);
  });
  for (const motion of MOTIONS) report.clips[motion] = clips.some((clip) => new RegExp(motion, 'i').test(clip.name));
  const faceMaterial = faceMeshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .find((material) => material?.name === 'FACE');
  report.textureChannel = faceMaterial?.map?.channel ?? null;
  report.textureSize = baseImage ? [baseImage.width, baseImage.height] : null;
  if (!faceMeshes.length || !baseImage) report.issues.push('FACE material/base image missing');
  if (report.textureChannel !== 1) report.issues.push('FACE texture must sample TEXCOORD_1');
  if (report.faceTriangles < 300) report.issues.push('FACE triangle contract below 300');
  if (report.uv1Vertices !== report.vertices || report.uvOutOfRange) report.issues.push('FACE_UV/TEXCOORD_1 invalid');
  if (report.uv0Vertices !== report.vertices || report.skinVertices !== report.vertices) report.issues.push('UV0 or skin weights missing');
  if (report.bones < 1 || Object.values(report.clips).some((present) => !present)) report.issues.push('rig or Idle/Walk/Dance missing');
  // Nearest vertex distance is a diagnostic, not a coverage proof on sparse meshes.
  const farFeatures = Object.entries(report.featureDistances).filter(([, distance]) => distance > 0.08).map(([name]) => name);
  if (farFeatures.length) report.warnings.push(`Sparse canonical landmark sampling: ${farFeatures.join(', ')}`);
  report.faceTriangles = Math.round(report.faceTriangles);
  report.compatible = report.issues.length === 0;
  return report;
}

function collectResources(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    if (object.isSkinnedMesh) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  return { geometries, materials, textures, skeletons };
}

class NevadaBatchFaceQa {
  constructor() {
    document.querySelector('.app-shell').hidden = true;
    this.root = document.createElement('main');
    this.root.className = 'batch-qa';
    this.root.innerHTML = `
      <header class="batch-qa__header"><div><small>PROJECT ECHO / DEVELOPER QA</small><h1>Nevada Winter · N03–N10</h1></div><span>EXHIBITION HOLD</span></header>
      <section class="batch-qa__input" aria-label="Visitor face input">
        <div class="batch-qa__media"><video id="batch-video" autoplay muted playsinline aria-label="Webcam preview"></video><img id="batch-photo" alt="Captured visitor face" hidden /></div>
        <div class="batch-qa__actions"><button data-command="camera">CAMERA ON</button><button data-command="capture" disabled>CAPTURE</button><label class="batch-qa__upload">UPLOAD IMAGE<input id="batch-upload" type="file" accept="image/*" /></label><button data-command="reset">RESET</button></div>
        <p id="batch-status" role="status">Preparing character and face detector…</p>
      </section>
      <section class="batch-qa__workspace" aria-label="Character QA">
        <div class="batch-qa__viewer"><canvas id="batch-canvas" aria-label="3D character preview"></canvas><div class="batch-qa__viewer-label"><span id="batch-current">N03</span><span id="batch-state">ORIGINAL · FRONT</span></div></div>
        <div class="batch-qa__panel">
          <div class="batch-qa__row" role="group" aria-label="Character"><span>NPC</span><div id="batch-characters" class="batch-qa__buttons">${NEVADA_QA_IDS.map((id) => `<button data-character="${id}">${id}</button>`).join('')}</div></div>
          <div class="batch-qa__row" role="group" aria-label="Face mode"><span>FACE</span><div class="batch-qa__buttons"><button data-mode="original">ORIGINAL</button><button data-mode="v2" disabled>V2 GEOMETRY</button><button data-mode="v3" disabled>V3 RECONSTRUCTION</button></div></div>
          <div class="batch-qa__row" role="group" aria-label="Camera view"><span>VIEW</span><div class="batch-qa__buttons"><button data-view="front">FRONT</button><button data-view="left">LEFT 45°</button><button data-view="right">RIGHT 45°</button><button data-view="full">FULL BODY</button></div></div>
          <div class="batch-qa__row" role="group" aria-label="Animation"><span>MOTION</span><div class="batch-qa__buttons"><button data-motion="idle">IDLE</button><button data-motion="walk">WALK</button><button data-motion="dance">DANCE</button></div></div>
          <div class="batch-qa__row" role="group" aria-label="Lighting"><span>LIGHT</span><div class="batch-qa__buttons"><button data-light="neutral">NEUTRAL</button><button data-light="nevada">NEVADA</button></div></div>
          <div class="batch-qa__readout" aria-label="Automatic validation"><div><span>FACE SESSION</span><strong id="batch-quality">—</strong></div><div><span>FACE / UV1</span><strong id="batch-geometry">Loading…</strong></div><div><span>V2 / V3</span><strong id="batch-texture">Original</strong></div><div><span>CLIPS / BONES</span><strong id="batch-rig">—</strong></div><div><span>GPU MEMORY</span><strong id="batch-memory">—</strong></div><div><span>MOTION CHECK</span><strong id="batch-motion-check">Not run</strong></div><button data-command="check-motion">CHECK CURRENT MOTIONS</button><p id="batch-warnings"></p></div>
        </div>
      </section>
      <section class="batch-qa__sheet" aria-label="Eight character contact sheet"><div class="batch-qa__sheet-head"><div><h2>Contact Sheet</h2><p>Same visitor · same mode · FRONT · held Idle 0 · same light · same FACE-height zoom</p></div><div class="batch-qa__actions"><button data-command="sheet">RENDER 8</button><button data-command="download-sheet" disabled>DOWNLOAD PNG</button></div></div><div id="batch-sheet" class="batch-qa__sheet-grid"><p>Capture or upload a face, then render the batch comparison.</p></div></section>`;
    document.body.append(this.root);
    this.video = this.root.querySelector('#batch-video');
    this.photo = this.root.querySelector('#batch-photo');
    this.canvas = this.root.querySelector('#batch-canvas');
    this.status = this.root.querySelector('#batch-status');
    this.face = new FaceCaptureController({ video: this.video, status: this.status });
    this.loader = new GLTFLoader();
    this.abort = new AbortController();
    this.characterId = 'N03';
    this.mode = 'original';
    this.view = 'front';
    this.motion = 'idle';
    this.light = 'neutral';
    this.operation = false;
    this.renderingSheet = false;
    this.disposed = false;
    this.warnings = [];
    this.reports = {};
    this.sheetUrls = [];
    this.bind();
  }

  bind() {
    const signal = this.abort.signal;
    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || button.disabled || this.operation) return;
      this.runAction(async () => {
        if (button.dataset.command === 'camera') await this.startCamera();
        else if (button.dataset.command === 'capture') await this.capture();
        else if (button.dataset.command === 'reset') this.reset();
        else if (button.dataset.command === 'sheet') await this.renderSheet();
        else if (button.dataset.command === 'download-sheet') await this.downloadSheet();
        else if (button.dataset.command === 'check-motion') this.checkMotion();
        else if (NEVADA_QA_IDS.includes(button.dataset.character)) await this.loadCharacter(button.dataset.character);
        else if (MODES.includes(button.dataset.mode)) this.applyMode(button.dataset.mode);
        else if (VIEWS.includes(button.dataset.view)) this.setView(button.dataset.view);
        else if (MOTIONS.includes(button.dataset.motion)) this.setMotion(button.dataset.motion);
        else if (LIGHTS.includes(button.dataset.light)) this.setLight(button.dataset.light);
      });
    }, { signal });
    this.root.querySelector('#batch-upload').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file && !this.operation) this.runAction(() => this.upload(file));
    }, { signal });
    window.addEventListener('pagehide', () => this.dispose(), { once: true, signal });
  }

  async runAction(action) {
    this.operation = true;
    try { await action(); }
    catch (error) {
      console.error('[Nevada Batch QA]', error);
      this.warnings.push(error.message);
      this.status.textContent = `QA error: ${error.message}`;
      this.updateReadout();
    } finally { this.operation = false; }
  }

  async initialize() {
    if (!import.meta.env.DEV) throw new Error('Developer mode required');
    this.canonical = await fetch('/face/canonical.json').then((response) => {
      if (!response.ok) throw new Error(`Canonical atlas HTTP ${response.status}`);
      return response.json();
    });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#aeb8c1');
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.02, 100);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: true });
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
    this.scene.add(this.neutralLights, this.nevadaLights);
    this.setLight('neutral');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    await this.loadCharacter('N03');
    this.resize();
    this.frameTime = performance.now();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
    try {
      await this.face.initialize();
      this.status.textContent = 'Face detector ready. Capture or upload one visitor photo for all eight NPCs.';
    } catch (error) {
      this.warnings.push(`Face detector: ${error.message}`);
      this.status.textContent = 'Face detector failed; inspect local MediaPipe files.';
    }
    this.updateReadout();
  }

  async loadCharacter(id) {
    if (!NEVADA_QA_IDS.includes(id)) throw new Error(`Character ${id} is not an approved batch QA candidate`);
    this.status.textContent = `Loading ${id}…`;
    const gltf = await this.loader.loadAsync(`/models/semantic/character_${id.toLowerCase()}_face_ready.glb`);
    if (this.disposed) {
      const resources = collectResources(gltf.scene);
      this.disposeResources(resources);
      return;
    }
    const model = gltf.scene;
    const meshes = [];
    const faceMeshes = [];
    model.traverse((object) => {
      if (!object.isMesh) return;
      meshes.push(object);
      if ((Array.isArray(object.material) ? object.material : [object.material]).some((material) => material?.name === 'FACE')) faceMeshes.push(object);
    });
    const sourceResources = collectResources(model);
    const baseImage = faceMeshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .find((material) => material?.name === 'FACE')?.map?.image;
    const report = inspectFace(model, faceMeshes, baseImage, gltf.animations, this.canonical);
    this.reports[id] = report;
    if (!report.compatible) {
      this.disposeResources(sourceResources);
      throw new Error(`${id} FACE contract failed: ${report.issues.join('; ')}`);
    }
    this.unloadCharacter();
    this.model = model;
    this.sourceResources = sourceResources;
    this.meshes = meshes;
    this.faceMeshes = faceMeshes;
    this.faceController = new FaceMaterialController(model);
    this.animator = new CharacterAnimator(model, gltf.animations, () => 0);
    this.scene.add(model);
    model.updateMatrixWorld(true);
    const initialBounds = new THREE.Box3().setFromObject(model);
    model.position.y -= initialBounds.min.y;
    model.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(model);
    this.height = this.bounds.getSize(new THREE.Vector3()).y;
    this.center = this.bounds.getCenter(new THREE.Vector3());
    this.portraitTarget = new THREE.Vector3(this.center.x, this.bounds.min.y + this.height * 0.875, this.center.z);
    this.headBone = model.getObjectByName('Head');
    this.headWorld = new THREE.Vector3();
    this.followTarget = new THREE.Vector3();
    this.animator.hold('idle', 0);
    model.updateMatrixWorld(true);
    const faceBounds = new THREE.Box3();
    const skinnedPoint = new THREE.Vector3();
    for (const mesh of faceMeshes) {
      mesh.skeleton?.update();
      const position = mesh.geometry.getAttribute('position');
      for (let index = 0; index < position.count; index += 1) {
        skinnedPoint.fromBufferAttribute(position, index);
        if (mesh.isSkinnedMesh) mesh.applyBoneTransform(index, skinnedPoint);
        faceBounds.expandByPoint(mesh.localToWorld(skinnedPoint));
      }
    }
    const faceHeight = faceBounds.getSize(new THREE.Vector3()).y;
    this.contactTarget = faceBounds.getCenter(new THREE.Vector3());
    this.contactDistance = faceHeight > 0.02 ? faceHeight * 3.4 : this.height * 0.40;
    if (this.headBone) {
      model.updateMatrixWorld(true);
      this.headBone.getWorldPosition(this.headWorld);
      this.headOffset = this.portraitTarget.clone().sub(this.headWorld);
    }
    this.characterId = id;
    this.root.querySelector('#batch-motion-check').textContent = 'Not run';
    this.applyMode(this.mode);
    this.setView(this.view);
    if (this.motion !== 'idle') this.animator.play(this.motion);
    this.selectButtons('character', id);
    this.root.querySelector('#batch-current').textContent = id;
    this.updateReadout();
    this.status.textContent = `${id} loaded. Same visitor session is ready for comparison.`;
  }

  unloadCharacter() {
    if (!this.model) return;
    this.animator?.dispose();
    this.faceMorph?.dispose();
    this.faceMorph = null;
    this.faceController?.dispose();
    this.scene.remove(this.model);
    this.disposeResources(this.sourceResources);
    // Source materials were replaced for FACE. The controller disposed its clones.
    this.model = null;
    this.faceController = null;
    this.animator = null;
    this.renderer.renderLists.dispose();
    this.renderer.info.reset();
  }

  disposeResources(resources) {
    if (!resources) return;
    resources.skeletons.forEach((resource) => resource.dispose());
    resources.geometries.forEach((resource) => resource.dispose());
    resources.materials.forEach((resource) => resource.dispose());
    resources.textures.forEach((resource) => resource.dispose());
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
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file');
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const frame = document.createElement('canvas');
      frame.width = Math.max(1, Math.round(bitmap.width * scale));
      frame.height = Math.max(1, Math.round(bitmap.height * scale));
      frame.getContext('2d').drawImage(bitmap, 0, 0, frame.width, frame.height);
      const session = await this.face.processFrame(frame);
      if (session) this.acceptSession(session);
    } finally { bitmap.close(); }
  }

  acceptSession(session) {
    this.photo.src = session.frame.toDataURL('image/jpeg', 0.9);
    this.photo.hidden = false;
    for (const mode of ['v2', 'v3']) this.root.querySelector(`[data-mode="${mode}"]`).disabled = false;
    this.clearSheet();
    if (this.mode !== 'original') this.applyMode(this.mode);
    this.status.textContent = 'Face session stored. Switch N03–N10 without recapturing.';
    this.updateReadout();
  }

  applyMode(mode) {
    if (mode !== this.mode) {
      this.clearSheet();
      this.root.querySelector('#batch-motion-check').textContent = 'Not run';
      if (this.reports[this.characterId]) delete this.reports[this.characterId].motionCheck;
    }
    this.mode = mode;
    if (!this.model) return;
    this.faceController.reset();
    this.faceMorph?.reset();
    if (mode !== 'original' && !this.face.session) throw new Error('Capture or upload a face first');
    const session = this.face.session;
    let summary = 'Original';
    if (mode === 'v2') {
      this.faceMorph ??= new FaceMorphController(this.faceMeshes, this.canonical, this.characterId, {
        allMeshes: this.meshes,
        silhouetteMorphEnabled: FACE_IDENTITY_CONFIG.silhouetteMorphEnabled,
        geometryStrength: FACE_IDENTITY_CONFIG.geometryStrength,
        maximumHorizontalDisplacement: FACE_IDENTITY_CONFIG.maximumHorizontalDisplacement,
        maximumVerticalDisplacement: FACE_IDENTITY_CONFIG.maximumVerticalDisplacement,
      });
      const morph = this.faceMorph.apply(session.shapeProfile);
      const texture = this.face.generator.generate(session.frame, session.points, session.segmentation,
        this.faceController.baseImage, {
          featureEnhancementEnabled: FACE_IDENTITY_CONFIG.featureEnhancementEnabled,
          featureDetailStrength: FACE_IDENTITY_CONFIG.featureDetailStrength,
          adaptiveFeatureMappingEnabled: FACE_IDENTITY_CONFIG.adaptiveFeatureMappingEnabled,
          adaptiveFeatureStrength: FACE_IDENTITY_CONFIG.adaptiveFeatureStrength,
          deformationParameters: morph?.parameters ?? null,
        });
      this.faceController.set(texture);
      summary = morph.applied ? `V2 texture + ${morph.changedVertices} morphed vertices` : `V2 texture · morph ${morph.reason}`;
    } else if (mode === 'v3') {
      // The exhibition FaceCaptureController targets A01; batch QA uses the same
      // reconstructor directly with this loaded model's own FACE base image.
      const result = this.face.reconstructor.reconstruct(session.frame, session.points,
        this.faceController.baseImage, { debugOutputsEnabled: false });
      if (result.applied) {
        this.faceController.set(result.texture);
        summary = `V3 · ${(result.diagnostics.triangleCoverage * 100).toFixed(1)}% atlas triangles`;
      } else summary = `V3 rejected · ${result.reason}`;
      this.v3Diagnostics = result.diagnostics;
    }
    this.root.querySelector('#batch-texture').textContent = summary;
    this.selectButtons('mode', mode);
    this.updateViewerLabel();
    this.updateReadout();
  }

  setView(view) {
    this.view = view;
    this.positionCamera(view === 'full' ? this.center : this.portraitTarget, view);
    this.selectButtons('view', view);
    this.updateViewerLabel();
  }

  positionCamera(target, view, overrideDistance = null) {
    const distance = overrideDistance ?? this.height * (view === 'full' ? 1.9 : 0.40);
    this.camera.position.copy(target).addScaledVector(VIEW_DIRECTIONS[view] ?? VIEW_DIRECTIONS.front, distance);
    this.camera.lookAt(target);
  }

  setMotion(motion) {
    this.motion = motion;
    this.animator?.play(motion);
    this.selectButtons('motion', motion);
  }

  setLight(light) {
    if (light !== this.light) this.clearSheet();
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

  updateViewerLabel() {
    this.root.querySelector('#batch-state').textContent = `${this.mode.toUpperCase()} · ${this.view === 'full' ? 'FULL BODY' : this.view === 'front' ? 'FRONT' : `${this.view.toUpperCase()} 45°`}`;
  }

  clearSheet() {
    for (const url of this.sheetUrls) URL.revokeObjectURL(url);
    this.sheetUrls = [];
    this.root.querySelector('[data-command="download-sheet"]').disabled = true;
    this.root.querySelector('#batch-sheet').replaceChildren();
  }

  async renderSheet() {
    const chosen = this.characterId;
    const savedView = this.view;
    const savedMotion = this.motion;
    const mode = this.mode;
    const light = this.light;
    this.clearSheet();
    this.renderingSheet = true;
    const grid = this.root.querySelector('#batch-sheet');
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(420, 420, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    try {
      for (const id of NEVADA_QA_IDS) {
        this.status.textContent = `Contact Sheet ${id} (${NEVADA_QA_IDS.indexOf(id) + 1}/8)…`;
        if (id !== this.characterId) await this.loadCharacter(id);
        this.animator.hold('idle', 0);
        this.setView('front');
        this.positionCamera(this.contactTarget, 'front', this.contactDistance);
        this.setLight(light);
        this.renderer.render(this.scene, this.camera);
        const blob = await new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error(`Could not capture ${id} contact image`);
        const url = URL.createObjectURL(blob);
        this.sheetUrls.push(url);
        const card = document.createElement('figure');
        card.className = 'batch-qa__card';
        const image = document.createElement('img');
        image.src = url;
        image.alt = `${id} ${mode.toUpperCase()} front portrait under ${light} lighting`;
        const caption = document.createElement('figcaption');
        caption.textContent = `${id} · ${this.reports[id].faceTriangles} FACE tris · ${this.reports[id].compatible ? 'technical pass only' : 'inspect'}`;
        card.append(image, caption);
        grid.append(card);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    } finally {
      try {
        if (this.characterId !== chosen) await this.loadCharacter(chosen);
        this.setView(savedView);
        this.motion = savedMotion;
        if (savedMotion === 'idle') this.animator.hold('idle', 0);
        else this.animator.play(savedMotion);
        this.selectButtons('motion', savedMotion);
        this.setLight(light);
      } finally {
        this.renderingSheet = false;
        this.resize();
        this.root.querySelector('[data-command="download-sheet"]').disabled = this.sheetUrls.length !== 8;
        this.status.textContent = `Contact Sheet: ${this.sheetUrls.length}/8 portraits rendered. Review by eye before exhibition.`;
        this.updateReadout();
      }
    }
  }

  async downloadSheet() {
    if (this.sheetUrls.length !== 8) return;
    const sheet = document.createElement('canvas');
    sheet.width = 1680;
    sheet.height = 900;
    const context = sheet.getContext('2d');
    context.fillStyle = '#15232d';
    context.fillRect(0, 0, sheet.width, sheet.height);
    context.fillStyle = '#eaf1f4';
    context.font = 'bold 22px Arial';
    context.fillText(`ECHO Nevada QA · ${this.mode.toUpperCase()} · ${this.light} · same visitor / FRONT`, 20, 31);
    for (let index = 0; index < this.sheetUrls.length; index += 1) {
      const image = await createImageBitmap(await (await fetch(this.sheetUrls[index])).blob());
      const x = (index % 4) * 420;
      const y = Math.floor(index / 4) * 430 + 42;
      context.drawImage(image, x, y, 420, 420);
      image.close();
      context.fillStyle = '#15232d';
      context.fillRect(x, y + 392, 420, 28);
      context.fillStyle = '#ffffff';
      context.font = 'bold 17px Arial';
      context.fillText(NEVADA_QA_IDS[index], x + 10, y + 412);
    }
    const url = URL.createObjectURL(await new Promise((resolve) => sheet.toBlob(resolve, 'image/png')));
    const link = document.createElement('a');
    link.href = url;
    link.download = `echo-nevada-${this.mode}-${this.light}-contact-sheet.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  checkMotion() {
    if (!this.model || !this.animator) return;
    const selectedMotion = this.motion;
    const samples = [];
    const point = new THREE.Vector3();
    const failures = [];
    const featureRefs = [33, 263, 1, 13, 152].map((landmark) => {
      const target = this.canonical.landmarks[landmark];
      let nearest = null;
      let distance = Infinity;
      for (const mesh of this.faceMeshes) {
        const uv = mesh.geometry.getAttribute('uv1');
        for (let index = 0; index < uv.count; index += 1) {
          const candidate = Math.hypot(uv.getX(index) - target[0], uv.getY(index) - target[1]);
          if (candidate < distance) { distance = candidate; nearest = { mesh, index }; }
        }
      }
      return nearest;
    });
    try {
      for (const motion of MOTIONS) {
        const duration = this.animator.actions[motion].getClip().duration;
        for (const fraction of [0, 0.5, 0.95]) {
          this.animator.hold(motion, duration * fraction);
          this.model.updateMatrixWorld(true);
          const positions = [];
          for (const mesh of this.faceMeshes) {
            const attribute = mesh.geometry.getAttribute('position');
            mesh.skeleton?.update();
            const stride = Math.max(1, Math.floor(attribute.count / 32));
            for (let index = 0; index < attribute.count; index += stride) {
              point.fromBufferAttribute(attribute, index);
              if (mesh.isSkinnedMesh) mesh.applyBoneTransform(index, point);
              mesh.localToWorld(point);
              if (![point.x, point.y, point.z].every(Number.isFinite)) failures.push(`${motion}: non-finite vertex`);
              positions.push(point.clone());
            }
          }
          const distances = [];
          for (let index = 1; index < positions.length; index += 1) distances.push(positions[index].distanceTo(positions[index - 1]));
          const features = featureRefs.map(({ mesh, index }) => {
            point.fromBufferAttribute(mesh.geometry.getAttribute('position'), index);
            if (mesh.isSkinnedMesh) mesh.applyBoneTransform(index, point);
            return mesh.localToWorld(point).clone();
          });
          const featureDistances = [];
          for (let first = 0; first < features.length; first += 1) {
            for (let second = first + 1; second < features.length; second += 1) {
              featureDistances.push(features[first].distanceTo(features[second]));
            }
          }
          samples.push({ motion, fraction, distances, featureDistances });
        }
      }
      const baseline = samples[0].distances;
      const deviations = samples.flatMap((sample) => sample.distances.map((distance, index) => ({
        motion: sample.motion,
        fraction: sample.fraction,
        absolute: Math.abs(distance - baseline[index]),
        relative: Math.abs(distance - baseline[index]) / Math.max(0.002, baseline[index]),
      })));
      const maxRelative = Math.max(...deviations.map((item) => item.relative));
      const maxAbsolute = Math.max(...deviations.map((item) => item.absolute));
      const edgeReview = deviations.some((item) => item.relative > 0.15 && item.absolute > 0.004);
      const featureBaseline = samples[0].featureDistances;
      const featureDeviations = samples.flatMap((sample) => sample.featureDistances.map((distance, index) => ({
        motion: sample.motion,
        fraction: sample.fraction,
        absolute: Math.abs(distance - featureBaseline[index]),
        relative: Math.abs(distance - featureBaseline[index]) / Math.max(0.002, featureBaseline[index]),
      })));
      const featureMaxAbsolute = Math.max(...featureDeviations.map((item) => item.absolute));
      // Tiny adjacent edges can show a large percentage change under harmless
      // submillimeter motion, so require a material absolute change too.
      const suspicious = featureDeviations.filter((item) => item.relative > 0.15 && item.absolute > 0.004)
        .sort((a, b) => b.absolute - a.absolute);
      if (!Number.isFinite(maxRelative) || !Number.isFinite(maxAbsolute)
        || !Number.isFinite(featureMaxAbsolute) || suspicious.length) {
        const worst = suspicious[0];
        failures.push(worst
          ? `${worst.motion} ${Math.round(worst.fraction * 100)}% · feature ${(worst.absolute * 1000).toFixed(1)} mm / ${(worst.relative * 100).toFixed(0)}%`
          : 'non-finite face deformation');
      }
      this.root.querySelector('#batch-motion-check').textContent = failures.length
        ? `CHECK · ${failures.join(', ')}`
        : `CENTRAL PASS · ${(featureMaxAbsolute * 1000).toFixed(1)} mm${edgeReview ? ` · EDGE REVIEW ${(maxAbsolute * 1000).toFixed(1)} mm` : ''}`;
      this.reports[this.characterId].motionCheck = {
        passed: failures.length === 0, edgeReview, maxRelative, maxAbsolute, featureMaxAbsolute, failures,
      };
    } finally {
      this.motion = selectedMotion;
      if (selectedMotion === 'idle') this.animator.hold('idle', 0);
      else this.animator.play(selectedMotion);
      this.selectButtons('motion', selectedMotion);
    }
  }

  reset() {
    this.face.clearSession();
    this.faceController?.reset();
    this.faceMorph?.reset();
    this.photo.hidden = true;
    this.photo.removeAttribute('src');
    this.root.querySelector('#batch-upload').value = '';
    for (const mode of ['v2', 'v3']) this.root.querySelector(`[data-mode="${mode}"]`).disabled = true;
    this.mode = 'original';
    this.applyMode('original');
    this.setView('front');
    this.animator?.hold('idle', 0);
    this.motion = 'idle';
    this.selectButtons('motion', 'idle');
    this.setLight('neutral');
    this.clearSheet();
    this.v3Diagnostics = null;
    this.root.querySelector('#batch-motion-check').textContent = 'Not run';
    if (this.reports[this.characterId]) delete this.reports[this.characterId].motionCheck;
    this.warnings = [];
    this.status.textContent = 'Visitor face cleared. Capture or upload a new face.';
    this.updateReadout();
  }

  updateReadout() {
    const profile = this.face.session?.shapeProfile;
    const report = this.reports[this.characterId];
    this.root.querySelector('#batch-quality').textContent = profile
      ? `${(profile.quality * 100).toFixed(0)}% · ${profile.valid ? 'valid' : 'low confidence'}` : '—';
    this.root.querySelector('#batch-geometry').textContent = report
      ? `${report.faceTriangles} triangles · UV1 ${report.uv1Vertices}/${report.vertices} · ${report.compatible ? 'PASS' : 'CHECK'}` : 'Loading…';
    this.root.querySelector('#batch-rig').textContent = report
      ? `${Object.values(report.clips).filter(Boolean).length}/3 clips · ${report.bones} bones` : '—';
    if (this.renderer) {
      const { geometries, textures } = this.renderer.info.memory;
      this.root.querySelector('#batch-memory').textContent = `${geometries} geometries · ${textures} textures (current model)`;
    }
    this.root.querySelector('#batch-warnings').textContent = [
      ...(report?.issues ?? []), ...(report?.warnings ?? []), ...this.warnings.slice(-2),
      'Automatic contract checks do not establish facial likeness, hair occlusion, seam quality, or animation appearance.',
    ].join(' · ');
    if (import.meta.env.DEV) window.__ECHO_NEVADA_BATCH_QA__ = { selected: this.characterId, mode: this.mode, reports: this.reports, v3: this.v3Diagnostics ?? null };
  }

  resize() {
    if (!this.renderer || this.renderingSheet) return;
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
    if (!this.operation) this.animator?.update(delta, 0, true);
    if (!this.operation && this.motion !== 'idle' && this.view !== 'full' && this.headBone && this.headOffset) {
      this.model.updateMatrixWorld(true);
      this.headBone.getWorldPosition(this.headWorld);
      this.followTarget.copy(this.headWorld).add(this.headOffset);
      this.positionCamera(this.followTarget, this.view);
    }
    this.renderer?.render(this.scene, this.camera);
    if (now - (this.lastMemoryUpdate ?? 0) > 1000 && !this.operation) {
      this.lastMemoryUpdate = now;
      const { geometries, textures } = this.renderer.info.memory;
      this.root.querySelector('#batch-memory').textContent = `${geometries} geometries · ${textures} textures (current model)`;
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.resizeObserver?.disconnect();
    this.face.dispose();
    this.clearSheet();
    this.unloadCharacter();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    delete window.__ECHO_NEVADA_BATCH_QA__;
    this.root.remove();
  }
}

export function startNevadaBatchFaceQa() {
  if (!import.meta.env.DEV) return null;
  const qa = new NevadaBatchFaceQa();
  qa.initialize().catch((error) => {
    console.error('[Nevada Batch QA] failed', error);
    qa.status.textContent = `Batch QA failed: ${error.message}`;
  });
  return qa;
}
