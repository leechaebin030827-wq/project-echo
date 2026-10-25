import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Water } from 'three/addons/objects/Water.js';
import { ECHO_TRAVEL_RIG_URL, HAMINA_TERRAIN_TEXTURE_CONFIG } from '../config.js';
import { createCloudTexture } from '../world/shared/SkyDetail.js';

const COVER_PALETTE = Object.freeze({
  zenith: '#030b17',
  middle: '#15345b',
  horizon: '#4a7094',
  water: '#071b3b',
  cloud: '#81889a',
  sun: '#b9c4dc',
});

function createSky() {
  const cloudTexture = createCloudTexture('pacific');
  cloudTexture.wrapS = THREE.RepeatWrapping;
  const sunDirection = new THREE.Vector3(-0.42, 0.24, -0.72).normalize();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(COVER_PALETTE.zenith) },
      middle: { value: new THREE.Color(COVER_PALETTE.middle) },
      horizon: { value: new THREE.Color(COVER_PALETTE.horizon) },
      cloudColor: { value: new THREE.Color(COVER_PALETTE.cloud) },
      sunColor: { value: new THREE.Color(COVER_PALETTE.sun) },
      sunDirection: { value: sunDirection },
      cloudMap: { value: cloudTexture },
      cloudDrift: { value: 0 },
    },
    vertexShader: `varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 zenith, middle, horizon, cloudColor, sunColor, sunDirection;
      uniform sampler2D cloudMap;
      uniform float cloudDrift;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float altitude = max(direction.y, 0.0);
        vec3 color = mix(horizon, middle, smoothstep(0.0, 0.15, altitude));
        color = mix(color, zenith, smoothstep(0.12, 0.8, altitude));
        color = mix(color, horizon, pow(1.0 - smoothstep(0.0, 0.2, altitude), 2.0) * 0.2);
        float sunDot = dot(direction, sunDirection);
        float halo = pow(max(sunDot, 0.0), 10.0) * 0.1;
        float disk = smoothstep(0.9995, 0.99988, sunDot);
        color += sunColor * (halo + disk * 0.9);
        vec2 cloudUv = vec2(
          atan(direction.z, direction.x) / 6.283185 + 0.5 + cloudDrift,
          asin(clamp(direction.y, -1.0, 1.0)) / 3.141593 + 0.5
        );
        vec4 lowCloud = texture2D(cloudMap, cloudUv * vec2(1.18, 0.82));
        vec4 highCloud = texture2D(cloudMap,
          cloudUv * vec2(1.72, 1.3) + vec2(-cloudDrift * 1.8, 0.17));
        float lowCoverage = smoothstep(0.025, 0.38, lowCloud.r);
        float highCoverage = smoothstep(0.055, 0.34, highCloud.r) * 0.42;
        float skyMask = smoothstep(-0.015, 0.13, direction.y)
          * (1.0 - smoothstep(0.67, 0.96, direction.y));
        float coverage = clamp(lowCoverage + highCoverage, 0.0, 1.0) * skyMask;
        float volume = clamp(lowCloud.g * 0.68 + lowCloud.b * 0.32, 0.0, 1.0);
        vec3 cloudShadow = mix(vec3(0.46, 0.5, 0.62), middle, 0.22);
        vec3 cloudLight = mix(cloudShadow, cloudColor, smoothstep(0.18, 0.82, volume));
        float silverLining = pow(max(sunDot, 0.0), 7.0) * smoothstep(0.22, 0.72, lowCloud.b);
        cloudLight += sunColor * silverLining * 0.3;
        color = mix(color, cloudLight, coverage * 0.68);
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(570, 32, 20), material);
  mesh.frustumCulled = false;
  return { mesh, material, cloudTexture, sunDirection };
}

function createPacificWater(waterNormals, sunDirection) {
  waterNormals.wrapS = THREE.RepeatWrapping;
  waterNormals.wrapT = THREE.RepeatWrapping;
  waterNormals.anisotropy = 8;

  const water = new Water(new THREE.PlaneGeometry(1600, 1600, 256, 256), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals,
    sunDirection: new THREE.Vector3(
      sunDirection.x,
      Math.max(0.12, sunDirection.y),
      sunDirection.z,
    ).normalize(),
    sunColor: COVER_PALETTE.sun,
    waterColor: COVER_PALETTE.water,
    distortionScale: 1.35,
    alpha: 1,
    fog: false,
  });
  water.rotation.x = -Math.PI / 2;
  water.frustumCulled = false;
  water.material.uniforms.size.value = 3.4;
  water.material.vertexShader = water.material.vertexShader
    .replace('void main() {', `float seaSwell(vec2 p, float t) {
      return .58 * sin(p.x * .023 + p.y * .016 + t * .42)
        + .31 * sin(p.x * -.037 + p.y * .028 - t * .34)
        + .12 * sin(p.x * .071 - p.y * .052 + t * .58);
    }
    void main() {
      vec3 seaPosition = position;
      seaPosition.z += seaSwell((modelMatrix * vec4(position, 1.0)).xz, time);`)
    .replaceAll('vec4( position, 1.0 )', 'vec4( seaPosition, 1.0 )');
  return water;
}

function createXrayMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#8de9ff',
    emissive: '#287fd0',
    emissiveIntensity: 1.15,
    roughness: 0.12,
    metalness: 0,
    transmission: 0.16,
    thickness: 0.5,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float xrayFacing = abs(dot(normalize(normal), normalize(vViewPosition)));
      float xrayFresnel = pow(1.0 - xrayFacing, 2.15);
      outgoingLight += vec3(0.18, 0.72, 1.0) * (0.28 + xrayFresnel * 1.5);
      diffuseColor.a *= clamp(0.34 + xrayFresnel * 1.7, 0.0, 1.0);
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => 'cover-echo-xray-v1';
  return material;
}

export function createCoverOceanScene(canvas) {
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

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(1);
  renderer.setSize(720, 1280, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COVER_PALETTE.zenith);
  const camera = new THREE.PerspectiveCamera(43, 1080 / 1920, 0.1, 2000);
  camera.position.set(0, 2.05, 8.6);

  const sky = createSky();
  scene.add(sky.mesh);
  scene.add(new THREE.HemisphereLight('#bfe9ff', '#10152d', 1.8));
  const echoLight = new THREE.DirectionalLight('#dff8ff', 3.2);
  echoLight.position.set(-4, 7, 6);
  scene.add(echoLight);

  const clock = new THREE.Clock();
  const lookTarget = new THREE.Vector3(0, 0.96, -15);
  const cameraStartZ = 8.6;
  const forwardSpeed = 2.4;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let water = null;
  let waterNormals = null;
  let echoActor = null;
  let echoModel = null;
  let echoMaterial = null;
  let frame = 0;
  let stopped = false;
  let destroyed = false;

  const render = () => {
    const elapsed = clock.getElapsedTime();
    const forwardTravel = reducedMotion ? 0 : elapsed * forwardSpeed;
    const cameraZ = cameraStartZ - forwardTravel;
    if (water) water.material.uniforms.time.value = elapsed;
    sky.material.uniforms.cloudDrift.value = elapsed * 0.00012;
    if (!reducedMotion) {
      const heave = Math.sin(elapsed * 0.72) * 0.065
        + Math.sin(elapsed * 1.31 + 0.8) * 0.022;
      const sway = Math.sin(elapsed * 0.34 + 0.4) * 0.11
        + Math.sin(elapsed * 0.83) * 0.025;
      camera.position.x = sway;
      camera.position.y = 2.05 + heave;
      camera.position.z = cameraZ + Math.sin(elapsed * 0.46 + 1.2) * 0.045;
      lookTarget.x = Math.sin(elapsed * 0.29) * 0.1;
      lookTarget.y = 0.96 + Math.sin(elapsed * 0.48 + 0.7) * 0.035;
      lookTarget.z = cameraZ - 23.6;
    }
    sky.mesh.position.set(camera.position.x, 0, camera.position.z);
    if (echoActor) {
      const flight = elapsed * 0.16;
      echoActor.position.set(
        Math.sin(flight) * 1.65,
        3.05 + Math.sin(elapsed * 0.55 + 0.4) * 0.2,
        cameraZ - 17 + Math.cos(flight * 0.72) * 1.25,
      );
      echoActor.rotation.set(
        -0.13 + Math.sin(elapsed * 0.43) * 0.055,
        Math.cos(flight) * 1.05,
        Math.sin(elapsed * 0.49 + 0.6) * 0.085,
      );
    }
    camera.lookAt(lookTarget);
    if (!reducedMotion) {
      camera.rotateZ(Math.sin(elapsed * 0.39 + 0.9) * 0.013
        + Math.sin(elapsed * 0.91) * 0.004);
      camera.rotateX(Math.sin(elapsed * 0.57 + 1.4) * 0.006);
    }
    renderer.render(scene, camera);
  };
  const animate = () => {
    if (stopped) return;
    render();
    frame = requestAnimationFrame(animate);
  };

  new THREE.TextureLoader().loadAsync(HAMINA_TERRAIN_TEXTURE_CONFIG.water.normal)
    .then((normalTexture) => {
      if (destroyed) {
        normalTexture.dispose();
        return;
      }
      waterNormals = normalTexture;
      water = createPacificWater(waterNormals, sky.sunDirection);
      scene.add(water);
      render();
    })
    .catch((error) => console.warn('[Cover ocean] water normal unavailable', error));

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(ECHO_TRAVEL_RIG_URL)
    .then(({ scene: loadedScene }) => {
      if (destroyed) return;
      echoModel = loadedScene;
      echoMaterial = createXrayMaterial();
      echoModel.traverse((object) => {
        if (!object.isMesh) return;
        object.material = echoMaterial;
        object.frustumCulled = false;
        object.castShadow = false;
        object.receiveShadow = false;
      });
      const bounds = new THREE.Box3().setFromObject(echoModel);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 2.45 / Math.max(size.x, size.y, size.z, 0.001);
      echoModel.position.copy(center).multiplyScalar(-1);
      echoActor = new THREE.Group();
      echoActor.add(echoModel);
      echoActor.scale.setScalar(scale);
      scene.add(echoActor);
      render();
    })
    .catch((error) => console.warn('[Cover ocean] ECHO rig unavailable', error));

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
      if (water) {
        scene.remove(water);
        water.geometry.dispose();
        water.material.dispose();
      }
      waterNormals?.dispose();
      if (echoActor) scene.remove(echoActor);
      echoModel?.traverse((object) => {
        if (object.isMesh) object.geometry?.dispose();
      });
      echoMaterial?.dispose();
      sky.cloudTexture.dispose();
      sky.mesh.geometry.dispose();
      sky.material.dispose();
      renderer.dispose();
    },
  };
}
