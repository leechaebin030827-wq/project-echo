import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'three/addons/objects/Water.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { HAMINA_TERRAIN_TEXTURE_CONFIG } from '../../config.js';
import { PACIFIC_ARRIVAL_NARRATION, PACIFIC_NARRATION_START_MS } from '../../content/WorldNarration.js';
import { cueDurationMs } from '../../audio/EchoCuePlayer.js';
import { createCloudTexture } from '../shared/SkyDetail.js';
import {
  CABLE_GAP_METERS, CABLE_START_X, CABLE_WINDOW_COUNT,
  cablePoint, cableTangent, cableSpacing, cableWindowStart, cableSegmentMatrix,
} from './EndlessCablePath.js';
import { CABLE_ECHO_LEAD, CABLE_EXIT_DURATION, getCableExitMotion } from './CableExitMotion.js';
import { createSeabedGeometry, seabedHeight, SEABED_RECENTER_DISTANCE } from './SeabedSurface.js';
import { createGlassCableModule, GLASS_CABLE_WIDTH } from './GlassCableModule.js';
import { CableDataParticles } from './CableDataParticles.js';
import { createHoverHighlightMaterial } from '../../interaction/HoverHighlight.js';

const MODEL_URL = '/models/LightCable.runtime.glb';
const DETRITUS_URL = '/textures/lightcable/';
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const IMPACT_AT = 3.7;
export const crossesPacificSurface = (previousTime, currentTime) =>
  previousTime < IMPACT_AT && currentTime >= IMPACT_AT;
const SINK_END = 7.6;
const QUESTION_AT = (PACIFIC_NARRATION_START_MS + PACIFIC_ARRIVAL_NARRATION[1].atMs) / 1000;
const QUESTION_ZOOM_IN_END = QUESTION_AT + 2.2;
const LOST_CUE = PACIFIC_ARRIVAL_NARRATION[3];
const DIVE_START = (PACIFIC_NARRATION_START_MS + LOST_CUE.atMs + cueDurationMs('K09')) / 1000 + .2;
const DIVE_END = DIVE_START + 9.2;
const VERTICAL_DESCENT_DURATION = 3.2;
const CABLE_RUSH_START = DIVE_END - 2.2;
const CAMERA_START = DIVE_END;
const TRAVEL_SPEED = 3.8;
const ENTRY_SPRINT_DURATION = 2.5;
const ENTRY_SPRINT_DISTANCE = 12;
const ORIGIN_REBASE_DISTANCE = 1200;
const ECHO_WALK_SCALE = 2.45;
const FISH_SCALE = .39;
const FISH_ROUTE_LENGTH = 100;
const PLANT_SCALE = .6;
const CAMERA_SPRING_STIFFNESS = 23;
const CAMERA_SPRING_DAMPING = 9.5;
const CAMERA_LOOK_AHEAD = 9;

const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const smoother = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function getSurfaceEchoMotion(time) {
  const fallStart = .35;
  const fallDuration = IMPACT_AT - fallStart;
  const fall = THREE.MathUtils.clamp((time - fallStart) / fallDuration, 0, 1);
  const underwaterAge = Math.max(0, time - IMPACT_AT);
  const sink = smoother(underwaterAge / (SINK_END - IMPACT_AT));
  // Keep downward velocity through the surface instead of easing to a stop in
  // mid-air. Water drag catches the body quickly, then the slower sink takes over.
  const fallingHeight = THREE.MathUtils.lerp(12.8, .18, fall * fall);
  const impactPenetration = 1.38 * (1 - Math.exp(-underwaterAge * 4.2));
  const height = time < IMPACT_AT
    ? fallingHeight
    : .18 - impactPenetration - (13.18 - impactPenetration) * sink;
  const swimBlend = smoother(underwaterAge / 1.25);
  const yaw = time < IMPACT_AT
    ? time * .4
    : IMPACT_AT * .4 + underwaterAge * THREE.MathUtils.lerp(.4, .11, swimBlend);
  const pitch = THREE.MathUtils.lerp(-.25, -.72, fall)
    + THREE.MathUtils.lerp(0, .42, sink);
  return { fall, sink, height, swimBlend, yaw, pitch };
}

function rippleGeometry(seed) {
  const geometry = new THREE.RingGeometry(1, 1.12, 96);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const angle = Math.atan2(y, x);
    const variation = 1 + .055 * Math.sin(angle * 5 + seed)
      + .035 * Math.sin(angle * 11 - seed * 1.7);
    positions.setXY(index, x * variation, y * variation);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pacificLight() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Honolulu', hour: '2-digit', hourCycle: 'h23',
  }).format(new Date()));
  if (hour < 5 || hour >= 20) return { zenith: '#07162e', middle: '#203a58', horizon: '#647a8b', water: '#061329', cloud: '#9aabb8', sun: '#b9cbd9', daylight: .16, hour };
  if (hour < 7) return { zenith: '#123b66', middle: '#638fae', horizon: '#bccbd3', water: '#071b36', cloud: '#dee0db', sun: '#ffddae', daylight: .48, hour };
  if (hour < 17) return { zenith: '#11629b', middle: '#74b1d1', horizon: '#d8e4e8', water: '#071b3b', cloud: '#f0f4f3', sun: '#fff2d4', daylight: .9, hour };
  return { zenith: '#173f69', middle: '#7397b1', horizon: '#bdccd4', water: '#071832', cloud: '#e0e5e2', sun: '#ffdbac', daylight: .46, hour };
}

function instancedGeometry(source, count, material) {
  const result = new THREE.InstancedMesh(source.geometry, material, count);
  result.frustumCulled = true;
  result.castShadow = false;
  result.receiveShadow = true;
  return result;
}

export function computeFishViewPose(matrix, boundingSphere, position, target, cableTarget = null) {
  const center = boundingSphere.center.clone().applyMatrix4(matrix);
  const radius = Math.max(.16, boundingSphere.radius * matrix.getMaxScaleOnAxis());
  if (cableTarget) target.copy(cableTarget);
  else target.copy(center).add(Z_AXIS);
  const viewDirection = target.clone().sub(center).normalize();
  const side = new THREE.Vector3().crossVectors(viewDirection, Y_AXIS);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  else side.normalize();
  // Observe from outside the school, offset far enough sideways that the
  // selected fish never sits between the lens and the advancing ECHO.
  position.copy(center)
    .addScaledVector(side, radius * 2.6 + .9)
    .addScaledVector(Y_AXIS, radius * .72 + .28)
    .addScaledVector(viewDirection, -(radius * .42 + .26));
  return { position, target, radius };
}

export class LightCableWorld {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'PacificLightCableWorld';
    this.root.visible = false;
    this.elapsed = 0;
    this.phase = 'surface';
    this.fish = [];
    this.plants = [];
    this.travelDistance = 0;
    this.originDistance = 0;
    this.cableWindowStart = null;
    this.exitSuction = null;
    this.travelBias = 0;
    this.underwaterFog = new THREE.FogExp2('#061426', .011);
    this.underwaterColor = new THREE.Color('#061426');
    this.surfaceColor = new THREE.Color();
    this.oldBackground = null;
    this.oldFog = null;
    this.random = random(782501);
    this.dummy = new THREE.Object3D();
    this.point = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.swimDirection = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.gazeTarget = new THREE.Vector3();
    this.pointerLookTarget = 0;
    this.pointerLook = 0;
    this.pointerLookTargetY = 0;
    this.pointerLookY = 0;
    this.echoFacing = new THREE.Quaternion();
    this.previousCameraQuaternion = new THREE.Quaternion();
    this.desiredCameraQuaternion = new THREE.Quaternion();
    this.cameraRollQuaternion = new THREE.Quaternion();
    this.cameraRigPosition = new THREE.Vector3();
    this.cameraRigVelocity = new THREE.Vector3();
    this.cameraRigTarget = new THREE.Vector3();
    this.cameraRigAcceleration = new THREE.Vector3();
    this.cameraSide = new THREE.Vector3();
    this.cameraFutureTangent = new THREE.Vector3();
    this.cameraRigReady = false;
    this.cameraRoll = 0;
    this.swimTilt = new THREE.Quaternion();
    this.swimEuler = new THREE.Euler();
    this.bodyRest = null;
    this.bodyRestPosition = null;
    this.echoLocalBottom = 0;
    this.legRest = [];
    this.motionBlur = 0;
    this.creatureView = null;
    this.hoveredCreature = null;
    this.creatureViewBlend = 0;
    this.creatureCameraPosition = new THREE.Vector3();
    this.creatureLookTarget = new THREE.Vector3();
    this.pickMatrix = new THREE.Matrix4();
    this.pickPosition = new THREE.Vector3();
    this.pickProjected = new THREE.Vector3();
    this.creatureRaycaster = new THREE.Raycaster();
    this.creaturePointer = new THREE.Vector2();
    this.creatureHoverMesh = null;
    this.creaturePickMeshes = [];
  }

  async load(echoSource) {
    const loader = new THREE.TextureLoader();
    const [gltf, base, normal, roughness, height, waterNormals] = await Promise.all([
      new GLTFLoader().loadAsync(MODEL_URL),
      loader.loadAsync(`${DETRITUS_URL}base.jpg`),
      loader.loadAsync(`${DETRITUS_URL}normal.jpg`),
      loader.loadAsync(`${DETRITUS_URL}roughness.jpg`),
      loader.loadAsync(`${DETRITUS_URL}height.jpg`),
      loader.loadAsync(HAMINA_TERRAIN_TEXTURE_CONFIG.water.normal),
    ]);
    for (const texture of [base, normal, roughness, height]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(60, 21);
      texture.anisotropy = 8;
    }
    base.colorSpace = THREE.SRGBColorSpace;
    waterNormals.wrapS = THREE.RepeatWrapping;
    waterNormals.wrapT = THREE.RepeatWrapping;
    waterNormals.anisotropy = 8;
    this.waterNormals = waterNormals;
    this.terrainTextures = [base, normal, roughness, height];
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff', map: base, normalMap: normal, roughnessMap: roughness,
      bumpMap: height, bumpScale: 0.11, roughness: 1, metalness: 0,
      emissive: '#a0c9d4', emissiveMap: base, emissiveIntensity: .35,
    });
    this.terrainMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb = pow(diffuseColor.rgb, vec3(0.72)) * 1.3;`,
      );
    };

    this.palette = pacificLight();
    this.makeSurface();
    this.makeImpactEffects();
    this.makeLightShafts();
    this.makeSeabed(gltf.scene.getObjectByName('SeaBottom'));
    this.makeCable();
    this.makePlants(gltf.scene);
    this.makeFish(gltf.scene);
    this.makePlankton();
    this.dataParticles = new CableDataParticles(this.root, this.random);
    this.makeLights();
    this.makeEcho(echoSource);
    this.scene.add(this.root);
    this.root.visible = false;
    return this;
  }

  makeSurface() {
    this.cloudTexture = createCloudTexture('pacific');
    this.cloudTexture.wrapS = THREE.RepeatWrapping;
    const sunElevation = Math.sin((this.palette.hour - 6) * Math.PI / 12);
    this.sunDirection = new THREE.Vector3(
      Math.cos((this.palette.hour - 6) * Math.PI / 12),
      Math.max(-.18, sunElevation), -.48,
    ).normalize();
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(570, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color(this.palette.zenith) },
          middle: { value: new THREE.Color(this.palette.middle) },
          horizon: { value: new THREE.Color(this.palette.horizon) },
          cloudColor: { value: new THREE.Color(this.palette.cloud) },
          sunColor: { value: new THREE.Color(this.palette.sun) },
          sunDirection: { value: this.sunDirection },
          daylight: { value: this.palette.daylight },
          cloudMap: { value: this.cloudTexture },
          cloudDrift: { value: 0 },
        },
        vertexShader: `varying vec3 vDirection;
          void main(){ vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform vec3 zenith,middle,horizon,cloudColor,sunColor,sunDirection;
          uniform sampler2D cloudMap; uniform float cloudDrift,daylight;
          varying vec3 vDirection;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          void main(){
            vec3 direction=normalize(vDirection);
            float altitude=max(direction.y,0.);
            vec3 color=mix(horizon,middle,smoothstep(0.,.13,altitude));
            color=mix(color,zenith,smoothstep(.12,.78,altitude));
            // A thin atmospheric haze at the sea horizon keeps the sky from
            // reading as a flat painted dome.
            color=mix(color,horizon,pow(1.-smoothstep(0.,.19,altitude),2.)*.18);
            float sunDot=dot(direction,sunDirection);
            float halo=pow(max(sunDot,0.),10.)*.075*daylight;
            float disk=smoothstep(.99955,.99988,sunDot)*daylight;
            color+=sunColor*(halo+disk*.95);
            vec2 cloudUv=vec2(atan(direction.z,direction.x)/6.283185+.5+cloudDrift,
              asin(clamp(direction.y,-1.,1.))/3.141593+.5);
            vec4 cloud=texture2D(cloudMap,cloudUv);
            float coverage=smoothstep(.22,.68,cloud.r)*smoothstep(-.015,.12,direction.y);
            float rim=.82+.18*max(dot(direction,sunDirection),0.);
            color=mix(color,cloudColor*rim+sunColor*halo*.2,coverage*.25);
            vec2 starCell=floor(cloudUv*vec2(520.,220.));
            float star=step(.9989,hash(starCell))*pow(max(0.,1.-length(fract(cloudUv*vec2(520.,220.))-.5)*2.),3.);
            color+=vec3(.75,.85,1.)*star*(1.-daylight)*smoothstep(.02,.2,direction.y);
            gl_FragColor=vec4(color,1.);
          }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.root.add(this.sky);
    // Share Hamina's real reflected-water renderer and its authored wave normal.
    // The Pacific uses broader, gentler ripples and its own sky/sun palette.
    this.water = new Water(new THREE.PlaneGeometry(1600, 1600, 256, 256), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: this.waterNormals,
      sunDirection: new THREE.Vector3(
        this.sunDirection.x, Math.max(.12, this.sunDirection.y), this.sunDirection.z,
      ).normalize(),
      sunColor: this.palette.sun,
      waterColor: this.palette.water,
      distortionScale: 1.35,
      alpha: 1,
      fog: false,
    });
    this.water.name = 'PacificSea';
    this.water.rotation.x = -Math.PI / 2;
    this.water.frustumCulled = false;
    this.water.material.uniforms.size.value = 3.4;
    // Water's mirror stays level; small geometric swells break the perfectly
    // straight horizon and give the nearby reflection a physical surface.
    this.water.material.vertexShader = this.water.material.vertexShader
      .replace('void main() {', `float seaSwell(vec2 p, float t) {
        return .58 * sin(p.x * .023 + p.y * .016 + t * .42)
          + .31 * sin(p.x * -.037 + p.y * .028 - t * .34)
          + .12 * sin(p.x * .071 - p.y * .052 + t * .58);
      }
      void main() {
        vec3 seaPosition = position;
        seaPosition.z += seaSwell((modelMatrix * vec4(position, 1.0)).xz, time);`)
      .replaceAll('vec4( position, 1.0 )', 'vec4( seaPosition, 1.0 )');
    const renderReflection = this.water.onBeforeRender.bind(this.water);
    let reflectionFrame = 0;
    this.water.onBeforeRender = (...args) => {
      reflectionFrame = (reflectionFrame + 1) % 2;
      if (reflectionFrame === 0) renderReflection(...args);
    };
    this.root.add(this.water);
  }

  makeImpactEffects() {
    this.impactRings = Array.from({ length: 3 }, (_, index) => {
      const ring = new THREE.Mesh(rippleGeometry(index * 2.3 + .7), new THREE.MeshBasicMaterial({
        color: '#e5fbff', transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, .2, -11);
      ring.visible = false;
      this.root.add(ring);
      return ring;
    });
    this.impactWake = new THREE.Mesh(rippleGeometry(7.4), new THREE.MeshBasicMaterial({
      color: '#a9dce9', transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    this.impactWake.rotation.x = -Math.PI / 2;
    this.impactWake.position.set(0, .45, -11);
    this.impactWake.visible = false;
    this.root.add(this.impactWake);
    this.impactSpray = new THREE.InstancedMesh(
      new THREE.SphereGeometry(.09, 5, 4),
      new THREE.MeshBasicMaterial({
        color: '#eafcff', transparent: true, opacity: 0, depthWrite: false,
      }),
      26,
    );
    this.impactSpray.frustumCulled = false;
    this.impactSpray.visible = false;
    this.impactParticles = Array.from({ length: this.impactSpray.count }, (_, index) => ({
      angle: index * 2.39996,
      speed: 2.4 + (index % 7) * .48,
      lift: 2.7 + (index % 5) * .63,
      delay: (index % 4) * .025,
    }));
    this.root.add(this.impactSpray);
  }

  makeLightShafts() {
    const count = 8;
    const geometry = new THREE.CylinderGeometry(.7, 5.6, 31, 10, 1, true);
    geometry.translate(0, -15.5, 0);
    const offsets = Array.from({ length: count }, (_, index) => ({
      x: -20 + index * 5.8 + this.random() * 2.8,
      z: -18 + this.random() * 34,
      scale: .65 + this.random() * .65,
      phase: this.random() * Math.PI * 2,
    }));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        amount: { value: 0 },
        color: { value: new THREE.Color(this.palette.sun).lerp(new THREE.Color('#78d7ee'), .58) },
      },
      vertexShader: `varying vec3 vLocal; varying vec3 vWorld;
        void main(){
          vLocal = position;
          vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `uniform float time,amount; uniform vec3 color;
        varying vec3 vLocal; varying vec3 vWorld;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        void main(){
          float vertical = smoothstep(-31.0,-3.0,vLocal.y) * (1.0-smoothstep(-5.0,0.0,vLocal.y));
          float shimmer = .72 + .28*sin(vWorld.x*.18+vWorld.z*.13+time*.42);
          float grain = .82 + .18*hash(floor(vWorld.xz*.45+time*.08));
          gl_FragColor = vec4(color * shimmer, vertical * grain * amount * .12);
        }`,
    });
    this.lightShafts = new THREE.InstancedMesh(geometry, material, count);
    this.lightShafts.name = 'PacificLightShafts';
    this.lightShafts.frustumCulled = false;
    this.lightShafts.renderOrder = -1;
    offsets.forEach((offset, index) => {
      this.dummy.position.set(offset.x, -.1, offset.z);
      this.dummy.rotation.set(0, offset.phase, .025 * Math.sin(offset.phase));
      this.dummy.scale.set(offset.scale, 1, offset.scale);
      this.dummy.updateMatrix();
      this.lightShafts.setMatrixAt(index, this.dummy.matrix);
    });
    this.lightShafts.instanceMatrix.needsUpdate = true;
    this.lightShafts.visible = false;
    this.root.add(this.lightShafts);
  }

  updateLightShafts(depthMix, submerged) {
    if (!this.lightShafts) return;
    const shallow = submerged ? 1 - smooth((depthMix - .1) / .78) : 0;
    const amount = shallow * (.24 + this.palette.daylight * .76);
    this.lightShafts.visible = amount > .002;
    this.lightShafts.material.uniforms.amount.value = amount;
    this.lightShafts.material.uniforms.time.value = this.elapsed;
    this.lightShafts.position.x = this.camera.position.x * .16;
    this.lightShafts.position.z = this.camera.position.z * .12;
  }

  updateImpactEffects(time) {
    const age = time - IMPACT_AT;
    this.impactRings.forEach((ring, index) => {
      const progress = (age - index * .17) / 1.5;
      ring.visible = progress >= 0 && progress < 1;
      if (!ring.visible) return;
      ring.scale.setScalar(.5 + 5.3 * smooth(progress));
      ring.material.opacity = .68 * (1 - smooth(progress));
    });
    const wakeProgress = (age - 1.35) / 5.25;
    this.impactWake.visible = wakeProgress >= 0 && wakeProgress < 1;
    if (this.impactWake.visible) {
      this.impactWake.scale.setScalar(1.5 + 2.9 * smooth(wakeProgress));
      this.impactWake.material.opacity = .24 * (1 - smooth(wakeProgress));
    }
    this.impactSpray.visible = age >= 0 && age < 1.35;
    if (!this.impactSpray.visible) return;
    this.impactParticles.forEach((particle, index) => {
      const t = Math.max(0, age - particle.delay);
      const radius = .35 + particle.speed * t;
      this.dummy.position.set(
        Math.cos(particle.angle) * radius,
        .22 + particle.lift * t - 5.7 * t * t,
        -11 + Math.sin(particle.angle) * radius,
      );
      const fade = Math.max(.001, 1 - smooth(t / 1.35));
      this.dummy.scale.set(fade * .6, fade * (1.2 + particle.lift * .12), fade * .6);
      this.dummy.updateMatrix();
      this.impactSpray.setMatrixAt(index, this.dummy.matrix);
    });
    this.impactSpray.instanceMatrix.needsUpdate = true;
    this.impactSpray.material.opacity = 1 - smooth(age / 1.35);
  }

  makeSeabed(source) {
    if (!source) throw new Error('LightCable GLB is missing SeaBottom');
    this.floor = new THREE.Mesh(createSeabedGeometry(), this.terrainMaterial);
    this.floor.name = 'ContinuousSeaBottom';
    this.floor.receiveShadow = true;
    this.floorCell = null;
    this.updateSeabed(CABLE_START_X);
    this.root.add(this.floor);
  }

  updateSeabed(cameraX) {
    const cell = Math.round(cameraX / SEABED_RECENTER_DISTANCE);
    if (this.floorCell === cell) return;
    this.floorCell = cell;
    this.floor.position.x = cell * SEABED_RECENTER_DISTANCE;
  }

  makeCable() {
    const module = createGlassCableModule();
    this.cableBounds = new THREE.Box3(
      new THREE.Vector3(-module.frameLength / 2, 0, 0),
      new THREE.Vector3(module.frameLength / 2, 0, 0),
    );
    this.cableSpacing = cableSpacing(this.cableBounds);
    this.cableInstances = [];
    this.cableMatrices = Array.from({ length: CABLE_WINDOW_COUNT }, () => new THREE.Matrix4());
    for (const piece of module.parts) {
      const material = piece.material;
      for (let start = 0; start < CABLE_WINDOW_COUNT; start += 12) {
        const chunkSize = Math.min(12, CABLE_WINDOW_COUNT - start);
        const instances = instancedGeometry(piece, chunkSize, material);
        instances.name = `${piece.name}_${start}`;
        instances.receiveShadow = !piece.userData.glass;
        this.root.add(instances);
        this.cableInstances.push({ mesh: instances, offset: start });
      }
    }
    this.updateCableWindow(0, true);
    if (import.meta.env.DEV) console.info('[LightCable] procedural cylindrical glass tunnel', {
      frameLength: module.frameLength,
      pieces: CABLE_WINDOW_COUNT,
      spacing: this.cableSpacing,
      gap: CABLE_GAP_METERS,
      chunks: this.cableInstances.length,
    });
  }

  updateCableWindow(distance, force = false) {
    const start = cableWindowStart(distance, this.cableSpacing);
    if (!force && start === this.cableWindowStart) return;
    this.cableWindowStart = start;
    for (let index = 0; index < CABLE_WINDOW_COUNT; index += 1) {
      const matrix = cableSegmentMatrix(start + index, this.cableBounds,
        this.originDistance, this.cableSpacing, this.dummy, this.point, this.tangent);
      this.cableMatrices[index].copy(matrix);
    }
    for (const { mesh, offset } of this.cableInstances) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.setMatrixAt(index, this.cableMatrices[offset + index]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  makePlants(source) {
    for (let species = 1; species <= 5; species += 1) {
      const plant = source.getObjectByName(`Plant${species}`);
      if (!plant?.isMesh) continue;
      const count = 8;
      const instances = instancedGeometry(plant, count, plant.material.clone());
      instances.material.side = THREE.DoubleSide;
      instances.material.emissive = new THREE.Color('#65e2d9');
      instances.material.emissiveMap = instances.material.map;
      instances.material.emissiveIntensity = .85;
      const placements = Array.from({ length: count }, (_, index) => ({
        distance: -35 + ((index + this.random()) / count) * 245,
        side: (index % 2 ? 1 : -1) * (5 + this.random() * 16),
        altitude: .05 + this.random() * .25,
        rotation: this.random() * Math.PI * 2,
        scale: (12 + this.random() * 13) * PLANT_SCALE,
      }));
      this.plants.push({ instances, placements });
      this.creaturePickMeshes.push(instances);
      this.root.add(instances);
    }
    this.updatePlants(true);
  }

  updatePlants(force = false) {
    for (const { instances, placements } of this.plants) {
      let changed = force;
      placements.forEach((placement, index) => {
        if (placement.distance < this.travelDistance - 48) {
          placement.distance += 245 * Math.ceil(
            (this.travelDistance - 48 - placement.distance) / 245,
          );
          changed = true;
        }
        if (!changed && !force) return;
        cablePoint(placement.distance, this.originDistance, this.point);
        cableTangent(placement.distance, this.tangent);
        this.dummy.position.copy(this.point);
        this.dummy.position.x -= this.tangent.z * placement.side;
        this.dummy.position.z += this.tangent.x * placement.side;
        this.dummy.position.y = seabedHeight(
          this.dummy.position.x + this.originDistance, this.dummy.position.z,
        ) + placement.altitude;
        this.dummy.rotation.set(0, placement.rotation, 0);
        this.dummy.scale.setScalar(placement.scale);
        this.dummy.updateMatrix();
        instances.setMatrixAt(index, this.dummy.matrix);
      });
      if (changed) {
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingSphere();
      }
    }
  }

  makeFish(source) {
    for (let species = 1; species <= 5; species += 1) {
      const fish = source.getObjectByName(`Fish${species}`);
      if (!fish?.isMesh) continue;
      const count = 7;
      const material = fish.material.clone();
      material.side = THREE.DoubleSide;
      // Let the authored color and normal textures respond to nearby plankton
      // light instead of flattening them with a constant cyan emission.
      material.emissiveMap = material.map;
      material.emissive = new THREE.Color('#ffffff');
      material.emissiveIntensity = .55;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.swimTime = { value: 0 };
        shader.vertexShader = `uniform float swimTime;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float fishPhase = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
          float swimPhase = swimTime * 2.35 + fishPhase;
          float bodyJoint = smoothstep(-0.11, 0.03, position.z);
          float midJoint = smoothstep(-0.01, 0.09, position.z);
          float tailJoint = smoothstep(0.055, 0.145, position.z);
          float bodyWave = sin(swimPhase + position.z * 7.0) * bodyJoint;
          float midWave = sin(swimPhase - 0.48 + position.z * 11.0) * midJoint;
          float tailWave = sin(swimPhase - 1.05 + position.z * 16.0) * tailJoint;
          transformed.x += bodyWave * 0.006
            + midWave * 0.013
            + tailWave * 0.026;
          transformed.y += cos(swimPhase * 0.82 + position.z * 8.0)
            * (0.0025 * bodyJoint + 0.0045 * tailJoint);`,
        );
        material.userData.swimShader = shader;
      };
      material.customProgramCacheKey = () => 'lightcable-fish-swim-v3';
      const instances = instancedGeometry(fish, count, material);
      // Their transforms travel across the whole route after the initial
      // bounds are computed; these low-poly schools stay cheap to render.
      instances.frustumCulled = false;
      const swimmers = Array.from({ length: count }, () => ({
        distance: -25 + this.random() * FISH_ROUTE_LENGTH,
        side: (this.random() < .5 ? -1 : 1) * (5.2 + this.random() * 5.5),
        altitude: -2.5 + this.random() * 5,
        speed: (2.4 + this.random() * 2.6) * (this.random() < .75 ? -1 : 1),
        phase: this.random() * Math.PI * 2,
        driftRate: .8 + this.random() * .65,
        speedPhase: this.random() * Math.PI * 2,
        scale: (9 + this.random() * 10) * FISH_SCALE,
      }));
      const hoverMaterial = createHoverHighlightMaterial(material, 'blue');
      hoverMaterial.depthWrite = false;
      hoverMaterial.polygonOffset = true;
      hoverMaterial.polygonOffsetFactor = -1;
      const hoverMesh = new THREE.InstancedMesh(instances.geometry, hoverMaterial, 1);
      hoverMesh.frustumCulled = false;
      hoverMesh.renderOrder = 5;
      hoverMesh.visible = false;
      this.fish.push({ instances, swimmers, hoverMesh });
      this.creaturePickMeshes.push(instances);
      this.root.add(instances, hoverMesh);
    }
    this.updateFish(0);
    for (const { instances } of this.fish) instances.computeBoundingSphere();
  }

  updateFish(delta) {
    for (const [groupIndex, { instances, swimmers }] of this.fish.entries()) {
      if (instances.material.userData.swimShader) {
        instances.material.userData.swimShader.uniforms.swimTime.value = this.elapsed;
      }
      swimmers.forEach((swimmer, index) => {
        const time = this.elapsed * swimmer.driftRate;
        const glide = 1 + .18 * Math.sin(time * .31 + swimmer.speedPhase)
          + .08 * Math.sin(time * .79 + swimmer.phase);
        const forwardSpeed = swimmer.speed * glide;
        swimmer.distance += forwardSpeed * delta;
        if (swimmer.distance < this.travelDistance - 25) swimmer.distance += FISH_ROUTE_LENGTH;
        if (swimmer.distance > this.travelDistance + 75) swimmer.distance -= FISH_ROUTE_LENGTH;
        cablePoint(swimmer.distance, this.originDistance, this.point);
        cableTangent(swimmer.distance, this.tangent);
        const sideA = time * .37 + swimmer.phase;
        const sideB = time * .83 + swimmer.speedPhase;
        const heightA = time * .43 + swimmer.speedPhase;
        const heightB = time * .91 + swimmer.phase;
        const sideOffset = 1.2 * Math.sin(sideA) + .55 * Math.sin(sideB);
        const heightOffset = .65 * Math.sin(heightA) + .3 * Math.sin(heightB);
        const sideVelocity = swimmer.driftRate * (
          1.2 * .37 * Math.cos(sideA) + .55 * .83 * Math.cos(sideB)
        );
        const heightVelocity = swimmer.driftRate * (
          .65 * .43 * Math.cos(heightA) + .3 * .91 * Math.cos(heightB)
        );
        this.dummy.position.copy(this.point);
        this.dummy.position.x -= this.tangent.z * (swimmer.side + sideOffset);
        this.dummy.position.z += this.tangent.x * (swimmer.side + sideOffset);
        this.dummy.position.y = this.point.y + swimmer.altitude + heightOffset;
        this.swimDirection.copy(this.tangent).multiplyScalar(forwardSpeed);
        this.swimDirection.x -= this.tangent.z * sideVelocity;
        this.swimDirection.z += this.tangent.x * sideVelocity;
        this.swimDirection.y += heightVelocity;
        this.swimDirection.normalize();
        this.dummy.quaternion.setFromUnitVectors(Z_AXIS, this.swimDirection);
        this.dummy.rotateY(Math.sin(time * 2.05 + swimmer.phase) * .032);
        this.dummy.rotateZ(Math.sin(time * .65 + swimmer.phase) * .082);
        const hovered = this.hoveredCreature?.groupIndex === groupIndex
          && this.hoveredCreature.index === index;
        const viewed = this.creatureView?.kind === 'fish'
          && this.creatureView.groupIndex === groupIndex
          && this.creatureView.index === index;
        this.dummy.scale.setScalar(swimmer.scale * (viewed ? .2 : 1));
        this.dummy.updateMatrix();
        instances.setMatrixAt(index, this.dummy.matrix);
        if (hovered && this.creatureHoverMesh) {
          this.creatureHoverMesh.setMatrixAt(0, this.dummy.matrix);
          this.creatureHoverMesh.instanceMatrix.needsUpdate = true;
        }
      });
      instances.instanceMatrix.needsUpdate = true;
    }
  }

  makePlankton() {
    const count = 2700;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const insideCable = index < count * .18;
      const x = -70 + this.random() * 250;
      const z = insideCable
        ? (this.random() - .5) * 4.8
        : (this.random() < .5 ? -1 : 1) * (4 + this.random() * 20);
      positions[index * 3] = x;
      positions[index * 3 + 1] = insideCable
        ? -50.45 + this.random() * 1.7
        : seabedHeight(CABLE_START_X + x, z) + .65 + Math.pow(this.random(), 2) * 5.2;
      positions[index * 3 + 2] = z;
      phases[index] = this.random() * 6.283;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.planktonMaterial = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: `attribute float phase; uniform float time; varying float vGlow; varying float vHue; varying float vDistance;
        void main(){ vec3 p=position;
          p.x+=sin(time*.24+phase)*.22; p.y+=sin(time*.41+phase*2.)*.18;
          vec4 eye=modelViewMatrix*vec4(p,1.);
          gl_PointSize=clamp(85./max(1.,-eye.z),4.,17.);
          gl_Position=projectionMatrix*eye;
          vDistance=-eye.z;
          vGlow=.68+.32*sin(time*.8+phase);
          vHue=sin(phase*2.3)*.5+.5; }`,
      fragmentShader: `varying float vGlow; varying float vHue; varying float vDistance;
        void main(){ float r=length(gl_PointCoord-.5);
          float halo=pow(smoothstep(.5,.04,r),1.6);
          float core=pow(smoothstep(.19,0.,r),1.3);
          vec3 color=mix(vec3(.18,.65,1.),vec3(.45,1.,.89),vHue);
          float nearness=1.-smoothstep(17.,68.,vDistance);
          gl_FragColor=vec4(color*(halo*.5+core*2.2)*vGlow*nearness,
            (halo*.38+core*.83)*vGlow*nearness); }`,
    });
    this.plankton = new THREE.Points(geometry, this.planktonMaterial);
    this.plankton.frustumCulled = false;
    this.plankton.position.x = CABLE_START_X;
    this.root.add(this.plankton);
  }

  makeLights() {
    this.root.add(new THREE.HemisphereLight('#5c8daa', '#071421', .48));
    this.root.add(new THREE.AmbientLight('#4a7594', .19));
    this.sunLight = new THREE.DirectionalLight(this.palette.sun, this.palette.daylight * 1.1);
    this.sunLight.position.copy(this.sunDirection).multiplyScalar(80);
    this.root.add(this.sunLight);
    this.cameraLamp = new THREE.PointLight('#b4dbea', 2.1, 29, 1.5);
    this.echoLamp = new THREE.PointLight('#a5d8eb', 1.05, 18, 1.7);
    this.planktonLamp = new THREE.PointLight('#8cdbfa', 0, 20, 1.6);
    this.planktonFill = new THREE.PointLight('#62d9ed', 0, 18, 1.6);
    this.root.add(this.cameraLamp, this.echoLamp, this.planktonLamp, this.planktonFill);
    this.seabedGlowLights = this.plants.map((_, index) => {
      const light = new THREE.PointLight(index % 2 ? '#55d9cf' : '#72c9f5', 0, 19, 1.7);
      this.root.add(light);
      return light;
    });
  }

  updateSeabedGlowLights(amount) {
    this.plants.forEach(({ instances, placements }, index) => {
      const targetDistance = this.travelDistance + 14 + index * 7;
      const placement = placements.reduce((nearest, candidate) => (
        !nearest || Math.abs(candidate.distance - targetDistance)
          < Math.abs(nearest.distance - targetDistance) ? candidate : nearest
      ), null);
      if (!placement) return;
      cablePoint(placement.distance, this.originDistance, this.point);
      cableTangent(placement.distance, this.tangent);
      const x = this.point.x - this.tangent.z * placement.side;
      const z = this.point.z + this.tangent.x * placement.side;
      const light = this.seabedGlowLights[index];
      const floorY = seabedHeight(x + this.originDistance, z);
      light.position.set(x, floorY + 2.2, z);
      const proximity = 1 - smooth((Math.abs(placement.distance - this.travelDistance) - 12) / 55);
      light.intensity = amount * proximity
        * (4.1 + .25 * Math.sin(this.elapsed * 1.1 + index * 1.7));
      instances.material.emissiveIntensity = .85 + amount * .42
        + .1 * Math.sin(this.elapsed * .85 + index);
    });
  }

  updatePlanktonLights(amount) {
    this.planktonLamp.intensity = amount * (2.1 + .25 * Math.sin(this.elapsed * 1.2));
    this.planktonFill.intensity = amount * (1.7 + .2 * Math.sin(this.elapsed * 1.5 + 1.8));
    this.planktonLamp.position.copy(this.camera.position);
    this.planktonLamp.position.x += 6;
    this.planktonLamp.position.y += 1.8;
    this.planktonLamp.position.z -= 5.5;
    this.planktonFill.position.copy(this.camera.position);
    this.planktonFill.position.x += 9;
    this.planktonFill.position.y += 1.2;
    this.planktonFill.position.z += 6.5;
  }

  makeEcho(source) {
    if (!source) return;
    const echo = cloneSkeleton(source);
    echo.visible = true;
    const bounds = new THREE.Box3().setFromObject(echo);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const factor = 1.8 / Math.max(size.x, size.y, size.z, .1);
    this.echoTraveler = new THREE.Group();
    this.echoTraveler.name = 'LightCableEcho';
    this.echoTraveler.visible = false;
    const fittedEcho = new THREE.Group();
    fittedEcho.scale.setScalar(factor);
    fittedEcho.position.copy(center).multiplyScalar(-factor);
    fittedEcho.add(echo);
    this.echoTraveler.add(fittedEcho);
    this.echoLocalBottom = new THREE.Box3().setFromObject(fittedEcho).min.y;
    this.swimBody = echo.getObjectByName('Body');
    this.bodyRest = this.swimBody?.quaternion.clone() ?? null;
    this.bodyRestPosition = this.swimBody?.position.clone() ?? null;
    this.legRest = Array.from({ length: 4 }, (_, index) => {
      const id = String(index + 1).padStart(2, '0');
      const upper = echo.getObjectByName(`Leg_${id}_Upper`);
      const lower = echo.getObjectByName(`Leg_${id}_Lower`);
      const foot = echo.getObjectByName(`Leg_${id}_Foot`);
      return {
        upper, lower, foot,
        upperRest: upper?.quaternion.clone(),
        lowerRest: lower?.quaternion.clone(),
        footRest: foot?.quaternion.clone(),
      };
    });
    const fill = new THREE.PointLight('#dcbaff', 1.3, 5, 2);
    fill.position.set(0, 1, 0);
    this.echoTraveler.add(fill);
    this.root.add(this.echoTraveler);
  }

  activate() {
    this.oldBackground = this.scene.background;
    this.oldFog = this.scene.fog;
    this.scene.background = new THREE.Color(this.palette.horizon);
    this.scene.fog = null;
    this.root.visible = true;
    this.echoTraveler.visible = false;
    this.echoTraveler.scale.setScalar(1);
    this.elapsed = 0;
    this.travelDistance = 0;
    this.originDistance = 0;
    this.exitSuction = null;
    this.travelBias = 0;
    this.pointerLook = 0;
    this.pointerLookTarget = 0;
    this.pointerLookY = 0;
    this.pointerLookTargetY = 0;
    this.updateCableWindow(0, true);
    this.updatePlants(true);
    this.updateFish(0);
    this.floorCell = null;
    this.updateSeabed(CABLE_START_X);
    this.phase = 'surface';
    this.motionBlur = 0;
    this.creatureView = null;
    this.creatureViewBlend = 0;
    this.dataParticles.group.visible = false;
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
    this.update(0);
  }

  updateSurfaceEcho(time) {
    if (!this.echoTraveler) return;
    this.echoTraveler.visible = time < SINK_END;
    if (!this.echoTraveler.visible) return;
    const motion = getSurfaceEchoMotion(time);
    const { fall, sink, height, swimBlend, yaw, pitch } = motion;
    this.echoTraveler.position.set(0, height, -11);
    this.echoTraveler.scale.setScalar(2.5 - .48 * sink);
    this.echoTraveler.quaternion.setFromAxisAngle(Y_AXIS, yaw);
    this.swimTilt.setFromAxisAngle(X_AXIS, pitch);
    this.echoTraveler.quaternion.multiply(this.swimTilt);
    this.animateEchoSwimming(time * 1.7, swimBlend);
    this.echoLamp.position.copy(this.echoTraveler.position);
    this.echoLamp.intensity = time < IMPACT_AT ? .65 : .65 * (1 - sink);
  }

  updateCableEntryEcho(time) {
    if (!this.echoTraveler) return;
    const progress = THREE.MathUtils.clamp(
      (time - CABLE_RUSH_START) / (DIVE_END - CABLE_RUSH_START), 0, 1,
    );
    this.echoTraveler.visible = true;
    this.echoTraveler.scale.setScalar(ECHO_WALK_SCALE * (1 + .08 * (1 - smooth(progress))));
    this.placeEchoOnCable(CABLE_ECHO_LEAD);
    cableTangent(CABLE_ECHO_LEAD, this.tangent);
    this.echoTraveler.quaternion.setFromUnitVectors(Z_AXIS, this.tangent);
    this.animateEchoWalking(0);
    this.echoLamp.position.copy(this.echoTraveler.position);
    this.echoLamp.intensity = .6 + progress * .7;
  }

  placeEchoOnCable(distance) {
    cablePoint(distance, this.originDistance, this.echoTraveler.position);
    this.echoTraveler.position.y += -GLASS_CABLE_WIDTH / 2 + .14
      - this.echoLocalBottom * this.echoTraveler.scale.y;
  }

  aimCameraAt(target, delta, roll = 0) {
    this.previousCameraQuaternion.copy(this.camera.quaternion);
    this.camera.lookAt(target);
    this.desiredCameraQuaternion.copy(this.camera.quaternion);
    this.cameraRoll = THREE.MathUtils.damp(this.cameraRoll, roll, 3.4, delta);
    this.cameraRollQuaternion.setFromAxisAngle(Z_AXIS, this.cameraRoll);
    this.desiredCameraQuaternion.multiply(this.cameraRollQuaternion);
    this.camera.quaternion.copy(this.previousCameraQuaternion)
      .slerp(this.desiredCameraQuaternion, 1 - Math.exp(-delta * 5));
  }

  updateCableCameraRig(travel, delta) {
    cablePoint(travel, this.originDistance, this.cameraRigTarget);
    cableTangent(travel, this.tangent);
    cableTangent(travel + CAMERA_LOOK_AHEAD, this.cameraFutureTangent);
    const turn = THREE.MathUtils.clamp(
      this.tangent.x * this.cameraFutureTangent.z - this.tangent.z * this.cameraFutureTangent.x,
      -.35, .35,
    );
    this.cameraSide.set(-this.tangent.z, 0, this.tangent.x).normalize();
    const drift = Math.sin(this.elapsed * .31) * .13 + Math.sin(this.elapsed * .17 + 1.8) * .08;
    this.cameraRigTarget.addScaledVector(this.cameraSide, drift - turn * 2.4);
    this.cameraRigTarget.y += .28
      + Math.sin(this.elapsed * .47) * .08 + Math.sin(this.elapsed * .19 + .7) * .045;
    if (!this.cameraRigReady) {
      this.cameraRigPosition.copy(this.cameraRigTarget);
      this.cameraRigVelocity.set(0, 0, 0);
      this.cameraRigReady = true;
    }
    const step = Math.min(delta, 1 / 30);
    this.cameraRigAcceleration.subVectors(this.cameraRigTarget, this.cameraRigPosition)
      .multiplyScalar(CAMERA_SPRING_STIFFNESS)
      .addScaledVector(this.cameraRigVelocity, -CAMERA_SPRING_DAMPING);
    this.cameraRigVelocity.addScaledVector(this.cameraRigAcceleration, step);
    this.cameraRigPosition.addScaledVector(this.cameraRigVelocity, step);
    this.camera.position.copy(this.cameraRigPosition);
    return turn;
  }

  startExitSuction() {
    if (this.phase !== 'cable' || this.exitSuction) return CABLE_EXIT_DURATION;
    this.pointerLookTarget = 0;
    this.pointerLookTargetY = 0;
    this.exitSuction = { startedAt: this.elapsed, duration: CABLE_EXIT_DURATION };
    return CABLE_EXIT_DURATION;
  }

  setPointerLook(normalizedX, normalizedY = 0) {
    if (this.phase !== 'cable' || this.exitSuction || this.creatureView) return;
    this.pointerLookTarget = THREE.MathUtils.clamp(normalizedX, -1, 1);
    this.pointerLookTargetY = THREE.MathUtils.clamp(normalizedY, -1, 1);
  }

  clearPointerLook() {
    this.pointerLookTarget = 0;
    this.pointerLookTargetY = 0;
  }

  get cableIntroReady() {
    return this.phase === 'cable' && this.elapsed >= CAMERA_START + ENTRY_SPRINT_DURATION;
  }

  pickCreature(clientX, clientY, rect) {
    if (!this.cableIntroReady || this.creatureView || this.exitSuction
      || !rect.width || !rect.height) return null;
    this.creaturePointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    this.creatureRaycaster.setFromCamera(this.creaturePointer, this.camera);
    this.creatureRaycaster.far = 52;
    const directHit = this.creatureRaycaster.intersectObjects(this.creaturePickMeshes, false)[0];
    if (directHit?.instanceId !== undefined) {
      const fishIndex = this.fish.findIndex(({ instances }) => instances === directHit.object);
      return fishIndex >= 0
        ? { kind: 'fish', groupIndex: fishIndex, index: directHit.instanceId }
        : { kind: 'plant', groupIndex: this.plants.findIndex(
          ({ instances }) => instances === directHit.object), index: directHit.instanceId };
    }
    let closest = null;
    let bestScore = Infinity;
    for (const [kind, groups] of [['fish', this.fish], ['plant', this.plants]]) {
      groups.forEach((group, groupIndex) => {
        if (!group.instances.geometry.boundingSphere) {
          group.instances.geometry.computeBoundingSphere();
        }
        const visualCenter = group.instances.geometry.boundingSphere.center;
        for (let index = 0; index < group.instances.count; index += 1) {
          group.instances.getMatrixAt(index, this.pickMatrix);
          this.pickPosition.copy(visualCenter).applyMatrix4(this.pickMatrix);
          const distance = this.camera.position.distanceTo(this.pickPosition);
          if (distance > 52 || distance < .5) continue;
          this.pickProjected.copy(this.pickPosition).project(this.camera);
          if (this.pickProjected.z <= -1 || this.pickProjected.z >= 1
            || Math.abs(this.pickProjected.x) > 1 || Math.abs(this.pickProjected.y) > 1) continue;
          const dx = rect.left + (this.pickProjected.x * .5 + .5) * rect.width - clientX;
          const dy = rect.top + (-this.pickProjected.y * .5 + .5) * rect.height - clientY;
          // The whole projected fish silhouette should respond, including fins and tail.
          const projectedRadius = group.instances.geometry.boundingSphere.radius
            * this.pickMatrix.getMaxScaleOnAxis()
            * rect.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * distance);
          const radius = kind === 'fish' ? Math.max(54, projectedRadius * 1.1) : 72;
          const score = (dx * dx + dy * dy) / (radius * radius) + distance * .003;
          if (score >= 1 || score >= bestScore) continue;
          bestScore = score;
          closest = { kind, groupIndex, index };
        }
      });
    }
    return closest;
  }

  setCreatureHover(creature = null) {
    const next = creature?.kind === 'fish' ? creature : null;
    const previous = this.hoveredCreature;
    const same = previous?.groupIndex === next?.groupIndex && previous?.index === next?.index;
    if (same && !next) return;
    if (same && next) {
      // Fish are instanced and keep swimming. Refresh the proxy transform even
      // while the hovered id is unchanged so its outline never gets left behind.
      const group = this.fish[next.groupIndex];
      if (!group || !this.creatureHoverMesh) return;
      group.instances.getMatrixAt(next.index, this.pickMatrix);
      this.creatureHoverMesh.setMatrixAt(0, this.pickMatrix);
      this.creatureHoverMesh.instanceMatrix.needsUpdate = true;
      this.creatureHoverMesh.visible = true;
      return;
    }
    if (this.creatureHoverMesh) this.creatureHoverMesh.visible = false;
    this.hoveredCreature = next;
    if (next) {
      const group = this.fish[next.groupIndex];
      if (!group) return;
      const { instances, hoverMesh } = group;
      this.creatureHoverMesh = hoverMesh;
      instances.getMatrixAt(next.index, this.pickMatrix);
      this.creatureHoverMesh.setMatrixAt(0, this.pickMatrix);
      this.creatureHoverMesh.instanceMatrix.needsUpdate = true;
      this.creatureHoverMesh.visible = true;
    } else {
      this.creatureHoverMesh = null;
    }
  }

  enterCreatureView(creature) {
    if (!creature || !this.cableIntroReady || this.exitSuction) return false;
    this.setCreatureHover();
    this.creatureView = creature;
    this.pointerLookTarget = 0;
    this.pointerLookTargetY = 0;
    return true;
  }

  leaveCreatureView() {
    this.creatureView = null;
  }

  updateCreatureCamera(delta) {
    this.creatureViewBlend = THREE.MathUtils.damp(this.creatureViewBlend,
      this.creatureView ? 1 : 0, 2.5, delta);
    if (this.creatureView) {
      const { kind, groupIndex, index } = this.creatureView;
      const group = (kind === 'fish' ? this.fish : this.plants)[groupIndex];
      const subject = kind === 'fish' ? group?.swimmers[index] : group?.placements[index];
      if (!group || !subject) { this.leaveCreatureView(); return; }
      group.instances.getMatrixAt(index, this.pickMatrix);
      if (!group.instances.geometry.boundingSphere) {
        group.instances.geometry.computeBoundingSphere();
      }
      const plant = kind === 'plant';
      if (plant) {
        this.creatureCameraPosition.copy(group.instances.geometry.boundingSphere.center)
          .applyMatrix4(this.pickMatrix);
        this.creatureCameraPosition.y += 1.6 + Math.sin(this.elapsed * .72) * .12;
        this.creatureCameraPosition.z += Math.sin(this.elapsed * .45) * .14;
        cablePoint(subject.distance + 6, this.originDistance, this.creatureLookTarget);
        this.creatureLookTarget.y -= .1;
      } else {
        computeFishViewPose(this.pickMatrix, group.instances.geometry.boundingSphere,
          this.creatureCameraPosition, this.creatureLookTarget, this.lookTarget);
        this.creatureCameraPosition.y += Math.sin(this.elapsed * .72) * .035;
      }
    }
    if (this.creatureViewBlend > .002) {
      this.camera.position.lerp(this.creatureCameraPosition, this.creatureViewBlend);
      this.gazeTarget.lerp(this.creatureLookTarget, this.creatureViewBlend);
    }
  }

  cancelExitSuction() {
    if (!this.exitSuction) return;
    const progress = (this.elapsed - this.exitSuction.startedAt) / this.exitSuction.duration;
    this.travelBias += getCableExitMotion(progress).cameraBoost;
    this.exitSuction = null;
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
    if (this.echoTraveler) {
      this.echoTraveler.visible = true;
      this.echoTraveler.scale.setScalar(ECHO_WALK_SCALE);
    }
  }

  update(delta) {
    const previousTime = this.elapsed;
    this.elapsed += Math.min(delta, .1);
    this.water.material.uniforms.time.value = this.elapsed;
    this.sky.material.uniforms.cloudDrift.value = this.elapsed * .000055;
    this.planktonMaterial.uniforms.time.value = this.elapsed;
    const time = this.elapsed;
    if (crossesPacificSurface(previousTime, time)) this.onSurfaceImpact?.();
    this.updateImpactEffects(time);
    if (time < DIVE_START) {
      this.phase = 'surface';
      this.dataParticles.group.visible = false;
      // Hide the abrupt handoff from the splash to the first ECHO narration shot.
      const splashBlurIn = smooth((time - IMPACT_AT) / .08);
      const splashBlurOut = 1 - smooth((time - IMPACT_AT - .15)
        / (PACIFIC_NARRATION_START_MS / 1000 - IMPACT_AT - .15));
      const zoomMotion = time < QUESTION_AT || time >= QUESTION_ZOOM_IN_END ? 0
        : Math.sin(Math.PI * (time - QUESTION_AT) / (QUESTION_ZOOM_IN_END - QUESTION_AT));
      this.motionBlur = Math.min(1, splashBlurIn * splashBlurOut * .65
        + zoomMotion * .22);
      this.submersion = 0;
      this.sky.visible = true;
      this.water.visible = true;
      this.plankton.visible = false;
      this.sunLight.intensity = this.palette.daylight * 1.1;
      this.cameraLamp.intensity = 0;
      this.updateSurfaceEcho(time);
      this.updatePlanktonLights(0);
      this.updateSeabedGlowLights(0);
      this.updateLightShafts(0, false);
      this.terrainMaterial.emissiveIntensity = .35;
      const zoom = time < QUESTION_AT ? 0
        : smoother((time - QUESTION_AT) / (QUESTION_ZOOM_IN_END - QUESTION_AT));
      const zoomAmount = THREE.MathUtils.clamp(zoom, 0, 1);
      // Begin at wave height, looking up into ECHO's fall. After the splash,
      // ease into the established surface framing before the question zoom.
      const fallProgress = smoother(time / IMPACT_AT);
      const splashReframe = smoother((time - IMPACT_AT - .1) / 2);
      this.camera.position.set(
        THREE.MathUtils.lerp(3, 2, fallProgress),
        THREE.MathUtils.lerp(1.45, 1.1, fallProgress),
        THREE.MathUtils.lerp(7, 4.8, fallProgress),
      );
      this.lookTarget.set(0,
        2.3 + Math.max(0, this.echoTraveler?.position.y ?? 0) * .53, -11);
      this.camera.position.lerp(this.point.set(0,
        THREE.MathUtils.lerp(5.7, 3.2, zoomAmount),
        THREE.MathUtils.lerp(19, 3, zoomAmount)), splashReframe);
      this.lookTarget.lerp(this.gazeTarget.set(0,
        THREE.MathUtils.lerp(1, .1, zoomAmount),
        THREE.MathUtils.lerp(-14, -11, zoomAmount)), splashReframe);
      this.camera.lookAt(this.lookTarget);
      const surfaceFov = THREE.MathUtils.lerp(52, 42, zoomAmount);
      if (Math.abs(this.camera.fov - surfaceFov) > .01) {
        this.camera.fov = surfaceFov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }
    if (time < DIVE_END) {
      this.phase = 'descent';
      this.dataParticles.group.visible = false;
      const dropProgress = THREE.MathUtils.clamp(
        (time - DIVE_START) / VERTICAL_DESCENT_DURATION, 0, 1,
      );
      const travelProgress = THREE.MathUtils.clamp(
        (time - DIVE_START - VERTICAL_DESCENT_DURATION)
          / (DIVE_END - DIVE_START - VERTICAL_DESCENT_DURATION), 0, 1,
      );
      const drop = smoother(dropProgress);
      const travel = smoother(travelProgress);
      const cameraMotion = Math.max(
        Math.sin(Math.PI * dropProgress), Math.sin(Math.PI * travelProgress),
      );
      this.camera.position.set(
        THREE.MathUtils.lerp(0, CABLE_START_X, travel),
        THREE.MathUtils.lerp(3.2, -47.8, drop),
        THREE.MathUtils.lerp(3, 0, travel),
      );
      const submerged = this.camera.position.y < -.25;
      this.motionBlur = submerged ? 0 : cameraMotion * .65;
      const depthMix = smooth((Math.max(0, -this.camera.position.y) - .25) / 34);
      this.submersion = depthMix;
      this.sky.visible = !submerged;
      this.water.visible = !submerged;
      this.plankton.visible = submerged;
      this.surfaceColor.set(this.palette.horizon);
      this.scene.background.lerpColors(this.surfaceColor, this.underwaterColor, depthMix);
      if (submerged) {
        this.underwaterFog.density = THREE.MathUtils.lerp(.003, .011, depthMix);
        this.underwaterFog.color.copy(this.scene.background);
        this.scene.fog = this.underwaterFog;
      } else this.scene.fog = null;
      this.updateLightShafts(depthMix, submerged);
      this.sunLight.intensity = this.palette.daylight * 1.1 * (1 - depthMix);
      this.cameraLamp.intensity = depthMix * 2.1;
      this.cameraLamp.position.copy(this.camera.position);
      this.echoLamp.intensity = 0;
      this.updatePlanktonLights(depthMix);
      this.updateSeabedGlowLights(depthMix);
      this.terrainMaterial.emissiveIntensity = .35 + depthMix * .55;
      const target = cablePoint(CABLE_ECHO_LEAD + .8, this.originDistance, this.lookTarget);
      const downwardLook = THREE.MathUtils.lerp(.1, this.camera.position.y - 18,
        smoother((time - DIVE_START) / 1.05));
      this.gazeTarget.set(
        THREE.MathUtils.lerp(0, target.x, travel),
        THREE.MathUtils.lerp(downwardLook, target.y - .65, travel),
        THREE.MathUtils.lerp(-11, target.z, travel),
      );
      this.aimCameraAt(this.gazeTarget, delta);
      const diveFov = THREE.MathUtils.lerp(42, 52, travel);
      if (Math.abs(this.camera.fov - diveFov) > .01) {
        this.camera.fov = diveFov;
        this.camera.updateProjectionMatrix();
      }
      if (time >= CABLE_RUSH_START) this.updateCableEntryEcho(time);
      else if (this.echoTraveler) this.echoTraveler.visible = false;
      this.updateFish(delta);
      return;
    }
    this.phase = 'cable';
    this.updateLightShafts(1, true);
    this.motionBlur = 0;
    this.submersion = 1;
    this.sky.visible = false;
    this.water.visible = false;
    this.plankton.visible = true;
    this.scene.background.copy(this.underwaterColor);
    this.underwaterFog.color.copy(this.underwaterColor);
    this.underwaterFog.density = .011;
    if (!this.scene.fog) this.scene.fog = this.underwaterFog;
    this.sunLight.intensity = .07;
    this.terrainMaterial.emissiveIntensity = .9;
    const exitMotion = this.exitSuction
      ? getCableExitMotion((time - this.exitSuction.startedAt) / this.exitSuction.duration)
      : null;
    const entrySprint = THREE.MathUtils.clamp(
      (time - CAMERA_START) / ENTRY_SPRINT_DURATION, 0, 1,
    );
    const travel = Math.max(0, (time - CAMERA_START) * TRAVEL_SPEED + this.travelBias
      + ENTRY_SPRINT_DISTANCE * smoother(entrySprint)
      + (exitMotion?.cameraBoost ?? 0));
    this.travelDistance = travel;
    const nextOrigin = Math.floor(travel / ORIGIN_REBASE_DISTANCE) * ORIGIN_REBASE_DISTANCE;
    const rebased = nextOrigin !== this.originDistance;
    this.originDistance = nextOrigin;
    this.dataParticles.update(delta, travel, this.originDistance);
    this.updateCableWindow(travel, rebased);
    this.updatePlants(rebased);
    const cameraTurn = this.updateCableCameraRig(travel, delta);
    this.updateSeabed(this.camera.position.x);
    this.cameraLamp.position.copy(this.camera.position);
    this.cameraLamp.intensity = 2.1;
    this.updatePlanktonLights(1);
    this.updateSeabedGlowLights(1);
    // echoLead describes the departure path from the original cable position;
    // subtract the camera's catch-up distance so ECHO stays in the shot.
    const echoDistance = travel + (exitMotion?.echoLead ?? CABLE_ECHO_LEAD)
      - (exitMotion?.cameraBoost ?? 0);
    cablePoint(echoDistance, this.originDistance, this.lookTarget);
    // Keep the cable and ECHO higher in the frame beneath the persistent caption.
    const captionFraming = this.creatureView ? 0 : smoother(
      (time - CAMERA_START - ENTRY_SPRINT_DURATION) / 1.8,
    );
    this.lookTarget.y -= .65 + captionFraming * .9;
    this.pointerLook = THREE.MathUtils.damp(this.pointerLook,
      this.exitSuction ? 0 : this.pointerLookTarget, 4.2, delta);
    this.pointerLookY = THREE.MathUtils.damp(this.pointerLookY,
      this.exitSuction ? 0 : this.pointerLookTargetY, 4.2, delta);
    cableTangent(travel + CABLE_ECHO_LEAD, this.tangent);
    this.gazeTarget.copy(this.lookTarget);
    this.gazeTarget.x -= this.tangent.z * this.pointerLook * 5.8;
    this.gazeTarget.z += this.tangent.x * this.pointerLook * 5.8;
    this.gazeTarget.y += this.pointerLookY * 2.2;
    this.updateCreatureCamera(delta);
    this.cameraLamp.position.copy(this.camera.position);
    const cameraRoll = this.creatureView || this.exitSuction
      ? 0 : THREE.MathUtils.clamp(-cameraTurn * 5.2 - this.pointerLook * .018, -.085, .085);
    this.aimCameraAt(this.gazeTarget, delta, cameraRoll);
    if (this.echoTraveler) {
      this.echoTraveler.visible = exitMotion?.echoVisible ?? true;
      this.echoTraveler.scale.setScalar(ECHO_WALK_SCALE * (exitMotion?.echoScale ?? 1));
      this.placeEchoOnCable(echoDistance);
      cableTangent(echoDistance, this.tangent);
      this.echoFacing.setFromUnitVectors(Z_AXIS, this.tangent);
      this.echoTraveler.quaternion.copy(this.echoFacing);
      this.animateEchoWalking((echoDistance - CABLE_ECHO_LEAD) * 1.6);
      this.echoLamp.position.copy(this.echoTraveler.position);
      this.echoLamp.intensity = 1.05;
    }
    if (exitMotion && Math.abs(this.camera.fov - exitMotion.fov) > .01) {
      this.camera.fov = exitMotion.fov;
      this.camera.updateProjectionMatrix();
    } else if (!exitMotion) {
      const speedLift = THREE.MathUtils.clamp(
        (this.cameraRigVelocity.length() - TRAVEL_SPEED) * .32, 0, 1.8,
      );
      const sprintFov = 52 + 2 * Math.sin(Math.PI * entrySprint)
        + speedLift + Math.abs(cameraTurn) * 4.5;
      if (Math.abs(this.camera.fov - sprintFov) > .01) {
        this.camera.fov = sprintFov;
        this.camera.updateProjectionMatrix();
      }
    }
    this.plankton.position.x = this.camera.position.x;
    this.plankton.position.z = this.camera.position.z;
    this.updateFish(delta);
  }

  animateEchoSwimming(time, strength = 1) {
    if (this.swimBody && this.bodyRest) {
      if (this.bodyRestPosition) this.swimBody.position.copy(this.bodyRestPosition);
      this.swimEuler.set(
        strength * (.055 + Math.sin(time * .74) * .035),
        strength * Math.sin(time * .52) * .035,
        strength * Math.sin(time * .91) * .055,
      );
      this.swimTilt.setFromEuler(this.swimEuler);
      this.swimBody.quaternion.copy(this.bodyRest).multiply(this.swimTilt);
    }
    for (let index = 0; index < this.legRest.length; index += 1) {
      const leg = this.legRest[index];
      const cycle = time * 1.35 + (index % 2) * Math.PI + Math.floor(index / 2) * .55;
      const kick = Math.sin(cycle);
      if (leg.upper && leg.upperRest) {
        this.swimEuler.set(strength * kick * .23, 0,
          strength * (index % 2 ? 1 : -1) * (.06 + Math.cos(cycle) * .09));
        this.swimTilt.setFromEuler(this.swimEuler);
        leg.upper.quaternion.copy(leg.upperRest).multiply(this.swimTilt);
      }
      if (leg.lower && leg.lowerRest) {
        this.swimTilt.setFromAxisAngle(X_AXIS, strength * (.1 - kick * .3));
        leg.lower.quaternion.copy(leg.lowerRest).multiply(this.swimTilt);
      }
      if (leg.foot && leg.footRest) {
        this.swimTilt.setFromAxisAngle(X_AXIS, strength * Math.sin(cycle - .5) * .15);
        leg.foot.quaternion.copy(leg.footRest).multiply(this.swimTilt);
      }
    }
  }

  animateEchoWalking(phase) {
    if (this.swimBody && this.bodyRest) {
      this.swimEuler.set(.018 * Math.sin(phase), 0, .025 * Math.sin(phase));
      this.swimTilt.setFromEuler(this.swimEuler);
      this.swimBody.quaternion.copy(this.bodyRest).multiply(this.swimTilt);
      if (this.bodyRestPosition) {
        this.swimBody.position.copy(this.bodyRestPosition);
        this.swimBody.position.y += .018 * (1 + Math.cos(phase * 2));
      }
    }
    this.legRest.forEach((leg, index) => {
      // Diagonal legs alternate. Each foot moves quickly through the air,
      // then spends longer planted while the body passes over it.
      const cycle = ((phase + (index === 0 || index === 3 ? 0 : Math.PI))
        % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const progress = cycle / (Math.PI * 2);
      const swing = progress < .38;
      const swingProgress = swing ? progress / .38 : 0;
      const lift = swing ? Math.sin(Math.PI * swingProgress) : 0;
      const pitch = swing
        ? -.38 + .76 * smooth(swingProgress)
        : .38 - .76 * ((progress - .38) / .62);
      const side = index % 2 ? 1 : -1;
      if (leg.upper && leg.upperRest) {
        this.swimEuler.set(pitch, 0, side * (.09 + lift * .18));
        this.swimTilt.setFromEuler(this.swimEuler);
        leg.upper.quaternion.copy(leg.upperRest).multiply(this.swimTilt);
      }
      if (leg.lower && leg.lowerRest) {
        this.swimTilt.setFromAxisAngle(X_AXIS, .04 + lift * .5);
        leg.lower.quaternion.copy(leg.lowerRest).multiply(this.swimTilt);
      }
      if (leg.foot && leg.footRest) {
        this.swimTilt.setFromAxisAngle(X_AXIS, -pitch * .42 - lift * .24);
        leg.foot.quaternion.copy(leg.footRest).multiply(this.swimTilt);
      }
    });
  }

  dispose() {
    this.root.removeFromParent();
    this.scene.background = this.oldBackground;
    this.scene.fog = this.oldFog;
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    this.root.traverse((object) => {
      if (object === this.echoTraveler || this.echoTraveler?.getObjectById(object.id)) return;
      if (object.geometry?.dispose) geometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (!material?.dispose) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of [...textures, ...(this.terrainTextures ?? []), this.cloudTexture, this.waterNormals]) texture?.dispose();
  }
}
