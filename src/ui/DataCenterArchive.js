import * as THREE from 'three';
import { loadVisitorPhotos } from '../face/VisitorPhotoArchive.js';
import { ARCHIVE_UI } from '../content/WorldUiCopy.js';

const MIN_VISIBLE_PHOTOS = 12;
const FALLING_COPIES = 16;
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
    getCurrentPhoto = () => null,
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
    this.elapsed = 0;
    this.dropElapsed = 0;
    this.dropActive = false;
    this.selected = null;
    this.element = document.createElement('section');
    this.element.className = 'data-archive-photo-viewer';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <button class="data-archive-photo-backdrop" type="button" aria-label="${ARCHIVE_UI.photoClose}"></button>
      <button class="data-archive-photo-close" type="button" aria-label="${ARCHIVE_UI.photoClose}">×</button>`;
    this.closeButton = this.element.querySelector('.data-archive-photo-close');
    this.closePhoto = this.closePhoto.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.closeButton.addEventListener('click', this.closePhoto);
    this.closeButton.addEventListener('pointerenter', this.onHover);
    this.element.querySelector('.data-archive-photo-backdrop').addEventListener('click', this.closePhoto);
    window.addEventListener('keydown', this.handleKeyDown);
    this.stage.append(this.element);
  }

  async restore(world) {
    const token = ++this.generation;
    try {
      const records = (await loadVisitorPhotos()).filter((record) => record.blob);
      if (token === this.generation) await this.setRecords(records, world, token);
    } catch (error) {
      console.warn('[Photo Archive] released photos could not be restored', error);
    }
  }

  async open(region, world) {
    const token = ++this.generation;
    this.visible = true;
    this.elapsed = 0;
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
      }
      if (token !== this.generation) return;
      const displayRecords = currentRecord && !records.some((record) => record.id === currentRecord.id)
        ? [...records, currentRecord] : records;
      await this.setRecords(displayRecords, world, token, { hiddenRecordId: currentRecord?.id });
      if (token !== this.generation) return;
      this.currentImage = this.images.find((image) => image.id === currentRecord?.id) ?? null;
      this.onOpen();
    } catch (error) {
      console.warn('[Photo Archive] photos could not be released', error);
      if (token === this.generation) this.onOpen();
    }
  }

  async setRecords(records, world, token, { hiddenRecordId = null } = {}) {
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
    this.clearCards();
    this.images = images;
    if (!images.length) {
      if (import.meta.env.DEV) this.stage.dataset.qaArchiveCards = '0';
      return;
    }
    const groundImages = images.filter((image) => image.id !== hiddenRecordId);
    const sheetCount = groundImages.length ? Math.max(MIN_VISIBLE_PHOTOS, groundImages.length) : 0;
    const dataCenter = world.interactiveRegions.find((item) => item.name === 'Data Center');
    const width = clamp(dataCenter.radius * 0.06, 0.85, 1.75) * 0.5;
    for (const image of images) {
      image.texture = makePhotoTexture(image.bitmap);
      image.material = new THREE.MeshBasicMaterial({
        map: image.texture, side: THREE.DoubleSide, transparent: true,
      });
      image.geometry = new THREE.PlaneGeometry(width, width * image.bitmap.height / image.bitmap.width);
    }
    for (let index = 0; index < sheetCount; index += 1) {
      const image = groundImages[index % groundImages.length];
      const seed = image.id * 101 + index * 7919;
      const landing = this.findEchoLanding(index, seed, 0);
      if (!landing) continue;
      // Half the width of the previous framed sheets, with the original image
      // aspect ratio preserved and no paper border or printed caption.
      const mesh = new THREE.Mesh(image.geometry, image.material);
      mesh.position.copy(landing);
      mesh.rotation.set(-Math.PI / 2, 0, scatterValue(seed + 43) * Math.PI * 2);
      this.group.add(mesh);
      this.cards.push({ mesh, image, landing, index, seed, delay: index * 0.07,
        duration: 1.5 + scatterValue(seed + 37) * 1.2 });
    }
    if (import.meta.env.DEV) this.stage.dataset.qaArchiveCards = String(this.cards.length);
  }

  findEchoLanding(index, seed, phase) {
    const world = this.world;
    if (!world) return null;
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
    return {
      launch, echo: this.world.echoCenter.clone(), groundY: dataCenter.bounds.min.y,
      outward: towardEcho,
    };
  }

  getFallingCameraSubject() {
    return this.cards.find((card) => card.fallingCopy)?.mesh.position ?? null;
  }

  update(delta) {
    if (!this.visible) return;
    this.elapsed += Math.min(delta, 0.05);
    if (this.dropActive) this.dropElapsed += Math.min(delta, 0.05);
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
    this.generation += 1;
    for (const card of this.cards) {
      if (!card.origin) continue;
      card.mesh.position.copy(card.landing);
      card.mesh.quaternion.copy(card.landingQuaternion);
      card.mesh.scale.setScalar(1);
      card.origin = null;
    }
    this.onClose();
  }

  setWorldVisible(visible) {
    this.group.visible = visible;
    if (!visible) this.close();
  }

  clearCards() {
    this.closePhoto();
    this.cards.forEach(({ mesh }) => {
      mesh.removeFromParent();
    });
    this.cards = [];
    this.dropActive = false;
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
