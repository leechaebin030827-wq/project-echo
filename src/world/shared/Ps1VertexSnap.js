import * as THREE from 'three';

const GRID_PIXELS = 2.75;
const WORLD_STRENGTH = 0.72;
const CHARACTER_STRENGTH = 0.34;
const PROJECT_VERTEX = '#include <project_vertex>';

// Snap projected vertices to a small integer pixel grid. The interpolation
// keeps the wobble gentle while retaining the camera-dependent PS1 motion.
export class Ps1VertexSnap {
  constructor() {
    this.resolution = { value: new THREE.Vector2(1, 1) };
    this.patched = new WeakSet();
  }

  setSize(width, height, pixelRatio = 1) {
    this.resolution.value.set(
      Math.max(1, Math.round(width * pixelRatio)),
      Math.max(1, Math.round(height * pixelRatio)),
    );
  }

  install(root, { character = false } = {}) {
    if (root?.userData?.disableVertexSnap) return;
    root?.traverse((object) => {
      if (!object.isMesh || object.userData?.isHitVolume) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material || material.isShaderMaterial || material.isRawShaderMaterial) continue;
        this.patchMaterial(material, character ? CHARACTER_STRENGTH : WORLD_STRENGTH);
      }
    });
  }

  patchMaterial(material, strength) {
    if (this.patched.has(material)) return;
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      if (!shader.vertexShader.includes(PROJECT_VERTEX)) return;
      shader.uniforms.uPs1Resolution = this.resolution;
      shader.uniforms.uPs1GridPixels = { value: GRID_PIXELS };
      shader.uniforms.uPs1Strength = { value: strength };
      shader.vertexShader = `
        uniform vec2 uPs1Resolution;
        uniform float uPs1GridPixels;
        uniform float uPs1Strength;
        ${shader.vertexShader}
      `.replace(PROJECT_VERTEX, `${PROJECT_VERTEX}
        if (gl_Position.w > 0.0) {
          vec2 ps1Pixel = (gl_Position.xy / gl_Position.w * 0.5 + 0.5) * uPs1Resolution;
          vec2 ps1Snapped = floor(ps1Pixel / uPs1GridPixels + 0.5) * uPs1GridPixels;
          vec2 ps1Offset = (ps1Snapped - ps1Pixel) * (2.0 / uPs1Resolution);
          gl_Position.xy += ps1Offset * gl_Position.w * uPs1Strength;
        }
      `);
    };
    material.customProgramCacheKey = () => `${previousKey}-ps1-vertex-snap-v1-${strength}`;
    this.patched.add(material);
    material.needsUpdate = true;
  }
}
