import * as THREE from 'three';

const SURFACES = Object.freeze(['concrete', 'floor', 'metal']);
const MAP_PROPERTIES = Object.freeze({
  color: 'map', normal: 'normalMap', roughness: 'roughnessMap', height: 'bumpMap',
});

function makeNoiseTexture(base, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = 0; index < 16000; index += 1) {
    const value = Math.round(110 + random() * 125);
    context.fillStyle = `rgba(${value},${value},${value},${0.025 + random() * 0.1})`;
    const size = 0.5 + random() * 2.2;
    context.fillRect(random() * 512, random() * 512, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export class KobeMaterialManager {
  constructor({ tileSize = 2.5 } = {}) {
    this.tileSize = tileSize;
    this.maps = Object.fromEntries(SURFACES.map((surface) => [surface, {}]));
    this.defaults = {
      concrete: makeNoiseTexture('#8b8376', 123),
      floor: makeNoiseTexture('#55514a', 981),
      metal: makeNoiseTexture('#4d5150', 718),
    };
    this.materials = {
      concrete: new THREE.MeshStandardMaterial({
        color: '#c8bca8', roughness: 0.98, side: THREE.DoubleSide,
      }),
      floor: new THREE.MeshStandardMaterial({
        color: '#817c72', roughness: 0.96, side: THREE.DoubleSide,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: '#7c8585', metalness: 0.58, roughness: 0.7,
        emissive: '#171917', emissiveIntensity: 0.14,
      }),
      seam: new THREE.MeshStandardMaterial({ color: '#607078', roughness: 0.9 }),
      light: new THREE.MeshStandardMaterial({
        color: '#fffdf2', emissive: '#fff4cf', emissiveIntensity: 4.4,
        roughness: 0.22, toneMapped: false,
      }),
      safety: new THREE.MeshStandardMaterial({
        color: '#d6a900', emissive: '#5b3c00', emissiveIntensity: 0.18,
        metalness: 0.34, roughness: 0.62,
      }),
      belt: new THREE.MeshStandardMaterial({
        color: '#24231f', roughness: 0.96, metalness: 0.04,
      }),
    };
    this.sync();
  }

  async loadBundledDefaults() {
    if (this.bundledDefaultsPromise) return this.bundledDefaultsPromise;
    const loader = new THREE.TextureLoader();
    const definitions = {
      concrete: {
        color: '/textures/nevada/concrete/Nevada_Winter_Concrete_BaseColor.png',
        normal: '/textures/nevada/concrete/Nevada_Winter_Concrete_Normal.png',
        roughness: '/textures/nevada/concrete/Nevada_Winter_Concrete_Roughness.png',
      },
      floor: {
        color: '/textures/nevada/asphalt/Nevada_Winter_Asphalt_BaseColor.png',
        normal: '/textures/nevada/asphalt/Nevada_Winter_Asphalt_Normal.png',
        roughness: '/textures/nevada/asphalt/Nevada_Winter_Asphalt_Roughness.png',
      },
    };
    this.bundledDefaultsPromise = Promise.all(Object.entries(definitions).flatMap(
      ([surface, maps]) => Object.entries(maps).map(async ([kind, url]) => {
        const texture = await loader.loadAsync(url);
        this.configureTexture(texture, kind);
        texture.name = `Kobe-${surface}-${kind}`;
        this.maps[surface][kind] = texture;
      }),
    )).then(() => {
      this.materials.concrete.color.set('#ffffff');
      this.materials.floor.color.set('#ffffff');
      this.sync();
    });
    return this.bundledDefaultsPromise;
  }

  sync() {
    for (const surface of SURFACES) {
      const material = this.materials[surface];
      const maps = this.maps[surface];
      material.map = maps.color ?? this.defaults[surface];
      material.normalMap = maps.normal ?? null;
      material.roughnessMap = maps.roughness ?? null;
      material.bumpMap = maps.normal ? null : (maps.height ?? null);
      material.bumpScale = 0.045;
      material.normalScale.set(0.58, 0.58);
      material.needsUpdate = true;
    }
  }

  configureTexture(texture, kind) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return texture;
  }

  async update(surface, kind, source) {
    if (!SURFACES.includes(surface) || !MAP_PROPERTIES[kind]) {
      throw new Error(`Unknown Kobe material slot: ${surface}/${kind}`);
    }
    const objectUrl = source instanceof File ? URL.createObjectURL(source) : null;
    try {
      const texture = await new THREE.TextureLoader().loadAsync(objectUrl ?? source);
      this.configureTexture(texture, kind);
      this.maps[surface][kind]?.dispose();
      this.maps[surface][kind] = texture;
      this.sync();
      return texture;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  setTileSize(tileSize) { this.tileSize = Math.max(0.5, Number(tileSize) || 2.5); }

  dispose() {
    for (const surface of SURFACES) {
      this.defaults[surface].dispose();
      Object.values(this.maps[surface]).forEach((texture) => texture.dispose());
    }
    Object.values(this.materials).forEach((material) => material.dispose());
  }
}

export function tileGeometry(geometry, widthMeters, heightMeters, tileSize) {
  const uv = geometry.getAttribute('uv');
  if (!uv) return geometry;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * widthMeters / tileSize,
      uv.getY(index) * heightMeters / tileSize);
  }
  uv.needsUpdate = true;
  return geometry;
}
