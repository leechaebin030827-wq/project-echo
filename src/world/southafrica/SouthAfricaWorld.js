import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { replaceEchoModel } from '../shared/EchoModel.js';
import { getLocalSkyHour, getSkyVisibility } from '../shared/SkyDetail.js';
import { createSouthAfricaGround } from './SouthAfricaGround.js';
import { createSouthAfricaKit } from './SouthAfricaKit.js';
import { CT2_DISTRICT_LAMPS, CT2_SITE_LAYOUT } from './SouthAfricaSiteLayout.js';

export class SouthAfricaWorld {
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
    this.lights = null;
  }

  async load({ visible = true } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'SouthAfricaWorld';
    this.root.userData.disableVertexSnap = true;
    this.root.visible = visible;

    const site = createSouthAfricaGround(this.root);
    this.ground = site.earth;
    this.walkableRoots = [site.walkable];
    this.grass = site.grass;
    this.siteTextures = site.textures;
    this.lampHeads = site.heads;
    this.districtLampHeads = this.root.getObjectByName('CT2DistrictLampHeads');

    const echoMount = new THREE.Group();
    echoMount.name = 'echo';
    echoMount.scale.setScalar(4);
    this.root.add(echoMount);
    const [echo, buildingGltf, plantGltf, securityGltf] = await Promise.all([
      replaceEchoModel(echoMount),
      new GLTFLoader().loadAsync(CT2_SITE_LAYOUT.building.url),
      new GLTFLoader().loadAsync('/models/southafrica/plant_5.runtime.glb'),
      new GLTFLoader().loadAsync('/models/southafrica/security_5.lite.glb'),
    ]);
    this.echo = echo;
    this.siteAssets = createSouthAfricaKit(plantGltf, securityGltf);
    this.root.add(this.siteAssets);
    this.dataCenter = buildingGltf.scene;
    this.dataCenter.name = 'CT2DataCenter';
    this.dataCenter.position.fromArray(CT2_SITE_LAYOUT.building.position);
    this.dataCenter.scale.setScalar(CT2_SITE_LAYOUT.building.scale);
    this.dataCenter.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (!material?.isMeshStandardMaterial) continue;
        material.metalness = .06;
        material.roughness = .88;
        if (material.normalScale) material.normalScale.set(.35, .35);
      }
    });
    this.root.add(this.dataCenter);
    this.dataCenter.updateMatrixWorld(true);
    const buildingBox = new THREE.Box3().setFromObject(this.dataCenter);
    this.dataCenter.position.y -= buildingBox.min.y;
    this.echo.updateMatrixWorld(true);
    this.echoBox.setFromObject(this.echo);
    this.echo.position.y -= this.echoBox.min.y;
    this.echo.updateMatrixWorld(true);
    this.echoBox.setFromObject(this.echo);
    this.echoBox.getCenter(this.echoCenter);
    this.echoBox.getSize(this.echoSize);
    this.echoBox.getBoundingSphere(this.echoSphere);

    this.bounds.set(new THREE.Vector3(-95, 0, -150),
      new THREE.Vector3(95, Math.max(22, this.echoBox.max.y), 70));
    this.bounds.getSize(this.size);
    this.bounds.getCenter(this.center);
    this.navigationBounds = new THREE.Box3(
      new THREE.Vector3(-48, -.2, -48),
      new THREE.Vector3(48, 1.2, 48),
    );
    this.characterRoutes = [Array.from({ length: 32 }, (_, index) => {
      const angle = index / 32 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 17, 0, Math.sin(angle) * 17);
    })];
    this.farOrbitScale = .8;
    this.overviewTarget = new THREE.Vector3(0, 4, -48);
    this.preferredArrivalAngle = Math.PI * .42;
    this.scene.add(this.root);
    return this;
  }

  addLighting() {
    const hemisphere = new THREE.HemisphereLight('#a9d6ef', '#6d5734', 1);
    const sun = new THREE.DirectionalLight('#ffe1ac', 2);
    sun.target.position.copy(this.echoCenter);
    const echoRim = new THREE.PointLight('#ffba82', .6, 28, 2);
    echoRim.position.copy(this.echoCenter).add(new THREE.Vector3(-5, 7, -4));
    const moonFill = new THREE.AmbientLight('#7184a4', 0);
    this.scene.add(hemisphere, sun, sun.target, echoRim, moonFill);
    this.hemisphere = hemisphere;
    this.sun = sun;
    this.echoRim = echoRim;
    this.moonFill = moonFill;
    const litFixtures = [
      ...CT2_SITE_LAYOUT.streetLamps.filter((lamp) => lamp.light).map((lamp) => ({ ...lamp, offset: 1.18, height: 6.9 })),
      ...CT2_DISTRICT_LAMPS.filter((lamp) => lamp.light).map((lamp) => ({ ...lamp, offset: 1.95, height: 7.25 })),
    ];
    this.streetLights = litFixtures.map(({ x, z, offset, height }) => {
      const light = new THREE.PointLight('#ffe5b9', 0, 34, 2);
      light.position.set(x + (x < 0 ? offset : -offset), height, z);
      this.scene.add(light);
      return light;
    });
    this.facadeLights = [-24, 24].map((x) => {
      const light = new THREE.PointLight('#fff0d0', 0, 36, 2);
      light.position.set(x, 7, -25);
      this.scene.add(light);
      return light;
    });
    this.lights = [hemisphere, sun, sun.target, echoRim, moonFill,
      ...this.streetLights, ...this.facadeLights];
    this.updateSunLighting();
  }

  updateSunLighting() {
    const { hour, solarTimes } = getLocalSkyHour('southafrica');
    const { daylight } = getSkyVisibility(hour, solarTimes);
    const dayProgress = THREE.MathUtils.clamp(
      (hour - solarTimes.sunrise) / Math.max(.1, solarTimes.sunset - solarTimes.sunrise), 0, 1,
    );
    const sunElevation = Math.max(.05, Math.sin(dayProgress * Math.PI));
    const sunAngle = THREE.MathUtils.lerp(-Math.PI * .78, Math.PI * .22, dayProgress);

    this.hemisphere.intensity = .32 + daylight * .95;
    this.sun.intensity = .08 + daylight * 2.45;
    this.sun.position.set(
      Math.cos(sunAngle) * 130,
      8 + sunElevation * 125,
      Math.sin(sunAngle) * 130,
    );
    this.echoRim.intensity = .25 + daylight * .55;
    this.moonFill.intensity = .65 * (1 - daylight);
    for (const light of this.streetLights) light.intensity = (1 - daylight) * 110;
    for (const light of this.facadeLights) light.intensity = (1 - daylight) * 105;
    this.lampHeads.material.emissiveIntensity = .55 + (1 - daylight) * 3.1;
    if (this.districtLampHeads) this.districtLampHeads.material.emissiveIntensity = .45 + (1 - daylight) * 2.8;
    this.lastLightRefresh = Date.now();
  }

  updateFixtureLights() {
    if (Date.now() - this.lastLightRefresh > 60000) this.updateSunLighting();
  }

  detach() {
    this.root?.removeFromParent();
    this.lights?.forEach((light) => light.removeFromParent());
  }

  dispose() {
    const materials = new Set();
    const textures = new Set();
    this.root?.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const texture of Object.values(this.siteTextures ?? {})) textures.add(texture);
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    this.detach();
  }
}
