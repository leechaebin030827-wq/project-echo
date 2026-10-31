import * as THREE from 'three';
import { KOBE_ARCHIVE_INTERACTIONS } from '../../content/KobeInteractions.js';

const ATLAS_URL = '/textures/kobe/archive/poster-atlas-source.png';
const ATLAS_WIDTH = 1536;
const ATLAS_HEIGHT = 1024;
const POSTER_DISPLAY_SCALE = 0.72;
const CROP_PADDING = 9;

const POSTERS = Object.freeze([
  { crop: [20, 15, 585, 450], side: -1, x: -5.2, y: 1.45, width: 2.1, tilt: -0.035 },
  { crop: [625, 42, 520, 420], side: 1, x: -7.5, y: 1.48, width: 1.9, tilt: 0.025 },
  { crop: [1180, 35, 315, 430], side: -1, x: -9.4, y: 1.48, width: 1.16, tilt: 0.045 },
  { crop: [25, 470, 605, 280], side: 1, x: -3.15, y: 1.38, width: 2.35, tilt: -0.028 },
  { crop: [642, 472, 360, 270], side: -1, x: -12.0, y: 1.43, width: 1.38, tilt: 0.035 },
  { crop: [1008, 480, 510, 270], side: 1, x: -10.65, y: 1.42, width: 1.92, tilt: -0.018 },
  { crop: [25, 770, 770, 225], side: -1, x: -2.65, y: 1.4, width: 2.55, tilt: 0.018 },
  { crop: [810, 765, 400, 230], side: 1, x: -13.55, y: 1.42, width: 1.62, tilt: 0.038 },
  { crop: [1220, 755, 300, 240], side: -1, x: -15.25, y: 1.46, width: 1.16, tilt: -0.045 },
]);

export const paddedPosterCrop = ([x, y, width, height], padding = CROP_PADDING) => {
  const left = Math.max(0, x - padding);
  const top = Math.max(0, y - padding);
  const right = Math.min(ATLAS_WIDTH, x + width + padding);
  const bottom = Math.min(ATLAS_HEIGHT, y + height + padding);
  return [left, top, right - left, bottom - top];
};

const createAtlasCrop = (atlas, crop) => {
  const [x, y, width, height] = paddedPosterCrop(crop);
  const texture = atlas.clone();
  texture.needsUpdate = true;
  texture.repeat.set(width / ATLAS_WIDTH, height / ATLAS_HEIGHT);
  texture.offset.set(x / ATLAS_WIDTH, 1 - (y + height) / ATLAS_HEIGHT);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const applyWhiteBackgroundCutout = (material) => {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      #ifdef USE_MAP
        vec3 kobePaperKey = texture2D(map, vMapUv).rgb;
        float kobePaperMin = min(kobePaperKey.r, min(kobePaperKey.g, kobePaperKey.b));
        float kobePaperMax = max(kobePaperKey.r, max(kobePaperKey.g, kobePaperKey.b));
        float kobePaperNeutral = 1.0 - smoothstep(0.025, 0.075, kobePaperMax - kobePaperMin);
        float kobePaperWhite = smoothstep(0.94, 0.985, kobePaperMin);
        diffuseColor.a *= 1.0 - kobePaperWhite * kobePaperNeutral;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'kobe-paper-white-cutout-v1';
};

export async function createKobeArchivePosters(root, tunnelWall) {
  const atlas = await new THREE.TextureLoader().loadAsync(ATLAS_URL);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;

  const wallBounds = new THREE.Box3().setFromObject(tunnelWall);
  const group = new THREE.Group();
  group.name = 'KobeArchivePosters';
  const regions = [];
  const textures = [];

  POSTERS.forEach((definition, index) => {
    const [, , cropWidth, cropHeight] = definition.crop;
    const width = definition.width * POSTER_DISPLAY_SCALE;
    const height = width * cropHeight / cropWidth;
    const texture = createAtlasCrop(atlas, definition.crop);
    textures.push(texture);
    const material = new THREE.MeshStandardMaterial({
      name: `Kobe-Archive-Poster-${String(index + 1).padStart(2, '0')}`,
      map: texture,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: true,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    applyWhiteBackgroundCutout(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    const wallZ = definition.side < 0 ? wallBounds.min.z + 0.018 : wallBounds.max.z - 0.018;
    mesh.name = `Kobe Archive Poster ${String(index + 1).padStart(2, '0')}`;
    mesh.position.set(definition.x, definition.y, wallZ);
    mesh.rotation.set(0, definition.side < 0 ? 0 : Math.PI, definition.tilt);
    mesh.renderOrder = 2;
    group.add(mesh);
    mesh.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(mesh).expandByScalar(0.035);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    regions.push({
      name: `Tunnel Archive ${String(index + 1).padStart(2, '0')}`,
      hoverLabel: KOBE_ARCHIVE_INTERACTIONS[
        `Tunnel Archive ${String(index + 1).padStart(2, '0')}`
      ].label,
      content: KOBE_ARCHIVE_INTERACTIONS[
        `Tunnel Archive ${String(index + 1).padStart(2, '0')}`
      ],
      bounds,
      center,
      size,
      radius,
      meshes: [mesh],
      focusBounds: bounds.clone(),
      focusTarget: center.clone(),
      focusSize: size.clone(),
      focusRadius: radius,
      // The experience is portrait-first, so horizontal FOV is much narrower
      // than vertical FOV. Leave enough distance to show the entire sheet plus
      // a small wall margin instead of cropping its left and right edges.
      // Stay within the narrow tunnel. The camera widens its lens for poster
      // focus, so it can frame the whole sheet without crossing the far wall.
      focusDistance: THREE.MathUtils.clamp(width * 1.25, 1.8, 2.3),
      // Approach diagonally from the tunnel entrance. A purely sideways move
      // can put the camera inside ECHO while it travels along the conveyor.
      focusDirection: new THREE.Vector3(0.7, 0, -definition.side).normalize(),
      cameraMode: 'kobe-poster',
    });
  });

  root.add(group);
  root.updateMatrixWorld(true);

  return {
    group,
    regions,
    dispose() {
      group.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        object.material.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      atlas.dispose();
    },
  };
}
