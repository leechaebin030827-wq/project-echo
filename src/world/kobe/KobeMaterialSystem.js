import * as THREE from 'three';
import { KOBE_CONFIG } from '../../config.js';

const SETS = Object.freeze({
  tunnel: Object.freeze({
    color: '/textures/kobe/tunnel/base-color.png',
    normal: '/textures/kobe/tunnel/normal.png',
    roughness: '/textures/kobe/tunnel/roughness.png',
    height: '/textures/kobe/tunnel/height.png',
    scale: 0.72,
    normalStrength: 0.62,
    heightStrength: 0.2,
  }),
  conveyor: Object.freeze({
    color: '/textures/kobe/conveyor/base-color.png',
    normal: '/textures/kobe/conveyor/normal.png',
    roughness: '/textures/kobe/conveyor/roughness.png',
    height: '/textures/kobe/conveyor/height.png',
    scale: 1.05,
    normalStrength: 0.72,
    heightStrength: 0.24,
  }),
});

const configureTexture = (texture, color = false) => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
};

export function sampleKobeConveyorDisplacement(time) {
  return -time * KOBE_CONFIG.conveyorWorldSpeed;
}

export class KobeMaterialSystem {
  constructor() {
    this.loader = new THREE.TextureLoader();
    this.textures = {};
    this.materials = [];
    this.elapsed = 0;
  }

  async load() {
    await Promise.all(Object.entries(SETS).map(async ([name, definition]) => {
      const [color, normal, roughness, height] = await Promise.all([
        this.loader.loadAsync(definition.color).then((texture) => configureTexture(texture, true)),
        this.loader.loadAsync(definition.normal).then(configureTexture),
        this.loader.loadAsync(definition.roughness).then(configureTexture),
        this.loader.loadAsync(definition.height).then(configureTexture),
      ]);
      this.textures[name] = { color, normal, roughness, height };
    }));
  }

  create(kind) {
    const definition = SETS[kind];
    const maps = this.textures[kind];
    const material = new THREE.MeshStandardMaterial({
      name: `Kobe-${kind}`,
      color: '#ffffff',
      map: maps.color,
      normalMap: maps.normal,
      roughnessMap: maps.roughness,
      roughness: kind === 'tunnel' ? 0.94 : 0.82,
      metalness: kind === 'tunnel' ? 0 : 0.08,
      side: THREE.DoubleSide,
    });
    const uniforms = {
      scale: { value: definition.scale },
      colorMap: { value: maps.color },
      normalMap: { value: maps.normal },
      roughnessMap: { value: maps.roughness },
      heightMap: { value: maps.height },
      motion: { value: 0 },
      normalStrength: { value: definition.normalStrength },
      heightStrength: { value: definition.heightStrength },
    };
    material.userData.kobeUniforms = uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        kobeScale: uniforms.scale,
        kobeColorMap: uniforms.colorMap,
        kobeNormalMap: uniforms.normalMap,
        kobeRoughnessMap: uniforms.roughnessMap,
        kobeHeightMap: uniforms.heightMap,
        kobeMotion: uniforms.motion,
        kobeNormalStrength: uniforms.normalStrength,
        kobeHeightStrength: uniforms.heightStrength,
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vKobeWorldPosition;
          varying vec3 vKobeWorldNormal;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vKobeWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vKobeWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vKobeWorldPosition;
          varying vec3 vKobeWorldNormal;
          uniform float kobeScale;
          uniform sampler2D kobeColorMap;
          uniform sampler2D kobeNormalMap;
          uniform sampler2D kobeRoughnessMap;
          uniform sampler2D kobeHeightMap;
          uniform float kobeMotion;
          uniform float kobeNormalStrength;
          uniform float kobeHeightStrength;

          vec3 kobeWeights(vec3 normal) {
            vec3 weights = pow(abs(normal), vec3(6.0));
            return weights / max(weights.x + weights.y + weights.z, 0.0001);
          }

          vec4 kobeTriplanar(sampler2D tex, vec3 position, vec3 normal) {
            vec3 weights = kobeWeights(normal);
            vec3 p = position * kobeScale + vec3(kobeMotion, 0.0, 0.0);
            return texture2D(tex, p.zy) * weights.x
              + texture2D(tex, p.xz) * weights.y
              + texture2D(tex, p.xy) * weights.z;
          }

          vec3 kobeTriplanarNormal(vec3 position, vec3 surfaceNormal) {
            vec3 weights = kobeWeights(surfaceNormal);
            vec3 p = position * kobeScale + vec3(kobeMotion, 0.0, 0.0);
            vec3 nx = texture2D(kobeNormalMap, p.zy).xyz * 2.0 - 1.0;
            vec3 ny = texture2D(kobeNormalMap, p.xz).xyz * 2.0 - 1.0;
            vec3 nz = texture2D(kobeNormalMap, p.xy).xyz * 2.0 - 1.0;
            vec3 signs = sign(surfaceNormal);
            vec3 worldX = vec3(nx.z * signs.x, nx.y, nx.x * signs.x);
            vec3 worldY = vec3(ny.x, ny.z * signs.y, ny.y * signs.y);
            vec3 worldZ = vec3(nz.x * signs.z, nz.y, nz.z * signs.z);
            return normalize(worldX * weights.x + worldY * weights.y + worldZ * weights.z);
          }`)
        .replace('#include <map_fragment>', `
          vec4 kobeColor = kobeTriplanar(
            kobeColorMap, vKobeWorldPosition, normalize(vKobeWorldNormal));
          float kobeHeight = kobeTriplanar(
            kobeHeightMap, vKobeWorldPosition, normalize(vKobeWorldNormal)).r;
          diffuseColor.rgb *= kobeColor.rgb * mix(0.84, 1.08, kobeHeight);`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          roughnessFactor *= kobeTriplanar(
            kobeRoughnessMap, vKobeWorldPosition, normalize(vKobeWorldNormal)).r;`)
        .replace('#include <normal_fragment_maps>', `
          vec3 kobeSurfaceNormal = normalize(vKobeWorldNormal) * faceDirection;
          vec3 kobeDetailNormal = kobeTriplanarNormal(vKobeWorldPosition, kobeSurfaceNormal);
          float kobeHeightValue = kobeTriplanar(
            kobeHeightMap, vKobeWorldPosition, kobeSurfaceNormal).r;
          vec3 kobeHeightGradient = vec3(dFdx(kobeHeightValue), dFdy(kobeHeightValue), 0.0);
          vec3 kobeWorldNormal = normalize(mix(
            kobeSurfaceNormal,
            kobeDetailNormal + kobeHeightGradient * kobeHeightStrength,
            kobeNormalStrength
          ));
          normal = normalize(mat3(viewMatrix) * kobeWorldNormal);`);
    };
    material.customProgramCacheKey = () => `kobe-triplanar-${kind}-v1`;
    this.materials.push(material);
    return material;
  }

  update(delta) {
    this.elapsed += delta;
    for (const material of this.materials) {
      if (material.name === 'Kobe-conveyor') {
        const displacement = sampleKobeConveyorDisplacement(this.elapsed);
        material.userData.kobeUniforms.motion.value = -displacement * SETS.conveyor.scale;
      }
    }
  }

  dispose() {
    this.materials.forEach((material) => material.dispose());
    Object.values(this.textures).forEach((set) => {
      Object.values(set).forEach((texture) => texture.dispose());
    });
  }
}
