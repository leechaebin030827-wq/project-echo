import * as THREE from 'three';

export class FaceMaterialController {
  constructor(root) {
    this.materials = [];
    this.texture = null;
    this.focusAmount = 0;
    this.speechOpen = 0;
    root.traverse((object) => {
      if (!object.isMesh) return;
      const replace = (material) => {
        if (material.name !== 'FACE') return material;
        const copy = material.clone();
        // The face and baked head share a very tight surface. Favor the face
        // in the depth buffer so angled portrait shots do not expose dark
        // triangles from the underlying head mesh.
        copy.side = THREE.DoubleSide;
        copy.polygonOffset = true;
        copy.polygonOffsetFactor = -1.5;
        copy.polygonOffsetUnits = -1.5;
        const visibilityFill = { value: 0 };
        const speechOpen = { value: 0 };
        copy.onBeforeCompile = (shader) => {
          shader.uniforms.uFaceVisibilityFill = visibilityFill;
          shader.uniforms.uSpeechOpen = speechOpen;
          shader.vertexShader = `uniform float uSpeechOpen;\n${shader.vertexShader}`;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float speechMouthWidth = exp(-pow((uv1.x - 0.5) / 0.095, 2.0) * 1.5);
            float speechLipBand = exp(-pow((uv1.y - 0.7) / 0.045, 2.0) * 1.4);
            float speechLowerLip = smoothstep(0.69, 0.735, uv1.y);
            transformed.y += uSpeechOpen * speechMouthWidth * speechLipBand
              * (0.0018 * (1.0 - speechLowerLip) - 0.008 * speechLowerLip);`,
          );
          shader.fragmentShader = `uniform float uFaceVisibilityFill;
            uniform float uSpeechOpen;\n${shader.fragmentShader}`;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float speechInnerMouth = exp(-pow((vMapUv.x - 0.5) / 0.058, 2.0) * 1.8
              - pow((vMapUv.y - 0.702) / 0.018, 2.0) * 1.8);
            diffuseColor.rgb *= 1.0 - uSpeechOpen * speechInnerMouth * 0.36;`,
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            `outgoingLight += diffuseColor.rgb * uFaceVisibilityFill * 0.5;
            #include <opaque_fragment>`,
          );
        };
        copy.customProgramCacheKey = () => 'echo-face-visibility-fill-speech-v1';
        this.materials.push({
          material: copy,
          original: copy.map,
          baseColor: copy.color.clone(),
          distantColor: copy.color.clone().multiplyScalar(1.06),
          visibilityFill,
          speechOpen,
          emissiveIntensity: copy.emissiveIntensity ?? 0,
          roughness: copy.roughness ?? 0.78,
        });
        return copy;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(replace)
        : replace(object.material);
    });
  }

  get baseImage() { return this.materials[0]?.original?.image; }

  setSpeechOpen(amount) {
    this.speechOpen = THREE.MathUtils.clamp(amount, 0, 1);
    for (const entry of this.materials) entry.speechOpen.value = this.speechOpen;
  }

  set(texture) {
    this.texture?.dispose();
    this.texture = texture;
    for (const { material } of this.materials) {
      material.map = texture;
      material.needsUpdate = true;
    }
  }

  update(focused, delta, distantFill = 0) {
    this.focusAmount = THREE.MathUtils.damp(
      this.focusAmount,
      focused ? 1 : 0,
      focused ? 8 : 5,
      delta,
    );
    for (const entry of this.materials) {
      const distanceAmount = distantFill * (1 - this.focusAmount);
      entry.material.color.copy(entry.baseColor).lerp(entry.distantColor, distanceAmount);
      entry.visibilityFill.value = distanceAmount;
      entry.material.emissiveIntensity = THREE.MathUtils.lerp(
        entry.emissiveIntensity,
        Math.max(entry.emissiveIntensity, focused ? 0.24 : 0.12),
        Math.max(this.focusAmount, distantFill),
      );
      entry.material.roughness = THREE.MathUtils.lerp(
        entry.roughness,
        Math.max(entry.roughness, 0.88),
        this.focusAmount,
      );
    }
  }

  reset() {
    this.texture?.dispose();
    this.texture = null;
    for (const { material, original } of this.materials) {
      material.map = original;
      material.needsUpdate = true;
    }
  }

  dispose() {
    this.reset();
    for (const { material } of this.materials) material.dispose();
  }
}
