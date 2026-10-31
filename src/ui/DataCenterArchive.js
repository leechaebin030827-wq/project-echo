import * as THREE from 'three';
import {
  loadScatteredPhotos, loadVisitorPhotos, saveScatteredPhotos,
} from '../face/VisitorPhotoArchive.js';
import { ARCHIVE_UI } from '../content/WorldUiCopy.js';

const FALLING_COPIES = 16;
const PHOTO_SIZE_SCALE = 0.6;
const clamp = THREE.MathUtils.clamp;
const easeOut = (value) => 1 - (1 - value) ** 3;
const fract = (value) => value - Math.floor(value);
const scatterValue = (seed) => fract(Math.sin(seed * 127.1) * 43758.5453);

function makePhotoTexture(image) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 512 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class DataCenterArchive {
  constructor(stage, {
    scene, camera, canvas, navigation, onOpen = () => {}, onClose = () => {},
    onRequestClose = () => {}, onHover = () => {}, onPhotoOpen = () => {},
    onPhotoClose = () => {}, onFallComplete = () => {}, getCurrentRecordId = () => null,
    getCurrentPhoto = () => null, getReturnViewPosition = () => null,
  } = {}) {
    this.stage = stage;
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.navigation = navigation;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onRequestClose = onRequestClose;
    this.onHover = onHover;
    this.onPhotoOpen = onPhotoOpen;
    this.onPhotoClose = onPhotoClose;
    this.onFallComplete = onFallComplete;
    this.getCurrentRecordId = getCurrentRecordId;
    this.getCurrentPhoto = getCurrentPhoto;
    this.getReturnViewPosition = getReturnViewPosition;
    this.visible = false;
    this.cards = [];
    this.images = [];
    this.currentImage = null;
    this.world = null;
    this.group = new THREE.Group();
    this.group.name = 'DataCenterScatteredPhotos';
    this.scene.add(this.group);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.generation = 0;
    this.saveQueue = Promise.resolve();
    this.restorePromise = null;
    this.restoreWorld = null;
    this.elapsed = 0;
    this.dropElapsed = 0;
    this.dropActive = false;
    this.settledHold = false;
    this.hasReleasedCopies = false;
    this.selected = null;
    this.element = document.createElement('section');
    this.element.className = 'data-archive-photo-viewer';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <button class="data-archive-photo-backdrop" type="button" aria-label="${ARCHIVE_UI.photoClose}"></button>`;
    this.closeButton = this.element.querySelector('.data-archive-photo-backdrop');
    this.closePhoto = this.closePhoto.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.closeButton.addEventListener('click', this.closePhoto);
    window.addEventListener('keydown', this.handleKeyDown);
    this.stage.append(this.element);
  }

  async open(region, world) {
    // Do not let a new drop overtake the IndexedDB restore for this world.
    // Otherwise the next save could replace older cards that have not decoded yet.
    if (this.restoreWorld === world && this.restorePromise) {
      await this.restorePromise;
    }
    const token = ++this.generation;
    this.visible = true;
    this.elapsed = 0;
    this.settledHold = false;
    this.hasReleasedCopies = false;
    this.group.visible = true;
    try {
      const records = (await loadVisitorPhotos()).filter((record) => record.blob);
      if (token !== this.generation) return;
      const currentId = this.getCurrentRecordId();
      let currentRecord = records.find((record) => record.id === currentId);
      if (!currentRecord) {
        const frame = this.getCurrentPhoto();
        if (frame?.width && frame?.height) {
          const blob = await new Promise((resolve) => frame.toBlob(resolve, 'image/png'));
          if (blob) currentRecord = { id: -1, blob };
        }
      }
      // The capture-free QA route uses the latest stored image as a stand-in.
      if (!currentRecord && import.meta.env.DEV
        && new URLSearchParams(window.location.search).get('dataCenterQa') === '1') {
        currentRecord = records.at(-1);
        if (!currentRecord) {
          const sample = document.createElement('canvas');
          sample.width = 500;
          sample.height = 620;
          const context = sample.getContext('2d');
          context.fillStyle = '#e4b988';
          context.fillRect(0, 0, sample.width, sample.height);
          context.fillStyle = '#284967';
          context.font = 'bold 72px sans-serif';
          context.textAlign = 'center';
          context.fillText('ECHO', 250, 285);
          context.fillText('QA', 250, 380);
          const blob = await new Promise((resolve) => sample.toBlob(resolve, 'image/png'));
          if (blob) currentRecord = { id: -2, blob };
        }
      }
      if (token !== this.generation) return;
      await this.setRecords(currentRecord ? [currentRecord] : [], world, token);
      if (token !== this.generation) return;
      this.currentImage = this.images.find((image) => image.id === currentRecord?.id) ?? null;
      this.onOpen();
    } catch (error) {
      console.warn('[Photo Archive] photos could not be released', error);
      if (token === this.generation) this.onOpen();
    }
  }

  async setRecords(records, world, token) {
    this.world = world;
    const images = [];
    for (const record of records) {
      try {
        const bitmap = await createImageBitmap(record.blob);
        if (token !== this.generation) {
          bitmap.close();
          images.forEach((image) => image.bitmap.close());
          return;
        }
        images.push({ id: record.id, bitmap, blob: record.blob });
      } catch (error) {
        console.warn('[Photo Archive] capture could not be decoded', error);
      }
    }
    if (token !== this.generation) return;
    // Reopening the archive must not remove photos already scattered on this world.
    // Keep their shared geometry/material alive until the world is changed.
    for (const image of images) {
      if (this.images.some((existing) => existing.id === image.id)) {
        image.bitmap.close();
        continue;
      }
      this.images.push(image);
    }
    if (!images.length) {
      if (import.meta.env.DEV) this.stage.dataset.qaArchiveCards = String(this.cards.length);
      return;
    }
    const dataCenter = world.interactiveRegions.find((item) => item.name === 'Data Center');
    const width = clamp(dataCenter.radius * 0.06, 0.85, 1.75) * 0.5 * PHOTO_SIZE_SCALE;
    for (const image of this.images.filter((item) => !item.geometry)) {
      image.texture = makePhotoTexture(image.bitmap);
      image.material = new THREE.MeshBasicMaterial({
        map: image.texture, side: THREE.DoubleSide, transparent: true,
      });
      image.geometry = new THREE.PlaneGeometry(width, width * image.bitmap.height / image.bitmap.width);
    }
    if (import.meta.env.DEV) this.stage.dataset.qaArchiveCards = String(this.cards.length);
  }

  restore(world) {
    const token = ++this.generation;
    this.world = world;
    this.restoreWorld = world;
    const operation = (async () => {
      // A quick world round-trip can arrive before close() finishes writing.
      await this.saveQueue;
      const snapshot = await loadScatteredPhotos(world.root.name);
      if (token !== this.generation || !snapshot?.cards?.length) return;
      const restoredScale = PHOTO_SIZE_SCALE / (snapshot.photoSizeScale ?? 1);
      for (const stored of snapshot.images ?? []) {
        const bitmap = await createImageBitmap(stored.blob);
        if (token !== this.generation) { bitmap.close(); return; }
        const image = { id: stored.id, blob: stored.blob, bitmap };
        image.texture = makePhotoTexture(bitmap);
        image.material = new THREE.MeshBasicMaterial({
          map: image.texture, side: THREE.DoubleSide, transparent: true,
        });
        image.geometry = new THREE.PlaneGeometry(
          stored.width * restoredScale,
          stored.height * restoredScale,
        );
        this.images.push(image);
      }
      for (const stored of snapshot.cards) {
        const image = this.images.find((item) => item.id === stored.id);
        if (!image) continue;
        const landing = new THREE.Vector3(...stored.position);
        const mesh = new THREE.Mesh(image.geometry, image.material);
        mesh.position.copy(landing);
        mesh.quaternion.fromArray(stored.quaternion);
        this.group.add(mesh);
        this.cards.push({ mesh, image, landing, origin: null, fallingCopy: true });
      }
      if (import.meta.env.DEV) this.stage.dataset.qaArchiveCards = String(this.cards.length);
    })().catch((error) => {
      console.warn('[Photo Archive] scattered photos could not be restored', error);
    }).finally(() => {
      if (this.restorePromise === operation) {
        this.restorePromise = null;
        this.restoreWorld = null;
      }
    });
    this.restorePromise = operation;
    return operation;
  }

  createSettledSnapshot() {
    if (!this.world) return;
    const cards = this.cards.filter((card) => !card.origin);
    if (!cards.length) return;
    const usedIds = new Set(cards.map((card) => card.image.id));
    const snapshot = {
      world: this.world.root.name,
      photoSizeScale: PHOTO_SIZE_SCALE,
      images: this.images.filter((image) => usedIds.has(image.id)).map((image) => ({
        id: image.id, blob: image.blob,
        width: image.geometry.parameters.width,
        height: image.geometry.parameters.height,
      })),
      cards: cards.map((card) => ({
        id: card.image.id,
        position: card.landing.toArray(),
        quaternion: card.mesh.quaternion.toArray(),
      })),
    };
    return snapshot;
  }

  saveSettledCards() {
    const snapshot = this.createSettledSnapshot();
    if (!snapshot) return;
    this.saveQueue = this.saveQueue.then(() => saveScatteredPhotos(snapshot))
      .catch((error) => console.warn('[Photo Archive] scattered photos could not be saved', error));
  }

  findEchoLanding(index, seed, phase) {
    const world = this.world;
    if (!world) return null;
    if (phase === 1) {
      const returnPosition = this.getReturnViewPosition();
      const towardViewer = returnPosition?.clone().sub(world.echoCenter).setY(0).normalize();
      if (towardViewer?.lengthSq() > 0.001) {
        const viewAngle = Math.atan2(towardViewer.z, towardViewer.x);
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const aroundEcho = ((index * 9) % FALLING_COPIES + 0.5) / FALLING_COPIES;
          const angle = viewAngle + (aroundEcho - 0.5) * 4.2
            + (scatterValue(seed + 13) - 0.5) * 0.16 + attempt * 0.28;
          const radius = 4.2 + (index % 4) * 1.7
            + scatterValue(seed + 19) * 0.8 + attempt * 0.35;
          const position = world.echoCenter.clone()
            .add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
          const y = this.navigation.sampleHeight(position.x, position.z);
          if (y === null || !this.navigation.isClear(position.x, y, position.z)) continue;
          position.y = y + 0.08 + index * 0.001;
          return position;
        }
      }
    }
    const bounds = world.navigationBounds ?? this.navigation.garageBox;
    const span = Math.min(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
    const inner = Math.max(4.8, (world.echoSphere?.radius ?? 3) * 1.3);
    const outer = Math.max(inner + 3, Math.min(23, span * 0.43));
    for (let attempt = 0; attempt < 42; attempt += 1) {
      const angle = (index + phase * 0.46) * 2.39996323 + attempt * 0.47;
      const spread = scatterValue(seed + attempt * 17 + 3);
      const radius = inner + (outer - inner) * (0.14 + spread * 0.86);
      const x = world.echoCenter.x + Math.cos(angle) * radius;
      const z = world.echoCenter.z + Math.sin(angle) * radius;
      const y = this.navigation.sampleHeight(x, z);
      if (y === null || !this.navigation.isClear(x, y, z)) continue;
      return new THREE.Vector3(x, y + 0.06 + index * 0.001, z);
    }
    return null;
  }

  releaseCopies() {
    if (!this.visible || this.dropActive || !this.currentImage || !this.world) return null;
    const dataCenter = this.world.interactiveRegions.find((item) => item.name === 'Data Center');
    if (!dataCenter) return null;
    const towardEcho = this.world.echoCenter.clone().sub(dataCenter.center).setY(0).normalize();
    const { center, bounds } = dataCenter;
    const toFrontX = towardEcho.x > 0.001
      ? (bounds.max.x - center.x) / towardEcho.x
      : towardEcho.x < -0.001 ? (bounds.min.x - center.x) / towardEcho.x : Infinity;
    const toFrontZ = towardEcho.z > 0.001
      ? (bounds.max.z - center.z) / towardEcho.z
      : towardEcho.z < -0.001 ? (bounds.min.z - center.z) / towardEcho.z : Infinity;
    const launch = center.clone().addScaledVector(towardEcho, Math.min(toFrontX, toFrontZ) + 0.8);
    launch.y = dataCenter.bounds.max.y + 0.6;
    const landings = [];
    for (let index = 0; index < FALLING_COPIES; index += 1) {
      const seed = this.currentImage.id * 101 + index * 911;
      const landing = this.findEchoLanding(index, seed, 1);
      if (landing) landings.push({ landing, seed, index });
    }
    if (!landings.length) return null;
    this.dropElapsed = 0;
    this.dropActive = true;
    this.settledHold = false;
    this.hasReleasedCopies = true;
    const skyCenter = new THREE.Vector3();
    for (const { landing, seed, index } of landings) {
      const mesh = new THREE.Mesh(this.currentImage.geometry, this.currentImage.material);
      const origin = launch.clone().add(new THREE.Vector3(
        (scatterValue(seed + 13) - 0.5) * 1.5,
        index * 0.06,
        (scatterValue(seed + 19) - 0.5) * 1.5,
      ));
      const rise = origin.clone().add(new THREE.Vector3(0, 18 + scatterValue(seed + 17) * 4, 0));
      const sky = landing.clone();
      sky.y = rise.y + 1.2 + scatterValue(seed + 23) * 2;
      skyCenter.add(sky);
      mesh.position.copy(origin);
      mesh.scale.setScalar(2.2);
      this.group.add(mesh);
      this.cards.push({
        mesh, image: this.currentImage, landing, origin, rise, sky, seed, fallingCopy: true,
        delay: index * 0.075,
        duration: 5.7 + scatterValue(seed + 37) * 0.8,
        landingQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(
          -Math.PI / 2, 0, scatterValue(seed + 43) * Math.PI * 2,
        )),
      });
    }
    skyCenter.divideScalar(landings.length);
    return {
      launch, echo: this.world.echoCenter.clone(), groundY: dataCenter.bounds.min.y,
      outward: towardEcho, sky: skyCenter,
    };
  }

  update(delta) {
    if (!this.visible) return;
    this.elapsed += Math.min(delta, 0.05);
    if (this.dropActive || this.settledHold) this.dropElapsed += Math.min(delta, 0.05);
    for (const card of this.cards) {
      if (!card.origin) continue;
      const t = clamp((this.dropElapsed - card.delay) / card.duration, 0, 1);
      if (t <= 0) continue;
      if (t < 0.31) {
        card.mesh.position.lerpVectors(card.origin, card.rise, easeOut(t / 0.31));
      } else if (t < 0.64) {
        card.mesh.position.lerpVectors(card.rise, card.sky,
          THREE.MathUtils.smoothstep(t, 0.31, 0.64));
      } else {
        const fall = (t - 0.64) / 0.36;
        card.mesh.position.lerpVectors(card.sky, card.landing, fall * fall);
      }
      card.mesh.position.x += Math.sin(t * Math.PI * 2 + card.seed) * (1 - t) * 0.17;
      card.mesh.scale.setScalar(THREE.MathUtils.lerp(2.2, 1, easeOut(t)));
      card.mesh.quaternion.copy(this.camera.quaternion);
      card.mesh.rotateZ(Math.sin(card.seed) * (1 - t) * 0.3);
      card.mesh.quaternion.slerp(card.landingQuaternion, THREE.MathUtils.smoothstep(t, 0.85, 1));
      if (t === 1) {
        card.mesh.position.copy(card.landing);
        card.mesh.quaternion.copy(card.landingQuaternion);
        card.mesh.scale.setScalar(1);
        card.origin = null;
      }
    }
    if (this.dropActive && this.dropElapsed > 1
      && this.cards.every((card) => !card.fallingCopy || !card.origin)
      && !this.selected) {
      this.dropActive = false;
      this.settledHold = true;
      this.saveSettledCards?.();
      this.onFallComplete();
    }
  }

  pick(clientX, clientY) {
    if (!this.group.visible || !this.cards.length || this.selected) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set((clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.cards.filter((card) => !card.origin).map((card) => card.mesh), false,
    )[0];
    return hit ? this.cards.find((card) => card.mesh === hit.object) : null;
  }

  select(card) {
    if (!card?.image) return;
    if (card.origin) {
      card.mesh.position.copy(card.landing);
      card.mesh.rotation.set(-Math.PI / 2, 0, scatterValue(card.seed + 43) * Math.PI * 2);
      card.origin = null;
    }
    this.selected = card;
    this.element.classList.add('visible');
    this.element.setAttribute('aria-hidden', 'false');
    this.stage.classList.add('archive-active');
    this.onPhotoOpen(card);
    this.closeButton.focus();
  }

  closePhoto({ instant = false } = {}) {
    if (!this.selected) return;
    this.selected = null;
    this.element.classList.remove('visible');
    this.element.setAttribute('aria-hidden', 'true');
    this.stage.classList.remove('archive-active');
    this.onPhotoClose({ instant });
  }

  handleKeyDown(event) {
    if (event.key !== 'Escape') return;
    if (this.selected) this.closePhoto();
    else if (this.visible) this.onRequestClose();
  }

  close() {
    this.closePhoto({ instant: true });
    if (!this.visible) return;
    this.visible = false;
    this.dropActive = false;
    this.settledHold = false;
    this.generation += 1;
    for (const card of this.cards) {
      if (!card.origin) continue;
      card.mesh.position.copy(card.landing);
      card.mesh.quaternion.copy(card.landingQuaternion);
      card.mesh.scale.setScalar(1);
      card.origin = null;
    }
    this.saveSettledCards();
    this.onClose();
  }

  setWorldVisible(visible) {
    this.group.visible = visible;
    if (!visible) this.close();
  }

  clearCards() {
    this.generation += 1;
    this.closePhoto();
    this.cards.forEach(({ mesh }) => {
      mesh.removeFromParent();
    });
    this.cards = [];
    this.dropActive = false;
    this.settledHold = false;
    this.currentImage = null;
    this.images.forEach(({ bitmap, texture, material, geometry }) => {
      geometry?.dispose();
      material?.dispose();
      texture?.dispose();
      bitmap.close();
    });
    this.images = [];
  }

  dispose() {
    this.close();
    this.clearCards();
    this.group.removeFromParent();
    this.element.remove();
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}
