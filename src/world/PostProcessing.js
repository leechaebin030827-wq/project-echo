import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { EXPERIENCE_STATES } from '../config.js';

const EchoGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    portraitFocus: { value: 0 },
    haminaMode: { value: 0 },
    coolerInvert: { value: 0 },
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
    uniform float portraitFocus;
    uniform float haminaMode;
    uniform float coolerInvert;
    varying vec2 vUv;

    float luma(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    float noise(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 pixel = 1.0 / resolution;
      float edge = smoothstep(0.24, 0.72, distance(vUv, vec2(0.5)));
      vec2 separation = pixel * (0.24 + edge * 0.42) * (1.0 - portraitFocus * 0.82);
      vec3 source = texture2D(tDiffuse, vUv).rgb;
      source.r = mix(source.r, texture2D(tDiffuse, vUv + separation).r, 0.065 * (1.0 - portraitFocus));
      source.b = mix(source.b, texture2D(tDiffuse, vUv - separation).b, 0.065 * (1.0 - portraitFocus));

      float originalLuma = luma(source);
      vec3 color = source + vec3(0.006);
      color = (color - 0.48) * 1.055 + 0.48;
      color = max(color, vec3(0.0));

      float gray = luma(color);
      color = mix(vec3(gray), color, 1.14);
      float shadowWeight = 1.0 - smoothstep(0.08, 0.52, originalLuma);
      float highlightWeight = smoothstep(0.58, 1.0, originalLuma);
      color += vec3(-0.004, 0.008, 0.03) * shadowWeight;
      color += vec3(0.032, 0.014, 0.052) * highlightWeight;

      float snowHighlight = smoothstep(0.56, 1.05, luma(color));
      color *= 1.0 - snowHighlight * 0.18 * haminaMode;
      color = mix(color, (color - 0.44) * 1.075 + 0.44, haminaMode);
      color *= mix(vec3(1.0), vec3(0.94, 0.985, 1.035), haminaMode);
      color = max(color, vec3(0.0));

      float vignette = smoothstep(0.45, 0.82, distance(vUv, vec2(0.5)));
      color *= 1.0 - vignette * 0.065 * (1.0 - portraitFocus * 0.65);
      color = mix(color, vec3(1.0) - clamp(color, 0.0, 1.0), coolerInvert);
      float grain = noise(floor(vUv * resolution * 0.72) + floor(time * 7.0));
      color += (grain - 0.5) * 0.0045 * (1.0 - portraitFocus * 0.78);
      gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    }
  `,
};

export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.34, 0.32, 0.84);
    this.gradePass = new ShaderPass(EchoGradeShader);
    this.portraitFocus = 0;
    this.outputPass = new OutputPass();
    this.blendSize = new THREE.Vector2();
    this.blendFrom = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.blendTo = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        fromFrame: { value: this.blendFrom.texture },
        toFrame: { value: this.blendTo.texture },
        amount: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        uniform sampler2D fromFrame;
        uniform sampler2D toFrame;
        uniform float amount;
        varying vec2 vUv;
        void main() {
          gl_FragColor = mix(texture2D(fromFrame, vUv), texture2D(toFrame, vUv), amount);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.blendQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blendMaterial);
    this.blendScene = new THREE.Scene();
    this.blendScene.add(this.blendQuad);
    this.blendCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(this.outputPass);
    this.setWorldMode('nevada');
  }

  setWorldMode(mode) {
    const hamina = mode === 'hamina';
    this.gradePass.uniforms.haminaMode.value = hamina ? 1 : 0;
    this.bloomPass.strength = hamina ? 0.22 : 0.34;
    this.bloomPass.radius = hamina ? 0.32 : 0.32;
    this.bloomPass.threshold = hamina ? 0.9 : 0.84;
    this.renderer.toneMappingExposure = hamina ? 0.93 : 1.06;
  }

  setCoolerInversion(amount) {
    this.gradePass.uniforms.coolerInvert.value = THREE.MathUtils.clamp(amount, 0, 1);
  }

  setSize(width, height, pixelRatio = 1) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.gradePass.uniforms.resolution.value.set(width * pixelRatio, height * pixelRatio);
  }

  render(elapsed = 0, state = null, delta = 1 / 60, worldBlend = null) {
    const focused = [EXPERIENCE_STATES.CHARACTER_FOCUS, EXPERIENCE_STATES.CHARACTER_SWITCH]
      .includes(state);
    this.portraitFocus = THREE.MathUtils.damp(
      this.portraitFocus,
      focused ? 1 : 0,
      focused ? 7 : 4,
      delta,
    );
    this.gradePass.uniforms.time.value = elapsed;
    this.gradePass.uniforms.portraitFocus.value = this.portraitFocus;
    if (worldBlend?.prepared) {
      this.renderWorldBlend(worldBlend);
      return;
    }
    this.composer.render();
  }

  renderWorldBlend(blend) {
    this.renderer.getDrawingBufferSize(this.blendSize);
    const width = Math.max(1, this.blendSize.x);
    const height = Math.max(1, this.blendSize.y);
    if (this.blendFrom.width !== width || this.blendFrom.height !== height) {
      this.blendFrom.setSize(width, height);
      this.blendTo.setSize(width, height);
    }
    const fromVisible = blend.fromWorld.root.visible;
    const toVisible = blend.toWorld.root.visible;
    const characterVisibility = blend.characterRoots.map((root) => root.visible);
    const previousTarget = this.renderer.getRenderTarget();
    try {
      blend.fromWorld.root.visible = true;
      blend.toWorld.root.visible = false;
      this.renderer.setRenderTarget(this.blendFrom);
      this.renderer.render(this.scene, this.camera);

      blend.fromWorld.root.visible = false;
      blend.toWorld.root.visible = true;
      blend.characterRoots.forEach((root) => { root.visible = false; });
      this.renderer.setRenderTarget(this.blendTo);
      this.renderer.render(this.scene, this.camera);
    } finally {
      blend.fromWorld.root.visible = fromVisible;
      blend.toWorld.root.visible = toVisible;
      blend.characterRoots.forEach((root, index) => {
        root.visible = characterVisibility[index];
      });
      this.renderer.setRenderTarget(previousTarget);
    }

    this.blendMaterial.uniforms.amount.value = blend.progress;
    const previousScene = this.renderPass.scene;
    const previousCamera = this.renderPass.camera;
    this.renderPass.scene = this.blendScene;
    this.renderPass.camera = this.blendCamera;
    try {
      this.composer.render();
    } finally {
      this.renderPass.scene = previousScene;
      this.renderPass.camera = previousCamera;
    }
  }

  dispose() {
    this.composer.dispose();
    this.bloomPass.dispose();
    this.gradePass.dispose();
    this.outputPass.dispose();
    this.blendFrom.dispose();
    this.blendTo.dispose();
    this.blendQuad.geometry.dispose();
    this.blendMaterial.dispose();
  }
}
