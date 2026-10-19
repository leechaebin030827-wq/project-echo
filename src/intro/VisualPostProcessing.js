import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Original Intro.zip optical treatment. Keep the text/UI outside this composer.
export const INTRO_POST_FX = Object.freeze({
  exposure: 1.12,
  contrast: 0.95,
  saturation: 1.14,
  blackPoint: 0.015,
  blueTint: [0, 0.014, 0.045],
  pinkHighlightTint: [0.048, 0.012, 0.027],
  bloomStrength: 0.82,
  bloomRadius: 0.76,
  bloomThreshold: 0.73,
  diffusionStrength: 0.14,
  halationStrength: 0.15,
  grainAmount: 0.02,
  chromaticStrength: 0.52,
  starburstEnabled: false,
  starburstThreshold: 0.92,
  starburstStrength: 0.06,
  starburstLength: 9,
  dofStrength: 0,
});

const DreamShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    exposure: { value: INTRO_POST_FX.exposure },
    contrast: { value: INTRO_POST_FX.contrast },
    saturation: { value: INTRO_POST_FX.saturation },
    blackPoint: { value: INTRO_POST_FX.blackPoint },
    blueTint: { value: new THREE.Vector3(...INTRO_POST_FX.blueTint) },
    pinkHighlightTint: { value: new THREE.Vector3(...INTRO_POST_FX.pinkHighlightTint) },
    diffusionStrength: { value: INTRO_POST_FX.diffusionStrength },
    halationStrength: { value: INTRO_POST_FX.halationStrength },
    grainAmount: { value: INTRO_POST_FX.grainAmount },
    chromaticStrength: { value: INTRO_POST_FX.chromaticStrength },
    starburstEnabled: { value: INTRO_POST_FX.starburstEnabled ? 1 : 0 },
    starburstThreshold: { value: INTRO_POST_FX.starburstThreshold },
    starburstStrength: { value: INTRO_POST_FX.starburstStrength },
    starburstLength: { value: INTRO_POST_FX.starburstLength },
    dofStrength: { value: INTRO_POST_FX.dofStrength },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float blackPoint;
    uniform vec3 blueTint;
    uniform vec3 pinkHighlightTint;
    uniform float diffusionStrength;
    uniform float halationStrength;
    uniform float grainAmount;
    uniform float chromaticStrength;
    uniform float starburstEnabled;
    uniform float starburstThreshold;
    uniform float starburstStrength;
    uniform float starburstLength;
    uniform float dofStrength;
    varying vec2 vUv;

    float dreamLuma(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    float dreamNoise(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 pixel = 1.0 / resolution;
      vec3 original = texture2D(tDiffuse, vUv).rgb;

      vec2 spread = pixel * (3.0 + dofStrength * 5.0);
      vec3 soft = original * 0.28;
      soft += texture2D(tDiffuse, vUv + vec2(spread.x, 0.0)).rgb * 0.12;
      soft += texture2D(tDiffuse, vUv - vec2(spread.x, 0.0)).rgb * 0.12;
      soft += texture2D(tDiffuse, vUv + vec2(0.0, spread.y)).rgb * 0.12;
      soft += texture2D(tDiffuse, vUv - vec2(0.0, spread.y)).rgb * 0.12;
      soft += texture2D(tDiffuse, vUv + spread).rgb * 0.06;
      soft += texture2D(tDiffuse, vUv - spread).rgb * 0.06;
      soft += texture2D(tDiffuse, vUv + vec2(spread.x, -spread.y)).rgb * 0.06;
      soft += texture2D(tDiffuse, vUv + vec2(-spread.x, spread.y)).rgb * 0.06;
      float bright = smoothstep(0.24, 0.9, dreamLuma(original));
      vec3 color = mix(original, soft, diffusionStrength * (0.4 + bright * 0.6));

      float halo = smoothstep(0.58, 1.05, dreamLuma(soft));
      color += halo * halationStrength * vec3(0.15, 0.105, 0.15);

      color = max(color * exposure - vec3(blackPoint), vec3(0.0));
      color = pow(color, vec3(1.0 / contrast));
      float gray = dreamLuma(color);
      color = mix(vec3(gray), color, saturation);
      float visibleImage = smoothstep(0.0, 0.08, gray);
      color += blueTint * (1.0 - smoothstep(0.35, 1.0, gray)) * visibleImage;
      color += pinkHighlightTint * smoothstep(0.62, 1.2, gray);

      float edge = smoothstep(0.28, 0.72, distance(vUv, vec2(0.5)));
      float shiftAmount = chromaticStrength * (edge + bright * 0.3);
      vec2 shift = pixel * shiftAmount;
      color.r = mix(color.r, texture2D(tDiffuse, vUv + shift).r * exposure, 0.18);
      color.b = mix(color.b, texture2D(tDiffuse, vUv - shift).b * exposure, 0.18);

      if (starburstEnabled > 0.5) {
        vec2 ray = pixel * starburstLength;
        float cross = 0.0;
        cross += max(dreamLuma(texture2D(tDiffuse, vUv + vec2(ray.x, 0.0)).rgb) - starburstThreshold, 0.0);
        cross += max(dreamLuma(texture2D(tDiffuse, vUv - vec2(ray.x, 0.0)).rgb) - starburstThreshold, 0.0);
        cross += max(dreamLuma(texture2D(tDiffuse, vUv + vec2(0.0, ray.y)).rgb) - starburstThreshold, 0.0);
        cross += max(dreamLuma(texture2D(tDiffuse, vUv - vec2(0.0, ray.y)).rgb) - starburstThreshold, 0.0);
        color += cross * starburstStrength * vec3(0.9, 0.94, 1.0);
      }

      float grain = dreamNoise(floor(vUv * resolution * 0.7) + floor(time * 8.0));
      color += (grain - 0.5) * grainAmount * visibleImage;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export function createIntroPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    INTRO_POST_FX.bloomStrength,
    INTRO_POST_FX.bloomRadius,
    INTRO_POST_FX.bloomThreshold,
  );
  composer.addPass(bloom);
  const dream = new ShaderPass(DreamShader);
  composer.addPass(dream);
  const output = new OutputPass();
  composer.addPass(output);

  return {
    resize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      dream.uniforms.resolution.value.set(width * pixelRatio, height * pixelRatio);
    },
    render(timeSeconds) {
      dream.uniforms.time.value = timeSeconds;
      composer.render();
    },
    destroy() {
      composer.dispose();
      bloom.dispose();
      dream.dispose();
      output.dispose();
    },
  };
}
