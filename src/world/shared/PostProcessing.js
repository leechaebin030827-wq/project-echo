import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { EXPERIENCE_STATES } from '../../config.js';

const EchoGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    portraitFocus: { value: 0 },
    haminaMode: { value: 0 },
    kobeMode: { value: 0 },
    coolerInvert: { value: 0 },
    pacificMotionBlur: { value: 0 },
    pacificDepth: { value: 0 },
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
    uniform float kobeMode;
    uniform float coolerInvert;
    uniform float pacificMotionBlur;
    uniform float pacificDepth;
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
      vec2 separation = pixel * (0.12 + edge * 0.58) * (1.0 - portraitFocus * 0.85);
      vec3 source = texture2D(tDiffuse, vUv).rgb;
      if (pacificMotionBlur > 0.001) {
        vec2 streak = vec2(0.0, pixel.y * 23.0 * pacificMotionBlur);
        vec3 smeared = texture2D(tDiffuse, clamp(vUv - streak, 0.0, 1.0)).rgb
          + texture2D(tDiffuse, clamp(vUv - streak * 0.5, 0.0, 1.0)).rgb
          + source
          + texture2D(tDiffuse, clamp(vUv + streak * 0.5, 0.0, 1.0)).rgb
          + texture2D(tDiffuse, clamp(vUv + streak, 0.0, 1.0)).rgb;
        source = mix(source, smeared * 0.2, pacificMotionBlur);
      }
      vec3 nearby = (
        texture2D(tDiffuse, vUv + vec2(pixel.x, 0.0)).rgb
        + texture2D(tDiffuse, vUv - vec2(pixel.x, 0.0)).rgb
        + texture2D(tDiffuse, vUv + vec2(0.0, pixel.y)).rgb
        + texture2D(tDiffuse, vUv - vec2(0.0, pixel.y)).rgb
      ) * 0.25;
      // Restore object edges after bloom without exaggerating the film grain.
      source = max(source + clamp(source - nearby, vec3(-0.12), vec3(0.12))
        * mix(0.26, 0.12, portraitFocus), vec3(0.0));
      source.r = mix(source.r, texture2D(tDiffuse, vUv + separation).r, 0.11 * edge * (1.0 - portraitFocus * 0.8));
      source.b = mix(source.b, texture2D(tDiffuse, vUv - separation).b, 0.11 * edge * (1.0 - portraitFocus * 0.8));

      float originalLuma = luma(source);
      vec3 color = source + vec3(0.008, 0.009, 0.015);
      color = (color - 0.48) * 1.075 + 0.48;
      color = max(color, vec3(0.0));

      float gray = luma(color);
      float saturation = mix(mix(1.25, 1.055, portraitFocus), 0.9, kobeMode);
      color = mix(vec3(gray), color, saturation);
      float cobalt = smoothstep(0.015, 0.17, color.b - max(color.r, color.g));
      float coral = smoothstep(0.035, 0.2, color.r - max(color.g, color.b));
      color = mix(color, color * vec3(0.96, 1.025, 1.075), cobalt * (1.0 - portraitFocus * 0.72));
      color = mix(color, color * vec3(1.06, 1.005, 0.985), coral * (1.0 - portraitFocus * 0.72));
      float shadowWeight = 1.0 - smoothstep(0.08, 0.52, originalLuma);
      float highlightWeight = smoothstep(0.58, 1.0, originalLuma);
      color += mix(vec3(0.0, 0.012, 0.048), vec3(0.032, 0.019, 0.006), kobeMode)
        * shadowWeight * (1.0 - portraitFocus * 0.62);
      color += mix(mix(vec3(0.043, 0.011, 0.016), vec3(0.014, 0.025, 0.046), haminaMode),
        vec3(0.032, 0.023, 0.012), kobeMode)
        * highlightWeight * (1.0 - portraitFocus * 0.55);

      float snowHighlight = smoothstep(0.6, 1.02, luma(color));
      color *= 1.0 - snowHighlight * 0.075 * haminaMode;
      color = mix(color, (color - 0.47) * 1.035 + 0.485, haminaMode);
      color *= mix(vec3(1.0), vec3(1.0, 1.012, 1.02), haminaMode);
      color *= mix(vec3(1.0), vec3(1.055, 1.018, 0.93), kobeMode);
      color = max(color, vec3(0.0));

      float vignette = smoothstep(0.45, 0.82, distance(vUv, vec2(0.5)));
      color *= 1.0 - vignette * 0.047 * (1.0 - portraitFocus * 0.65);
      color = mix(color, vec3(1.0) - clamp(color, 0.0, 1.0), coolerInvert);
      float grain = noise(floor(vUv * resolution * 0.72) + floor(time * 7.0));
      color += (grain - 0.5) * 0.009 * (1.0 - portraitFocus * 0.5);
      float glow = smoothstep(0.66, 1.18, luma(source));
      color += glow * vec3(0.016, 0.006, 0.009) * (1.0 - haminaMode * 0.45);

      // A restrained CRT texture in screen pixels: scan lines and a fine RGB
      // phosphor pattern. Keep it faint in portraits so facial detail survives.
      float crtStrength = 1.0 - portraitFocus * 0.52;
      float scanLine = pow(0.5 + 0.5 * cos((gl_FragCoord.y - 0.5) * 3.14159265), 4.0);
      vec3 phosphor = 0.987 + 0.013 * (0.5 + 0.5 * cos(
        gl_FragCoord.x * 2.0943951 + vec3(0.0, 2.0943951, 4.1887902)
      ));
      color *= 1.0 - scanLine * 0.04 * crtStrength;
      color *= mix(vec3(1.0), phosphor, crtStrength);
      float sweep = 1.0 - smoothstep(0.0, 0.045, abs(vUv.y - fract(time * 0.085)));
      color += vec3(0.010, 0.012, 0.017) * sweep * crtStrength;

      // Water removes warm wavelengths first. A little more absorption toward
      // the edge and lower frame makes distant seabed and tunnel geometry
      // recede without requiring another depth render pass.
      float waterDistance = pacificDepth * (0.58
        + smoothstep(0.35, 1.0, vUv.y) * 0.18 + edge * 0.24);
      color.r *= 1.0 - waterDistance * 0.34;
      color.g *= 1.0 - waterDistance * 0.10;
      color.b *= 1.0 + waterDistance * 0.055;
      float waterHaze = waterDistance * (1.0 - smoothstep(0.22, 0.82, luma(color))) * 0.08;
      color = mix(color, vec3(0.025, 0.16, 0.24), waterHaze);
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
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.32, 0.86);
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
    this.gradePass.uniforms.pacificMotionBlur.value = 0;
    this.gradePass.uniforms.pacificDepth.value = 0;
    this.gradePass.uniforms.kobeMode.value = mode === 'kobe' ? 1 : 0;
    if (mode === 'lightcable') {
      this.gradePass.uniforms.haminaMode.value = 0.28;
      this.bloomPass.strength = 0.52;
      this.bloomPass.radius = 0.42;
      this.bloomPass.threshold = 0.9;
      this.renderer.toneMappingExposure = 1.02;
      return;
    }
    if (mode === 'kobe') {
      this.gradePass.uniforms.haminaMode.value = 0.08;
      this.bloomPass.strength = 0.16;
      this.bloomPass.radius = 0.24;
      this.bloomPass.threshold = 0.96;
      this.renderer.toneMappingExposure = 1.18;
      return;
    }
    const hamina = mode === 'hamina';
    this.gradePass.uniforms.haminaMode.value = hamina ? 1 : 0;
    this.bloomPass.strength = hamina ? 0.23 : 0.32;
    this.bloomPass.radius = hamina ? 0.30 : 0.32;
    this.bloomPass.threshold = hamina ? 0.91 : 0.86;
    this.renderer.toneMappingExposure = hamina ? 1.035 : 1.1;
  }

  setPacificSubmersion(amount) {
    const depth = THREE.MathUtils.clamp(amount, 0, 1);
    this.gradePass.uniforms.pacificDepth.value = depth;
    this.bloomPass.strength = 0.52 - depth * 0.17;
    this.bloomPass.radius = 0.42 - depth * 0.13;
    this.bloomPass.threshold = 0.9 + depth * 0.02;
  }

  setPacificMotionBlur(amount) {
    this.gradePass.uniforms.pacificMotionBlur.value = THREE.MathUtils.clamp(amount, 0, 1);
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
    if (worldBlend?.prepared && !worldBlend.hideWorlds) {
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
      blend.fromWorld.root.visible = !blend.hideWorlds;
      blend.toWorld.root.visible = false;
      if (blend.hideWorlds) blend.characterRoots.forEach((root) => { root.visible = false; });
      this.renderer.setRenderTarget(this.blendFrom);
      this.renderer.render(this.scene, this.camera);

      blend.fromWorld.root.visible = false;
      blend.toWorld.root.visible = !blend.hideWorlds;
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
