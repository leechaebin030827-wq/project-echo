import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { subdivideFaceSurface } from '../face/FaceSurfaceSmoothing.js';
import { smoothCharacterHeadNormals } from './HeadSurfaceSmoothing.js';

export class BaseCharacterAsset {
  static cache = new Map();

  static load(base) {
    if (!this.cache.has(base)) {
      this.cache.set(base, (async () => {
        const gltf = await new GLTFLoader()
          .setMeshoptDecoder(MeshoptDecoder)
          .loadAsync(`/models/semantic/character_${base.toLowerCase()}_runtime.glb`);
        return new BaseCharacterAsset(base, gltf);
      })());
    }
    return this.cache.get(base);
  }

  constructor(base, gltf) {
    this.base = base;
    this.scene = gltf.scene;
    this.animations = gltf.animations;
    let restHeight = 0;
    const size = new THREE.Vector3();
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => material.name === 'FACE')) {
        object.geometry = subdivideFaceSurface(object.geometry);
      } else if (object.isSkinnedMesh) {
        smoothCharacterHeadNormals(object);
      }
      for (const material of materials) {
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture) texture.anisotropy = 4;
        }
        if (!material.emissive?.isColor) continue;
        const isFace = material.name === 'FACE';
        material.emissive.copy(material.color ?? new THREE.Color('#ffffff'))
          .multiplyScalar(isFace ? 0.18 : 0.2);
        material.emissiveIntensity = isFace ? 0.16 : 0.1;
        if (isFace) {
          material.roughness = Math.max(material.roughness ?? 0, 0.78);
          material.metalness = 0;
        }
        material.needsUpdate = true;
      }
      object.geometry.computeBoundingBox();
      if (!object.geometry.boundingBox) return;
      object.geometry.boundingBox.getSize(size);
      restHeight = Math.max(restHeight, size.y);
    });
    // The semantic kit contains skinned helper geometry whose local bounds are
    // much larger than the rendered person. Keep the measured value inside the
    // validated human scale of the three supplied assets.
    this.renderHeight = restHeight;
    this.height = THREE.MathUtils.clamp(restHeight, 1.45, 1.9);
  }
}
