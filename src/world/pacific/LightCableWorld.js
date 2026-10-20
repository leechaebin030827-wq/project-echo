import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createCloudTexture } from '../shared/SkyDetail.js';
import {
  CABLE_GAP_METERS, CABLE_START_X, CABLE_WINDOW_COUNT,
  cablePoint, cableTangent, cableSpacing, cableWindowStart, cableSegmentMatrix,
} from './EndlessCablePath.js';
import { CABLE_EXIT_DURATION, getCableExitMotion } from './CableExitMotion.js';
import { createSeabedGeometry, seabedHeight, SEABED_RECENTER_DISTANCE } from './SeabedSurface.js';
import { createGlassCableModule } from './GlassCableModule.js';

const MODEL_URL = '/models/LightCable.runtime.glb';
const DETRITUS_URL = '/textures/lightcable/';
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DIVE_START = 11.8;
const DIVE_END = 19.4;
const CAMERA_START = DIVE_END;
const TRAVEL_SPEED = 2.8;
const ORIGIN_REBASE_DISTANCE = 1200;

const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

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
  if (hour < 5 || hour >= 20) return { zenith: '#263a50', horizon: '#597687', water: '#102b3d', cloud: '#8a9aa7', sun: '#bacbd1', daylight: .16, hour };
  if (hour < 7) return { zenith: '#58738e', horizon: '#c29f98', water: '#194252', cloud: '#d7b8ae', sun: '#ffcfac', daylight: .48, hour };
  if (hour < 17) return { zenith: '#388eb8', horizon: '#c3d6d4', water: '#173f50', cloud: '#eef0e9', sun: '#fff0c9', daylight: .9, hour };
  return { zenith: '#657d98', horizon: '#c9a4a0', water: '#193848', cloud: '#d6bdb7', sun: '#ffd4ad', daylight: .46, hour };
}

function instancedGeometry(source, count, material) {
  const result = new THREE.InstancedMesh(source.geometry, material, count);
  result.frustumCulled = true;
  result.castShadow = false;
  result.receiveShadow = true;
  return result;
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
    this.underwaterFog = new THREE.FogExp2('#071a30', .007);
    this.underwaterColor = new THREE.Color('#071a30');
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
    this.echoFacing = new THREE.Quaternion();
    this.swimTilt = new THREE.Quaternion();
    this.swimEuler = new THREE.Euler();
    this.bodyRest = null;
    this.legRest = [];
  }

  async load(echoSource) {
    const loader = new THREE.TextureLoader();
    const [gltf, base, normal, roughness, height] = await Promise.all([
      new GLTFLoader().loadAsync(MODEL_URL),
      loader.loadAsync(`${DETRITUS_URL}base.jpg`),
      loader.loadAsync(`${DETRITUS_URL}normal.jpg`),
      loader.loadAsync(`${DETRITUS_URL}roughness.jpg`),
      loader.loadAsync(`${DETRITUS_URL}height.jpg`),
    ]);
    for (const texture of [base, normal, roughness, height]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(15, 5);
      texture.anisotropy = 4;
    }
    base.colorSpace = THREE.SRGBColorSpace;
    this.terrainTextures = [base, normal, roughness, height];
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: '#486a7d', map: base, normalMap: normal, roughnessMap: roughness,
      bumpMap: height, bumpScale: 0.11, roughness: 1, metalness: 0,
      emissive: '#0b3447', emissiveIntensity: .09,
    });

    this.palette = pacificLight();
    this.makeSurface();
    this.makeSeabed(gltf.scene.getObjectByName('SeaBottom'));
    this.makeCable();
    this.makePlants(gltf.scene);
    this.makeFish(gltf.scene);
    this.makePlankton();
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
        fragmentShader: `uniform vec3 zenith,horizon,cloudColor,sunColor,sunDirection;
          uniform sampler2D cloudMap; uniform float cloudDrift,daylight;
          varying vec3 vDirection;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          void main(){
            vec3 direction=normalize(vDirection);
            float altitude=smoothstep(-.12,.75,direction.y);
            vec3 color=mix(horizon,zenith,altitude);
            float sunDot=dot(direction,sunDirection);
            float halo=pow(max(sunDot,0.),24.)*.16*daylight;
            float disk=smoothstep(.99925,.99978,sunDot)*daylight;
            color+=sunColor*(halo+disk*1.7);
            vec2 cloudUv=vec2(atan(direction.z,direction.x)/6.283185+.5+cloudDrift,
              asin(clamp(direction.y,-1.,1.))/3.141593+.5);
            vec4 cloud=texture2D(cloudMap,cloudUv);
            float coverage=smoothstep(.14,.69,cloud.r)*smoothstep(-.04,.14,direction.y);
            float rim=.68+.32*max(dot(direction,sunDirection),0.);
            color=mix(color,cloudColor*rim+sunColor*halo*.35,coverage*.75);
            vec2 starCell=floor(cloudUv*vec2(520.,220.));
            float star=step(.9989,hash(starCell))*pow(max(0.,1.-length(fract(cloudUv*vec2(520.,220.))-.5)*2.),3.);
            color+=vec3(.75,.85,1.)*star*(1.-daylight)*smoothstep(.02,.2,direction.y);
            gl_FragColor=vec4(color,1.);
          }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.root.add(this.sky);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900, 96, 96),
      new THREE.ShaderMaterial({
        side: THREE.FrontSide,
        uniforms: {
          time: { value: 0 },
          waterColor: { value: new THREE.Color(this.palette.water) },
          horizonColor: { value: new THREE.Color(this.palette.horizon) },
          zenithColor: { value: new THREE.Color(this.palette.zenith) },
          sunColor: { value: new THREE.Color(this.palette.sun) },
          sunDirection: { value: this.sunDirection },
          daylight: { value: this.palette.daylight },
        },
        vertexShader: `uniform float time; varying vec3 vWorld;
          void main(){
            vec3 p=position;
            p.z+=.12*sin(p.x*.042+time*.34)*sin(p.y*.054-time*.27);
            p.z+=.045*sin(p.x*.11-p.y*.075+time*.48);
            vec4 world=modelMatrix*vec4(p,1.); vWorld=world.xyz;
            gl_Position=projectionMatrix*viewMatrix*world;
          }`,
        fragmentShader: `uniform vec3 waterColor,horizonColor,zenithColor,sunColor,sunDirection;
          uniform float time,daylight; varying vec3 vWorld;
          void main(){
            vec2 p=vWorld.xz;
            float a=p.x*.14+p.y*.08+time*.56;
            float b=p.x*.095-p.y*.16-time*.46;
            float c=p.x*.68+p.y*.31+time*1.16;
            float d=p.x*1.36-p.y*.62-time*1.48;
            vec2 slope=vec2(
              cos(a)*.037+cos(b)*.027+cos(c)*.021+cos(d)*.010,
              cos(a)*.023-cos(b)*.039+cos(c)*.010-cos(d)*.014);
            vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
            vec3 view=normalize(cameraPosition-vWorld);
            float fresnel=pow(1.-max(dot(view,normal),0.),4.);
            vec3 reflected=reflect(-view,normal);
            vec3 sky=mix(horizonColor,zenithColor,smoothstep(0.,.65,reflected.y));
            vec3 sparkleDirection=normalize(vec3(sunDirection.x*.55,
              max(.25,sunDirection.y),-.72));
            float reflectedSun=max(dot(reflected,sparkleDirection),0.);
            float ripple=.5+.25*sin(c)+.18*sin(d)+.07*sin(a*5.+b*3.);
            float smallCrests=smoothstep(.69,.88,ripple);
            float brokenGlints=.35+.65*smoothstep(.43,.86,
              .5+.28*sin(c*2.3)+.22*sin(d*1.7+a));
            float illumination=max(daylight,.13);
            float glitterPath=pow(reflectedSun,18.)*.25
              +pow(reflectedSun,72.)*(.8+1.3*brokenGlints);
            float fine=.5+.5*sin(c*.7+sin(d*.5));
            vec3 color=mix(waterColor*(.86+.14*fine),sky,fresnel*.38+.045);
            color+=sunColor*(glitterPath*illumination
              +smallCrests*(.018+.04*reflectedSun)*illumination);
            gl_FragColor=vec4(color,1.);
          }`,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.frustumCulled = false;
    this.root.add(this.water);
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
    if (import.meta.env.DEV) console.info('[LightCable] procedural four-sided glass corridor', {
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
      const placements = Array.from({ length: count }, (_, index) => ({
        distance: -35 + ((index + this.random()) / count) * 245,
        side: (index % 2 ? 1 : -1) * (5 + this.random() * 16),
        altitude: .05 + this.random() * .25,
        rotation: this.random() * Math.PI * 2,
        scale: 12 + this.random() * 13,
      }));
      this.plants.push({ instances, placements });
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
      const count = 4;
      const material = fish.material.clone();
      material.side = THREE.DoubleSide;
      material.emissive = new THREE.Color('#3e8eaa');
      material.emissiveIntensity = .34;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.swimTime = { value: 0 };
        shader.vertexShader = `uniform float swimTime;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float tail = smoothstep(-0.03, 0.1, position.z);
          transformed.x += sin(swimTime * 2.2 + position.z * 23.0
            + instanceMatrix[3].x * 0.31) * 0.008 * tail;`,
        );
        material.userData.swimShader = shader;
      };
      material.customProgramCacheKey = () => 'lightcable-fish-swim-v1';
      const instances = instancedGeometry(fish, count, material);
      // Their transforms travel across the whole route after the initial
      // bounds are computed; these low-poly schools stay cheap to render.
      instances.frustumCulled = false;
      const swimmers = Array.from({ length: count }, () => ({
        distance: -40 + this.random() * 240,
        side: (this.random() < .5 ? -1 : 1) * (4.5 + this.random() * 7.5),
        altitude: -2.5 + this.random() * 5,
        speed: (.55 + this.random() * 1.1) * (this.random() < .5 ? -1 : 1),
        phase: this.random() * Math.PI * 2,
        scale: 9 + this.random() * 10,
      }));
      this.fish.push({ instances, swimmers });
      this.root.add(instances);
    }
    this.updateFish(0);
    for (const { instances } of this.fish) instances.computeBoundingSphere();
  }

  updateFish(delta) {
    for (const { instances, swimmers } of this.fish) {
      if (instances.material.userData.swimShader) {
        instances.material.userData.swimShader.uniforms.swimTime.value = this.elapsed;
      }
      swimmers.forEach((swimmer, index) => {
        swimmer.distance += swimmer.speed * delta;
        if (swimmer.distance < this.travelDistance - 55) swimmer.distance += 250;
        if (swimmer.distance > this.travelDistance + 210) swimmer.distance -= 250;
        cablePoint(swimmer.distance, this.originDistance, this.point);
        cableTangent(swimmer.distance, this.tangent);
        const sign = Math.sign(swimmer.speed);
        this.dummy.position.copy(this.point);
        this.dummy.position.x -= this.tangent.z * swimmer.side;
        this.dummy.position.z += this.tangent.x * swimmer.side;
        this.dummy.position.y = this.point.y + swimmer.altitude
          + Math.sin(this.elapsed * .9 + swimmer.phase) * .25;
        this.swimDirection.copy(this.tangent).multiplyScalar(sign);
        this.dummy.quaternion.setFromUnitVectors(Z_AXIS, this.swimDirection);
        this.dummy.rotateZ(Math.sin(this.elapsed * 1.2 + swimmer.phase) * .13);
        this.dummy.scale.setScalar(swimmer.scale);
        this.dummy.updateMatrix();
        instances.setMatrixAt(index, this.dummy.matrix);
      });
      instances.instanceMatrix.needsUpdate = true;
    }
  }

  makePlankton() {
    const count = 2700;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const insideCable = index < count * .42;
      const spread = insideCable ? 5.2 : 45;
      positions[index * 3] = -70 + this.random() * 250;
      positions[index * 3 + 1] = insideCable
        ? -47.8 + (this.random() - .5) * 3.4
        : -53 + this.random() * 19;
      positions[index * 3 + 2] = (this.random() - .5) * spread;
      phases[index] = this.random() * 6.283;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.planktonMaterial = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: `attribute float phase; uniform float time; varying float vGlow; varying float vHue;
        void main(){ vec3 p=position;
          p.x+=sin(time*.24+phase)*.22; p.y+=sin(time*.41+phase*2.)*.18;
          vec4 eye=modelViewMatrix*vec4(p,1.);
          gl_PointSize=clamp(71./max(1.,-eye.z),3.,13.);
          gl_Position=projectionMatrix*eye;
          vGlow=.68+.32*sin(time*.8+phase);
          vHue=sin(phase*2.3)*.5+.5; }`,
      fragmentShader: `varying float vGlow; varying float vHue;
        void main(){ float r=length(gl_PointCoord-.5);
          float halo=pow(smoothstep(.5,.04,r),1.6);
          float core=pow(smoothstep(.19,0.,r),1.3);
          vec3 color=mix(vec3(.18,.65,1.),vec3(.45,1.,.89),vHue);
          gl_FragColor=vec4(color*(halo*.42+core*1.45)*vGlow,
            (halo*.38+core*.83)*vGlow); }`,
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
    this.cameraLamp = new THREE.PointLight('#75c1d9', 1.35, 24, 1.7);
    this.echoLamp = new THREE.PointLight('#a5d8eb', 1.05, 18, 1.7);
    this.planktonLamp = new THREE.PointLight('#35aace', .85, 13, 2);
    this.root.add(this.cameraLamp, this.echoLamp, this.planktonLamp);
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
    this.swimBody = echo.getObjectByName('Body');
    this.bodyRest = this.swimBody?.quaternion.clone() ?? null;
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
    this.elapsed = 0;
    this.travelDistance = 0;
    this.originDistance = 0;
    this.exitSuction = null;
    this.travelBias = 0;
    this.pointerLook = 0;
    this.pointerLookTarget = 0;
    this.updateCableWindow(0, true);
    this.updatePlants(true);
    this.updateFish(0);
    this.floorCell = null;
    this.updateSeabed(CABLE_START_X);
    this.phase = 'surface';
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
    this.update(0);
  }

  startExitSuction() {
    if (this.phase !== 'cable' || this.exitSuction) return CABLE_EXIT_DURATION;
    this.pointerLookTarget = 0;
    this.exitSuction = { startedAt: this.elapsed, duration: CABLE_EXIT_DURATION };
    return CABLE_EXIT_DURATION;
  }

  setPointerLook(normalizedX) {
    if (this.phase !== 'cable' || this.exitSuction) return;
    this.pointerLookTarget = THREE.MathUtils.clamp(normalizedX, -1, 1);
  }

  clearPointerLook() {
    this.pointerLookTarget = 0;
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
      this.echoTraveler.scale.setScalar(1);
    }
  }

  update(delta) {
    this.elapsed += Math.min(delta, .1);
    this.water.material.uniforms.time.value = this.elapsed;
    this.sky.material.uniforms.cloudDrift.value = this.elapsed * .000055;
    this.planktonMaterial.uniforms.time.value = this.elapsed;
    const time = this.elapsed;
    if (time < DIVE_START) {
      this.phase = 'surface';
      this.sky.visible = true;
      this.water.visible = true;
      this.plankton.visible = false;
      this.sunLight.intensity = this.palette.daylight * 1.1;
      this.cameraLamp.intensity = 0;
      this.echoLamp.intensity = 0;
      this.planktonLamp.intensity = 0;
      this.camera.position.set(0, 5.7, 19);
      this.camera.lookAt(0, 0, -60);
      return;
    }
    if (time < DIVE_END) {
      this.phase = 'descent';
      const progress = smooth((time - DIVE_START) / (DIVE_END - DIVE_START));
      this.camera.position.set(
        THREE.MathUtils.lerp(0, -102, progress),
        THREE.MathUtils.lerp(5.7, -47.8, progress),
        THREE.MathUtils.lerp(19, 3, progress),
      );
      const submerged = this.camera.position.y < -.25;
      const depthMix = smooth((Math.max(0, -this.camera.position.y) - .25) / 34);
      this.sky.visible = !submerged;
      this.water.visible = !submerged;
      this.plankton.visible = submerged;
      this.surfaceColor.set(this.palette.horizon);
      this.scene.background.lerpColors(this.surfaceColor, this.underwaterColor, depthMix);
      if (submerged) {
        this.underwaterFog.density = THREE.MathUtils.lerp(.002, .007, depthMix);
        this.underwaterFog.color.copy(this.scene.background);
        this.scene.fog = this.underwaterFog;
      } else this.scene.fog = null;
      this.sunLight.intensity = this.palette.daylight * 1.1 * (1 - depthMix);
      this.cameraLamp.intensity = depthMix * 1.35;
      this.cameraLamp.position.copy(this.camera.position);
      this.echoLamp.intensity = depthMix * 1.05;
      cablePoint(6.4, this.originDistance, this.echoLamp.position);
      this.planktonLamp.intensity = depthMix * .85;
      this.planktonLamp.position.copy(this.camera.position);
      this.planktonLamp.position.x += 4;
      this.planktonLamp.position.y += 1.2;
      this.planktonLamp.position.z -= 2;
      const target = cablePoint(7.2, this.originDistance, this.lookTarget);
      this.camera.lookAt(
        THREE.MathUtils.lerp(0, target.x, progress),
        THREE.MathUtils.lerp(-2, target.y, progress),
        THREE.MathUtils.lerp(-10, target.z, progress),
      );
      this.updateFish(delta);
      return;
    }
    this.phase = 'cable';
    this.sky.visible = false;
    this.water.visible = false;
    this.plankton.visible = true;
    this.scene.background.copy(this.underwaterColor);
    this.underwaterFog.color.copy(this.underwaterColor);
    this.underwaterFog.density = .007;
    if (!this.scene.fog) this.scene.fog = this.underwaterFog;
    this.sunLight.intensity = .07;
    const exitMotion = this.exitSuction
      ? getCableExitMotion((time - this.exitSuction.startedAt) / this.exitSuction.duration)
      : null;
    const travel = Math.max(0, (time - CAMERA_START) * TRAVEL_SPEED + this.travelBias
      + (exitMotion?.cameraBoost ?? 0));
    this.travelDistance = travel;
    const nextOrigin = Math.floor(travel / ORIGIN_REBASE_DISTANCE) * ORIGIN_REBASE_DISTANCE;
    const rebased = nextOrigin !== this.originDistance;
    this.originDistance = nextOrigin;
    this.updateCableWindow(travel, rebased);
    this.updatePlants(rebased);
    cablePoint(travel, this.originDistance, this.camera.position);
    this.updateSeabed(this.camera.position.x);
    this.camera.position.y += .1 + Math.sin(time * .8) * .07;
    this.cameraLamp.position.copy(this.camera.position);
    this.cameraLamp.intensity = 1.35;
    this.planktonLamp.position.copy(this.camera.position);
    this.planktonLamp.position.x += 4;
    this.planktonLamp.position.y += 1.2;
    this.planktonLamp.position.z -= 2;
    this.planktonLamp.intensity = .85;
    const echoDistance = travel + (exitMotion?.echoLead ?? 6.4);
    cablePoint(echoDistance, this.originDistance, this.lookTarget);
    this.lookTarget.y += .1;
    this.pointerLook = THREE.MathUtils.damp(this.pointerLook,
      this.exitSuction ? 0 : this.pointerLookTarget, 4.2, delta);
    cableTangent(travel + 6.4, this.tangent);
    this.gazeTarget.copy(this.lookTarget);
    this.gazeTarget.x -= this.tangent.z * this.pointerLook * 5.8;
    this.gazeTarget.z += this.tangent.x * this.pointerLook * 5.8;
    this.camera.lookAt(this.gazeTarget);
    if (this.echoTraveler) {
      this.echoTraveler.visible = exitMotion?.echoVisible ?? true;
      this.echoTraveler.scale.setScalar(exitMotion?.echoScale ?? 1);
      this.echoTraveler.position.copy(this.lookTarget);
      this.echoTraveler.position.y += Math.sin(time * 1.05) * .14;
      cableTangent(echoDistance, this.tangent);
      this.echoFacing.setFromUnitVectors(Z_AXIS, this.tangent);
      this.swimTilt.setFromAxisAngle(Z_AXIS, Math.sin(time * .82) * .075);
      this.echoTraveler.quaternion.copy(this.echoFacing).multiply(this.swimTilt);
      this.animateEchoSwimming(time);
      this.echoLamp.position.copy(this.echoTraveler.position);
      this.echoLamp.intensity = 1.05;
    }
    if (exitMotion && Math.abs(this.camera.fov - exitMotion.fov) > .01) {
      this.camera.fov = exitMotion.fov;
      this.camera.updateProjectionMatrix();
    }
    this.plankton.position.x = this.camera.position.x;
    this.plankton.position.z = this.camera.position.z;
    this.updateFish(delta);
  }

  animateEchoSwimming(time) {
    if (this.swimBody && this.bodyRest) {
      this.swimEuler.set(
        .055 + Math.sin(time * .74) * .035,
        Math.sin(time * .52) * .035,
        Math.sin(time * .91) * .055,
      );
      this.swimTilt.setFromEuler(this.swimEuler);
      this.swimBody.quaternion.copy(this.bodyRest).multiply(this.swimTilt);
    }
    for (let index = 0; index < this.legRest.length; index += 1) {
      const leg = this.legRest[index];
      const cycle = time * 1.35 + (index % 2) * Math.PI + Math.floor(index / 2) * .55;
      const kick = Math.sin(cycle);
      if (leg.upper && leg.upperRest) {
        this.swimEuler.set(kick * .23, 0,
          (index % 2 ? 1 : -1) * (.06 + Math.cos(cycle) * .09));
        this.swimTilt.setFromEuler(this.swimEuler);
        leg.upper.quaternion.copy(leg.upperRest).multiply(this.swimTilt);
      }
      if (leg.lower && leg.lowerRest) {
        this.swimTilt.setFromAxisAngle(X_AXIS, .1 - kick * .3);
        leg.lower.quaternion.copy(leg.lowerRest).multiply(this.swimTilt);
      }
      if (leg.foot && leg.footRest) {
        this.swimTilt.setFromAxisAngle(X_AXIS, Math.sin(cycle - .5) * .15);
        leg.foot.quaternion.copy(leg.footRest).multiply(this.swimTilt);
      }
    }
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
    for (const texture of [...textures, ...(this.terrainTextures ?? []), this.cloudTexture]) texture?.dispose();
  }
}
