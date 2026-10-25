import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ECHO_TRAVEL_RIG_URL } from '../config.js';

const WIDTH = 720;
const HEIGHT = 1280;
const CAMERA_LAYOUTS = Object.freeze([
  Object.freeze({ columns: 3, rows: 5 }),
  Object.freeze({ columns: 2, rows: 2 }),
  Object.freeze({ columns: 1, rows: 1 }),
  Object.freeze({ columns: 2, rows: 2 }),
]);
const LAYOUT_DURATION = 15;
const BACKGROUND_COLORS = ['#2733d0', '#303ee5', '#3647f0', '#222bb8', '#3c46da'].map(
  (color) => new THREE.Color(color),
);
const PLANE_TOP_COLORS = ['#5868ff', '#6272ff', '#5261f2', '#6b78ff', '#485af0'].map(
  (color) => new THREE.Color(color),
);
const PLANE_BOTTOM_COLORS = ['#222ba8', '#2834c2', '#1d268f', '#313bc8', '#252fb0'].map(
  (color) => new THREE.Color(color),
);

function createSubCameras(columns, rows) {
  const cameras = [];
  const viewportWidth = WIDTH / columns;
  const viewportHeight = HEIGHT / rows;
  const tileAspect = viewportWidth / viewportHeight;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const camera = new THREE.PerspectiveCamera(39, tileAspect, 0.1, 20);
      camera.viewport = new THREE.Vector4(
        Math.floor(column * viewportWidth),
        Math.floor(row * viewportHeight),
        Math.ceil(viewportWidth),
        Math.ceil(viewportHeight),
      );
      camera.position.set(
        (((column + 0.5) / columns) - 0.5) * 2.25,
        (0.5 - ((row + 0.5) / rows)) * 2.55,
        3.15,
      );
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.layers.enable(1);
      camera.userData.home = camera.position.clone();
      camera.userData.phase = row * 0.47 + column * 0.73;
      cameras.push(camera);
    }
  }
  return cameras;
}

function createEchoMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#b9efff',
    emissive: '#226fd1',
    emissiveIntensity: 1.2,
    roughness: 0.1,
    metalness: 0,
    transmission: 0.12,
    thickness: 0.42,
    transparent: true,
    opacity: 0.56,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.userData.wiggleTime = { value: 0 };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWiggleTime = material.userData.wiggleTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWiggleTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float vertexWiggle = sin(position.y * 6.0 + uWiggleTime * 2.1) * 0.009;
        vertexWiggle += sin(position.x * 8.0 - uWiggleTime * 1.7) * 0.006;
        vertexWiggle += sin(position.z * 7.0 + uWiggleTime * 1.35) * 0.005;
        transformed += normal * vertexWiggle;`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float xrayFacing = abs(dot(normalize(normal), normalize(vViewPosition)));
      float xrayFresnel = pow(1.0 - xrayFacing, 2.05);
      outgoingLight += vec3(0.18, 0.7, 1.0) * (0.3 + xrayFresnel * 1.65);
      diffuseColor.a *= clamp(0.38 + xrayFresnel * 1.55, 0.0, 1.0);
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => 'intro-camera-array-xray-v2';
  return material;
}

export function createCoverCameraArrayScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return { destroy() {}, stop() {} };
  }

  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#040844');
  const camera = new THREE.ArrayCamera(createSubCameras(3, 5));
  camera.position.z = 2.65;
  camera.layers.enable(1);
  scene.add(camera);

  scene.add(new THREE.AmbientLight('#718aff', 1.9));
  const keyLight = new THREE.DirectionalLight('#dff7ff', 5.2);
  keyLight.position.set(2.4, 3.4, 5.5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight('#385dff', 3.1);
  rimLight.position.set(-4, -1, 2);
  scene.add(rimLight);

  const backgroundMaterial = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      top0: { value: PLANE_TOP_COLORS[0].clone() },
      top1: { value: PLANE_TOP_COLORS[1].clone() },
      top2: { value: PLANE_TOP_COLORS[2].clone() },
      top3: { value: PLANE_TOP_COLORS[3].clone() },
      top4: { value: PLANE_TOP_COLORS[4].clone() },
      bottom0: { value: PLANE_BOTTOM_COLORS[0].clone() },
      bottom1: { value: PLANE_BOTTOM_COLORS[1].clone() },
      bottom2: { value: PLANE_BOTTOM_COLORS[2].clone() },
      bottom3: { value: PLANE_BOTTOM_COLORS[3].clone() },
      bottom4: { value: PLANE_BOTTOM_COLORS[4].clone() },
      gridSize: { value: new THREE.Vector2(3, 5) },
      colorProgress: { value: 0 },
    },
    vertexShader: `void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
    fragmentShader: `uniform vec3 top0, top1, top2, top3, top4;
      uniform vec3 bottom0, bottom1, bottom2, bottom3, bottom4;
      uniform vec2 gridSize;
      uniform float colorProgress;
      vec3 paletteTop(float index) {
        if (index < 0.5) return top0;
        if (index < 1.5) return top1;
        if (index < 2.5) return top2;
        if (index < 3.5) return top3;
        return top4;
      }
      vec3 paletteBottom(float index) {
        if (index < 0.5) return bottom0;
        if (index < 1.5) return bottom1;
        if (index < 2.5) return bottom2;
        if (index < 3.5) return bottom3;
        return bottom4;
      }
      void main() {
        vec2 screenUv = gl_FragCoord.xy / vec2(720.0, 1280.0);
        vec2 gridUv = screenUv * gridSize;
        vec2 tileUv = fract(gridUv);
        vec2 tile = floor(gridUv);
        float topRow = gridSize.y - 1.0 - tile.y;
        float tileIndex = topRow * gridSize.x + tile.x;
        float localProgress = mod(colorProgress + 0.75 - tileIndex * 0.025 + 5.0, 5.0);
        float paletteIndex = floor(localProgress);
        vec3 topColor = paletteTop(paletteIndex);
        vec3 bottomColor = paletteBottom(paletteIndex);
        float vertical = smoothstep(0.0, 1.0, tileUv.y + (tileUv.x - 0.5) * 0.28);
        float softBand = exp(-pow((tileUv.y - 0.62) * 3.2, 2.0)) * 0.035;
        float centerGlow = 1.0 - smoothstep(0.12, 0.72, distance(tileUv, vec2(0.5, 0.56)));
        float edgeShade = smoothstep(0.38, 0.72, distance(tileUv, vec2(0.5)));
        vec3 color = mix(bottomColor, topColor, vertical);
        color += topColor * (softBand + centerGlow * 0.035);
        color = mix(color, bottomColor, edgeShade * 0.07);
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    backgroundMaterial,
  );
  background.position.z = -2.25;
  scene.add(background);

  const echoRoot = new THREE.Group();
  scene.add(echoRoot);
  let echoModel = null;
  let echoMaterial = null;
  let legJoints = [];
  let frame = 0;
  let stopped = false;
  let destroyed = false;
  let layoutIndex = 0;
  let layoutCameras = camera.cameras;
  let blinkingCameraIndices = [];
  let blinkEndsAt = 0;
  let nextBlinkAt = 1.1;
  const clock = new THREE.Clock();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const legMotion = new THREE.Quaternion();
  const legEuler = new THREE.Euler();
  const animatedBackground = new THREE.Color();

  const applyCameraLayout = (nextLayoutIndex) => {
    const { columns, rows } = CAMERA_LAYOUTS[nextLayoutIndex];
    layoutCameras = createSubCameras(columns, rows);
    camera.cameras = layoutCameras;
    backgroundMaterial.uniforms.gridSize.value.set(columns, rows);
    blinkingCameraIndices = [];
    blinkEndsAt = 0;
    nextBlinkAt = clock.getElapsedTime() + 2.5 + Math.random() * 3;
    const cover = canvas.parentElement;
    cover?.style.setProperty('--array-column-size', `${100 / columns}%`);
    cover?.style.setProperty('--array-row-size', `${100 / rows}%`);
    layoutIndex = nextLayoutIndex;
  };

  applyCameraLayout(0);

  const render = () => {
    const elapsed = clock.getElapsedTime();
    if (echoMaterial) echoMaterial.userData.wiggleTime.value = elapsed;
    const nextLayoutIndex = reducedMotion
      ? 0
      : Math.floor(elapsed / LAYOUT_DURATION) % CAMERA_LAYOUTS.length;
    if (nextLayoutIndex !== layoutIndex) applyCameraLayout(nextLayoutIndex);
    if (!reducedMotion && elapsed >= nextBlinkAt) {
      const blinkCount = Math.random() < 0.56 ? 1 : 2;
      const chosen = new Set();
      while (chosen.size < Math.min(blinkCount, layoutCameras.length)) {
        chosen.add(Math.floor(Math.random() * layoutCameras.length));
      }
      blinkingCameraIndices = [...chosen];
      blinkEndsAt = elapsed + 0.1 + Math.random() * 0.12;
      nextBlinkAt = blinkEndsAt + 2.8 + Math.random() * 4.2;
    }
    if (!reducedMotion && blinkingCameraIndices.length > 0) {
      if (elapsed < blinkEndsAt) {
        layoutCameras.forEach((subcamera, index) => {
          if (blinkingCameraIndices.includes(index)) subcamera.layers.disable(1);
          else subcamera.layers.enable(1);
        });
      } else {
        blinkingCameraIndices = [];
        layoutCameras.forEach((subcamera) => subcamera.layers.enable(1));
      }
    }
    const colorProgress = (elapsed * 0.11) % BACKGROUND_COLORS.length;
    const colorIndex = Math.floor(colorProgress);
    scene.background = animatedBackground.copy(BACKGROUND_COLORS[colorIndex]);
    backgroundMaterial.uniforms.colorProgress.value = elapsed * 0.11;
    if (!reducedMotion) {
      echoRoot.rotation.x = -0.16 + Math.sin(elapsed * 0.27) * 0.1;
      echoRoot.rotation.y = elapsed * 0.24;
      echoRoot.rotation.z = Math.sin(elapsed * 0.31) * 0.16;
      echoRoot.position.y = Math.sin(elapsed * 0.72) * 0.06;

      legJoints.forEach(({ joint, rest, legIndex, section }) => {
        const phase = legIndex * Math.PI * 0.5;
        const stride = Math.sin(elapsed * 1.12 + phase);
        const curl = Math.sin(elapsed * 1.12 + phase + 0.72);
        const side = legIndex % 2 === 0 ? 1 : -1;
        if (section === 'Upper') {
          legEuler.set(stride * 0.11, side * curl * 0.045, stride * side * 0.075);
        } else if (section === 'Lower') {
          legEuler.set(-stride * 0.17 + 0.035, 0, curl * side * 0.045);
        } else {
          legEuler.set(curl * 0.13, stride * side * 0.035, 0);
        }
        legMotion.setFromEuler(legEuler);
        joint.quaternion.copy(rest).multiply(legMotion);
      });

      camera.cameras.forEach((subcamera) => {
        const { home } = subcamera.userData;
        const phase = subcamera.userData.phase;
        subcamera.position.set(
          home.x + Math.sin(elapsed * 0.22 + phase) * 0.07,
          home.y + Math.cos(elapsed * 0.18 + phase) * 0.055,
          home.z + Math.sin(elapsed * 0.16 + phase) * 0.04,
        );
        subcamera.lookAt(0, 0, 0);
        subcamera.updateMatrixWorld();
      });
    }
    renderer.render(scene, camera);
  };

  const animate = () => {
    if (stopped) return;
    render();
    frame = requestAnimationFrame(animate);
  };

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(ECHO_TRAVEL_RIG_URL)
    .then(({ scene: loadedScene }) => {
      if (destroyed) return;
      echoModel = loadedScene;
      echoMaterial = createEchoMaterial();
      echoModel.traverse((object) => {
        const legMatch = object.name.match(/^Leg_(\d+)_(Upper|Lower|Foot)$/);
        if (legMatch) {
          legJoints.push({
            joint: object,
            rest: object.quaternion.clone(),
            legIndex: Number(legMatch[1]) - 1,
            section: legMatch[2],
          });
        }
        if (!object.isMesh) return;
        object.material = echoMaterial;
        object.layers.set(1);
        object.frustumCulled = false;
        object.castShadow = true;
      });

      const bounds = new THREE.Box3().setFromObject(echoModel);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 1.38 / Math.max(size.x, size.y, size.z, 0.001);
      echoModel.position.copy(center).multiplyScalar(-1);
      echoRoot.scale.setScalar(scale);
      echoRoot.add(echoModel);
      render();
    })
    .catch((error) => console.warn('[Cover camera array] ECHO rig unavailable', error));

  if (reducedMotion) render();
  else frame = requestAnimationFrame(animate);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(frame);
    },
    destroy() {
      destroyed = true;
      stopped = true;
      cancelAnimationFrame(frame);
      echoModel?.traverse((object) => {
        if (object.isMesh) object.geometry?.dispose();
      });
      legJoints = [];
      echoMaterial?.dispose();
      background.geometry.dispose();
      backgroundMaterial.dispose();
      renderer.dispose();
    },
  };
}
