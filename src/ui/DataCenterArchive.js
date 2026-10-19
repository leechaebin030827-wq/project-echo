import * as THREE from 'three';
import { loadVisitorPhotos } from '../face/VisitorPhotoArchive.js';

const MIN_VISIBLE_PHOTOS = 12;
const FALLING_COPIES = 8;
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
      <button class="data-archive-photo-backdrop" type="button" aria-label="사진 닫기"></button>
      <button class="data-archive-photo-close" type="button" aria-label="사진 닫기">×</button>`;
    this.closeButton = this.element.querySelector('.data-archive-photo-close');
    this.closePhoto = this.closePhoto.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.closeButton.addEventListener('click', this.closePhoto);
    this.closeButton.addEventListener('pointerenter', this.onHover);
    this.element.querySelector('.data-archive-photo-backdrop').addEventListener('click', this.closePhoto);
    window.addEventListener('keydown', this.handleKeyDown);
    this.stage.append(this.element);
    this.hint = document.createElement('div');
    this.hint.className = 'data-archive-photo-hint';
    this.stage.append(this.hint);
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
    this.group.visible = true;
    try {
      const records = (await loadVisitorPhotos()).filter((record) => record.blob);
      if (token !== this.generation) return;
      // The current capture is saved locally for the next arrival, while this
      // visitor sees the people who came before them.
      const previousRecords = records.filter((record) => record.id !== this.getCurrentRecordId());
      let displayRecords = previousRecords.length ? previousRecords : records;
      if (!displayRecords.length) {
        const frame = this.getCurrentPhoto();
        if (frame?.width && frame?.height) {
          const blob = await new Promise((resolve) => frame.toBlob(resolve, 'image/png'));
          if (blob) displayRecords = [{ id: -1, blob }];
        }
      }
      if (token !== this.generation) return;
      await this.setRecords(displayRecords, world, token);
      if (token !== this.generation) return;
      this.hint.textContent = this.cards.length
        ? '사진을 눌러 지난 관람객을 보세요'
        : '아직 이전 관람객의 사진이 없습니다';
      this.onOpen();
    } catch (error) {
      console.warn('[Photo Archive] photos could not be released', error);
      if (token === this.generation) this.onOpen();
    }
  }

  async setRecords(records, world, token) {
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
    const sheetCount = Math.max(MIN_VISIBLE_PHOTOS, images.length);
    const copiesById = new Map();
    const bounds = world.navigationBounds ?? this.navigation.garageBox;
    const spanX = bounds.max.x - bounds.min.x;
    const spanZ = bounds.max.z - bounds.min.z;
    const dataCenter = world.interactiveRegions.find((item) => item.name === 'Data Center');
    const towardEcho = world.echoCenter.clone().sub(dataCenter.center);
    towardEcho.y = 0;
    towardEcho.normalize();
    const across = new THREE.Vector3(-towardEcho.z, 0, towardEcho.x);
    const width = clamp(dataCenter.radius * 0.06, 0.85, 1.75) * 0.5;
    for (const image of images) {
      image.texture = makePhotoTexture(image.bitmap);
      image.material = new THREE.MeshBasicMaterial({
        map: image.texture, side: THREE.DoubleSide, transparent: true,
      });
      image.geometry = new THREE.PlaneGeometry(width, width * image.bitmap.height / image.bitmap.width);
    }
    for (let index = 0; index < sheetCount; index += 1) {
      const image = images[index % images.length];
      const copy = copiesById.get(image.id) ?? 0;
      copiesById.set(image.id, copy + 1);
      const seed = image.id * 101 + copy * 7919;
      let landing = null;
      for (let attempt = 0; attempt < 28; attempt += 1) {
        const local = index < FALLING_COPIES && attempt < 16;
        const localDistance = dataCenter.radius * 0.58 + (Math.floor(index / 2) - 0.5) * 1.4
          + attempt * 0.9;
        const localSide = (index % 2 ? 1 : -1) * (0.95 + attempt * 0.25);
        const x = local
          ? dataCenter.center.x + towardEcho.x * localDistance + across.x * localSide
          : bounds.min.x + spanX * (0.07 + scatterValue(seed + attempt * 17) * 0.86);
        const z = local
          ? dataCenter.center.z + towardEcho.z * localDistance + across.z * localSide
          : bounds.min.z + spanZ * (0.07 + scatterValue(seed + attempt * 23 + 7) * 0.86);
        const y = this.navigation.sampleHeight(x, z);
        if (y === null || !this.navigation.isClear(x, y, z)) continue;
        landing = new THREE.Vector3(x, y + 0.06 + index * 0.001, z);
        break;
      }
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

  releaseCopies() {
    if (!this.visible || this.dropActive || !this.cards.length) return null;
    const sources = this.cards.slice(0, FALLING_COPIES);
    const center = new THREE.Vector3();
    for (const source of sources) center.add(source.landing);
    center.divideScalar(sources.length);
    this.dropElapsed = 0;
    this.dropActive = true;
    for (const [index, source] of sources.entries()) {
      const seed = source.seed + 1009;
      const mesh = new THREE.Mesh(source.image.geometry, source.image.material);
      const landing = source.landing.clone().add(new THREE.Vector3(
        (scatterValue(seed + 5) - 0.5) * 1.2,
        0.012 + index * 0.002,
        (scatterValue(seed + 7) - 0.5) * 1.2,
      ));
      const origin = landing.clone().add(new THREE.Vector3(
        (scatterValue(seed + 13) - 0.5) * 2.5,
        7.2 + scatterValue(seed + 17) * 1.5,
        (scatterValue(seed + 19) - 0.5) * 2.5,
      ));
      mesh.position.copy(origin);
      mesh.scale.setScalar(2.35);
      this.group.add(mesh);
      this.cards.push({
        mesh, image: source.image, landing, origin, seed, fallingCopy: true,
        delay: 0.65 + index * 0.16,
        duration: 3.25 + scatterValue(seed + 37) * 0.5,
        landingQuaternion: source.mesh.quaternion.clone(),
      });
    }
    return center;
  }

  update(delta) {
    if (!this.visible) return;
    this.elapsed += Math.min(delta, 0.05);
    if (this.dropActive) this.dropElapsed += Math.min(delta, 0.05);
    this.hint.classList.toggle('visible', this.elapsed > 3.6 && !this.selected && !this.dropActive);
    for (const card of this.cards) {
      if (!card.origin) continue;
      const t = clamp((this.dropElapsed - card.delay) / card.duration, 0, 1);
      if (t <= 0) continue;
      const fall = t * t;
      card.mesh.position.lerpVectors(card.origin, card.landing, fall);
      card.mesh.position.x += Math.sin(t * Math.PI * 2 + card.seed) * (1 - t) * 0.22;
      card.mesh.scale.setScalar(THREE.MathUtils.lerp(2.35, 1, easeOut(t)));
      card.mesh.quaternion.copy(this.camera.quaternion);
      card.mesh.rotateZ(Math.sin(card.seed) * (1 - t) * 0.3);
      card.mesh.quaternion.slerp(card.landingQuaternion, THREE.MathUtils.smoothstep(t, 0.78, 1));
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
    this.hint.classList.remove('visible');
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
    if (this.visible) this.hint.classList.add('visible');
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
    this.hint.classList.remove('visible');
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
    this.hint.remove();
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}
