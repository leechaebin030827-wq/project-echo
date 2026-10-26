import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { KOBE_CONFIG } from '../../config.js';
import { replaceEchoModel } from '../shared/EchoModel.js';
import { KobeMaterialSystem } from './KobeMaterialSystem.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ECHO_PUSH_START = 1.2;
const ECHO_HOLD_DURATION = 0.9;
const ECHO_RETURN_DURATION = 6.5;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export function sampleKobeEchoCycle(time, anchorX, farX) {
  const pushDuration = Math.abs(farX - anchorX) / KOBE_CONFIG.conveyorWorldSpeed;
  const pushEnd = ECHO_PUSH_START + pushDuration;
  const returnStart = pushEnd + ECHO_HOLD_DURATION;
  const returnEnd = returnStart + ECHO_RETURN_DURATION;
  if (time >= ECHO_PUSH_START && time < pushEnd) {
    return {
      x: THREE.MathUtils.lerp(anchorX, farX, (time - ECHO_PUSH_START) / pushDuration),
      walking: false,
    };
  }
  if (time >= pushEnd && time < returnStart) return { x: farX, walking: false };
  if (time >= returnStart && time < returnEnd) {
    return {
      x: THREE.MathUtils.lerp(
        farX,
        anchorX,
        smooth((time - returnStart) / ECHO_RETURN_DURATION),
      ),
      walking: true,
    };
  }
  return { x: anchorX, walking: false };
}

export class KobeWorld {
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.echo = null;
    this.echoBox = new THREE.Box3();
    this.echoCenter = new THREE.Vector3();
    this.echoSize = new THREE.Vector3();
    this.echoSphere = new THREE.Sphere();
    this.bounds = new THREE.Box3();
    this.size = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.walkableRoots = [];
    this.interactiveRegions = [];
    this.lightFixtures = [];
    this.materialSystem = new KobeMaterialSystem();
    this.elapsed = 0;
    this.echoCycleElapsed = 0;
    this.tempQuaternion = new THREE.Quaternion();
  }

  async load({ visible = true } = {}) {
    const [gltf] = await Promise.all([
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(KOBE_CONFIG.modelUrl),
      this.materialSystem.load(),
    ]);
    this.root = gltf.scene;
    this.root.name = 'KobeWorld';
    this.root.visible = visible;

    const tunnelWall = this.root.getObjectByName('Tunnel Wall')
      ?? this.root.getObjectByName('Tunnel_Wall');
    const conveyor = this.root.getObjectByName('conveyer')
      ?? this.root.getObjectByName('conveyor');
    if (!tunnelWall || !conveyor) throw new Error('Kobe tunnel wall or conveyor is missing.');
    tunnelWall.material = this.materialSystem.create('tunnel');
    conveyor.material = this.materialSystem.create('conveyor');
    tunnelWall.receiveShadow = true;
    conveyor.receiveShadow = true;
    conveyor.userData.ignoreNavigation = true;
    this.walkableRoots = [conveyor];

    this.root.traverse((object) => {
      if (!object.isMesh || object === tunnelWall || object === conveyor) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const materials = (Array.isArray(object.material) ? object.material : [object.material])
        .map((source) => {
          if (!/^Light(?:\.|$)/i.test(source?.name ?? '')) return source;
          const material = source.clone();
          material.color.set('#fff8db');
          material.emissive.set('#ffd58a');
          material.emissiveIntensity = 4.8;
          material.toneMapped = false;
          material.roughness = 0.22;
          material.metalness = 0;
          return material;
        });
      object.material = Array.isArray(object.material) ? materials : materials[0];
      const lightMaterials = materials.filter((material) => /^Light(?:\.|$)/i.test(material?.name ?? ''));
      if (lightMaterials.length) {
        this.lightFixtures.push({ object, materials: lightMaterials, pointLight: null });
      }
    });

    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    const echoAxis = this.root.getObjectByName('Project Echo')
      ?? this.root.getObjectByName('Project_Echo');
    if (!echoAxis) throw new Error('Kobe Project Echo axis is missing.');
    this.echo = await replaceEchoModel(echoAxis);
    this.echoAnchor = this.echo.position.clone();
    this.echoAnchor.y += KOBE_CONFIG.echoVerticalOffset;
    this.echo.position.y = this.echoAnchor.y;
    this.echoFarX = this.echoAnchor.x - KOBE_CONFIG.echoTravelDistance;
    this.setupEchoWalkPose();

    this.echo.updateMatrixWorld(true);
    this.echoBox.setFromObject(this.echo);
    this.echoBox.getCenter(this.echoCenter);
    this.echoBox.getSize(this.echoSize);
    this.echoBox.getBoundingSphere(this.echoSphere);
    this.axisCenter = this.echoCenter.clone();
    this.bounds.setFromObject(this.root);
    this.bounds.getSize(this.size);
    this.bounds.getCenter(this.center);
    this.navigationBounds = new THREE.Box3(
      new THREE.Vector3(this.bounds.min.x, 0.55, -1.05),
      new THREE.Vector3(this.bounds.max.x, 1.3, 1.05),
    );
    this.characterRoutes = [Array.from({ length: 32 }, (_, index) => {
      const angle = index / 32 * Math.PI * 2;
      return new THREE.Vector3(-19 + Math.cos(angle) * 12, 0.82, Math.sin(angle) * 0.42);
    })];
    this.cameraPosition = this.axisCenter.clone().add(new THREE.Vector3(
      KOBE_CONFIG.cameraDistanceFromAxis, 0.56, 0,
    ));
    this.cameraTarget = this.axisCenter.clone().add(new THREE.Vector3(-1.65, 0.08, 0));
    return this;
  }

  setupEchoWalkPose() {
    this.echoBody = this.echo.getObjectByName('Body');
    this.echoBodyRest = this.echoBody?.position.clone();
    this.echoLegs = Array.from({ length: 4 }, (_, index) => {
      const id = String(index + 1).padStart(2, '0');
      const upper = this.echo.getObjectByName(`Leg_${id}_Upper`);
      const lower = this.echo.getObjectByName(`Leg_${id}_Lower`);
      const foot = this.echo.getObjectByName(`Leg_${id}_Foot`);
      return {
        upper, lower, foot,
        upperRest: upper?.quaternion.clone(),
        lowerRest: lower?.quaternion.clone(),
        footRest: foot?.quaternion.clone(),
      };
    }).filter((leg) => leg.upper && leg.lower && leg.foot);
  }

  addLighting() {
    const ambient = new THREE.AmbientLight('#929da8', 0.29);
    const tunnelFill = new THREE.HemisphereLight('#c5cfd7', '#292d32', 0.58);
    const echoFill = new THREE.PointLight('#f3c5ad', 0.9, 8, 2);
    echoFill.position.copy(this.axisCenter).add(new THREE.Vector3(1.3, 1.1, 0.7));
    const interiorFills = [5.5, 12, 18.5].map((distance, index) => {
      const light = new THREE.PointLight(index % 2 ? '#b7c8d8' : '#d8c3a5', 0.62, 12, 1.65);
      light.position.copy(this.axisCenter).add(new THREE.Vector3(-distance, 2.1, index % 2 ? -0.45 : 0.45));
      return light;
    });
    this.deepLightGeometry = new THREE.SphereGeometry(0.065, 10, 8);
    this.deepLightMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd59a',
      toneMapped: false,
    });
    this.deepTunnelLights = new THREE.Group();
    this.deepTunnelLights.name = 'KobeDeepTunnelLights';
    [7.5, 11.5, 15.5, 19.5].forEach((distance, row) => {
      [-1, 1].forEach((side) => {
        const bulb = new THREE.Mesh(this.deepLightGeometry, this.deepLightMaterial);
        bulb.position.copy(this.axisCenter).add(new THREE.Vector3(
          -distance,
          1.45 + (row % 2) * 0.16,
          side * 1.28,
        ));
        const glow = new THREE.PointLight('#ffc982', 0.72, 5.6, 1.8);
        glow.position.copy(bulb.position);
        this.deepTunnelLights.add(bulb, glow);
      });
    });
    this.scene.add(ambient, tunnelFill, echoFill, ...interiorFills, this.deepTunnelLights);

    const pointLights = [];
    const step = Math.max(1, Math.floor(this.lightFixtures.length / 7));
    this.lightFixtures.forEach((fixture, index) => {
      fixture.mode = index % 13 === 0 ? 'off' : index % 7 === 0 ? 'long' : 'flicker';
      fixture.phase = index * 1.713;
      fixture.period = 16 + (index % 5) * 4.7;
      if (index % step || pointLights.length >= 7) return;
      const point = new THREE.PointLight('#ffd79a', 2.5, 4.8, 2);
      point.position.copy(fixture.object.getWorldPosition(new THREE.Vector3()));
      this.scene.add(point);
      fixture.pointLight = point;
      pointLights.push(point);
    });
    this.lights = [
      ambient,
      tunnelFill,
      echoFill,
      ...interiorFills,
      this.deepTunnelLights,
      ...pointLights,
    ];
    this.updateLights(0);
  }

  updateEcho(delta) {
    const duration = KOBE_CONFIG.echoCycleDuration;
    this.echoCycleElapsed = (this.echoCycleElapsed + delta) % duration;
    const time = this.echoCycleElapsed;
    const { x, walking } = sampleKobeEchoCycle(time, this.echoAnchor.x, this.echoFarX);
    this.echo.position.x = x;
    this.echo.position.y = this.echoAnchor.y;

    const pushDuration = KOBE_CONFIG.echoTravelDistance / KOBE_CONFIG.conveyorWorldSpeed;
    const pushEnd = ECHO_PUSH_START + pushDuration;
    const returnStart = pushEnd + ECHO_HOLD_DURATION;
    const phase = (time - returnStart) * 5.4;
    this.echoLegs.forEach((leg, index) => {
      const offset = index === 0 || index === 3 ? 0 : Math.PI;
      const swing = walking ? Math.sin(phase + offset) : 0;
      const lift = walking ? Math.max(0, Math.sin(phase + offset)) : 0;
      leg.upper.quaternion.copy(leg.upperRest).multiply(
        this.tempQuaternion.setFromAxisAngle(Z_AXIS, swing * 0.28),
      );
      leg.lower.quaternion.copy(leg.lowerRest).multiply(
        this.tempQuaternion.setFromAxisAngle(Z_AXIS, -swing * 0.2 + lift * 0.12),
      );
      leg.foot.quaternion.copy(leg.footRest).multiply(
        this.tempQuaternion.setFromAxisAngle(Z_AXIS, -swing * 0.08),
      );
    });
    if (this.echoBody && this.echoBodyRest) {
      this.echoBody.position.copy(this.echoBodyRest);
      if (walking) this.echoBody.position.y += Math.abs(Math.sin(phase)) * 0.035;
      else if (time >= ECHO_PUSH_START && time < pushEnd) {
        const progress = THREE.MathUtils.clamp((time - ECHO_PUSH_START) / pushDuration, 0, 1);
        this.echoBody.position.y -= Math.sin(Math.PI * progress) * 0.04;
      }
    }
  }

  updateLights(delta) {
    this.elapsed += delta;
    for (const fixture of this.lightFixtures) {
      let brightness = 1;
      if (fixture.mode === 'off') brightness = 0;
      else if (fixture.mode === 'long') {
        const cycle = (this.elapsed + fixture.phase) % fixture.period;
        brightness = cycle < fixture.period * 0.7 ? 0.88 : 0.015;
      } else {
        const slow = 0.9 + Math.sin(this.elapsed * 1.9 + fixture.phase) * 0.08;
        const quick = Math.sin(this.elapsed * 17.0 + fixture.phase * 2.3) > 0.94 ? 0.35 : 1;
        brightness = slow * quick;
      }
      fixture.materials.forEach((material) => {
        material.emissiveIntensity = 4.8 * brightness;
      });
      if (fixture.pointLight) fixture.pointLight.intensity = 2.5 * brightness;
    }
  }

  update(delta) {
    this.materialSystem.update(delta);
    this.updateEcho(delta);
    this.updateLights(delta);
  }

  updateFixtureLights() {}

  detach() {
    this.root?.removeFromParent();
    this.lights?.forEach((light) => light.removeFromParent());
  }

  dispose() {
    const materials = new Set();
    this.root?.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (material) materials.add(material);
      }
    });
    materials.forEach((material) => material.dispose());
    this.deepLightGeometry?.dispose();
    this.deepLightMaterial?.dispose();
    this.materialSystem.dispose();
    this.detach();
  }
}
