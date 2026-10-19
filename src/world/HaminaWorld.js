import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HAMINA_CONFIG, HAMINA_TERRAIN_TEXTURE_CONFIG } from '../config.js';
import { replaceEchoModel } from './EchoModel.js';
import { populateHaminaForest } from './HaminaForest.js';
import {
  HAMINA_LAND_INSTANCE_SOURCE_NAMES,
  populateHaminaLandInstances,
} from './HaminaLandInstances.js';
import { createHaminaSea } from './HaminaSea.js';
import { HaminaCountdownDisplay } from './HaminaCountdownDisplay.js';
import { TerrainTextureSystem } from './TerrainTextureSystem.js';
import { FixtureLights } from './FixtureLights.js';

const HAMINA_FIXTURE_GLOW = '#ffc878';
const HAMINA_FIXTURE_LIGHT = '#ffd8a3';

const INTERACTIONS = [
  ['Data Center', 'Data_Center_Click', ['Data_Center']],
  ['Cooler', 'Cooler_Click', [
    'Cooling_Unit_A', 'Industrial_Silo_A.001', 'Industrial_Silo_A.002',
    'Industrial_Silo_A.004', 'Industrial_Silo_A.005', 'Industrial_Tank_A',
    'Industrial_Tank_A.001', 'Industrial_Tank_A.002', 'Industrial_Tank_A.003',
    'Industrial_Tank_A.004', 'Industrial_Tank_A.005', 'Metal_Platform_A.001',
    'Metal_Platform_A.002', 'Metal_Platform_A.003', 'Metal_Platform_A.004', 'Utility_Tank_A',
  ]],
  ['Forest', 'Forest_Click', []],
  ['Timer', 'Timer_Click', ['Timer']],
  ['Finland', 'Finland_Click', ['Flag', 'Flag_Bong']],
  ['Ocean', 'Ocean_Click', ['Ocean']],
];

export class HaminaWorld {
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
    this.lightFixtures = [];
    this.interactiveRegions = [];
    this.forestInstances = [];
    this.landInstances = [];
    this.forestHover = 0;
    this.forestFocus = 0;
    this.forestWindElapsed = 0;
    this.terrainTextures = new TerrainTextureSystem();
    this.navigationAnchorName = HAMINA_CONFIG.navigationAnchorName;
    this.farOrbitScale = HAMINA_CONFIG.farOrbitScale;
    this.nearOrbitScale = HAMINA_CONFIG.nearOrbitScale;
  }

  async load({ visible = true } = {}) {
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(HAMINA_CONFIG.modelUrl);
    this.root = gltf.scene;
    this.root.name = 'HaminaWorld';
    this.root.visible = visible;
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      let hasLightMaterial = false;
      for (const material of materials) {
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture) texture.anisotropy = 4;
        }
        if (/^light(?:\.|$)/i.test(material.name) && material.emissive?.isColor) {
          hasLightMaterial = true;
          // Keep every Blender Light / Light.xxx surface visibly warm. The
          // matching point lights below carry this amber tint onto the snow
          // and nearby structures instead of leaving a cold white decal.
          material.emissive.set(HAMINA_FIXTURE_GLOW);
          material.emissiveMap = material.map ?? material.emissiveMap;
          material.emissiveIntensity = 4.2;
          material.toneMapped = false;
          if (material.color?.isColor) material.color.set('#ffffff');
          if ('roughness' in material) material.roughness = 0.16;
        }
        material.needsUpdate = true;
      }
      if (hasLightMaterial) this.lightFixtures.push(object);
    });
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    await this.applySnowTerrain();
    this.oceanWater = await createHaminaSea(this.root, this.terrainTextures);
    const timerObject = this.root.getObjectByName('Timer');
    if (!timerObject) throw new Error('Hamina1018 Timer object is missing.');
    this.timerBounds = new THREE.Box3().setFromObject(timerObject);
    this.timerCenter = this.timerBounds.getCenter(new THREE.Vector3());
    this.countdownDisplay = new HaminaCountdownDisplay(timerObject);

    const mainBase = this.root.getObjectByName('Main_Base')
      ?? this.root.getObjectByName('Main Base');
    const outer = this.root.getObjectByName('Outer');
    if (!mainBase || !outer) throw new Error('Hamina1018 terrain nodes are missing.');
    mainBase.userData.ignoreNavigation = true;
    outer.userData.ignoreNavigation = true;
    const landInstanceSurfaces = [];
    for (const terrainRoot of [mainBase, outer]) terrainRoot.traverse((object) => {
      if (!object.isMesh || !(Array.isArray(object.material) ? object.material : [object.material])
        .some((material) => material?.name === 'Land')) return;
      if (!landInstanceSurfaces.includes(object)) landInstanceSurfaces.push(object);
      // Outer is a visual perimeter beside the sea. Props may be instanced on
      // it, but visitor walking routes must remain on the main ECHO platform.
      if (terrainRoot === mainBase && !this.walkableRoots.includes(object)) {
        this.walkableRoots.push(object);
      }
    });
    if (!this.walkableRoots.length) throw new Error('Hamina1018 Land walking surface is missing.');
    this.navigationBounds = new THREE.Box3(
      new THREE.Vector3(-33, -10, -43), new THREE.Vector3(35, 20, 46),
    );

    this.echo = await replaceEchoModel(
      this.root.getObjectByName('Project_Echo') ?? this.root.getObjectByName('Project Echo'),
    );
    this.echoBox.setFromObject(this.echo);
    this.echoBox.getCenter(this.echoCenter);
    this.echoBox.getSize(this.echoSize);
    this.echoBox.getBoundingSphere(this.echoSphere);
    const forestMarker = this.root.getObjectByName('Forest_Click');
    const forestFocusBounds = forestMarker ? new THREE.Box3().setFromObject(forestMarker) : null;
    this.forestInstances = populateHaminaForest(this.root, this.echoCenter, forestFocusBounds);
    const instanceExclusions = ['Data_Center_Click', 'Cooler_Click', 'Forest_Click', 'Timer_Click',
      'Finland_Click', 'Ocean_Click'].map((name) => this.root.getObjectByName(name))
      .filter(Boolean)
      .map((marker) => new THREE.Box3().setFromObject(marker).expandByScalar(1.5));
    this.root.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh) return;
      if (HAMINA_LAND_INSTANCE_SOURCE_NAMES.has(object.name)) return;
      if (this.walkableRoots.includes(object) || /_Click$/i.test(object.name)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => ['Land', 'Forest'].includes(material?.name))) return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (!bounds.isEmpty()) instanceExclusions.push(bounds.expandByScalar(0.45));
    });
    this.landInstances = populateHaminaLandInstances(this.root, landInstanceSurfaces, instanceExclusions);
    this.landInstanceSummary = this.landInstances.summary;
    console.info('[Hamina] land instances', JSON.stringify(this.landInstanceSummary));
    for (const [name, markerName, visibleNames] of INTERACTIONS) {
      const marker = this.root.getObjectByName(markerName);
      if (!marker) throw new Error(`Hamina1018 interaction marker missing: ${markerName}`);
      marker.material = Array.isArray(marker.material)
        ? marker.material.map((material) => material.clone()) : marker.material.clone();
      for (const material of (Array.isArray(marker.material) ? marker.material : [marker.material])) {
        material.side = THREE.DoubleSide;
      }
      const pickBounds = new THREE.Box3().setFromObject(marker);
      const meshes = [];
      for (const visibleName of visibleNames) {
        this.root.getObjectByName(visibleName)?.traverse((object) => {
          if (object.isMesh) meshes.push(object);
        });
      }
      if (name === 'Cooler') {
        // Blender collections are flattened by glTF, so an exported object
        // added to the Cooler collection is not a child of a Cooler group at
        // runtime. Include every prop spatially authored inside Cooler_Click
        // so newly added pipes, lamps and utility pieces highlight together.
        const coolerVolume = pickBounds.clone().expandByScalar(0.75);
        const objectCenter = new THREE.Vector3();
        this.root.traverse((object) => {
          if (!object.isMesh || object.isInstancedMesh || object === marker
            || /_Click$/i.test(object.name)
            || ['Data_Center', 'Project_Echo', 'Project Echo', 'Ocean',
              'Main_Base', 'Main Base', 'Outer', 'Tree1', 'Tree2',
              ...HAMINA_LAND_INSTANCE_SOURCE_NAMES].includes(object.name)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          if (materials.some((material) => ['Land', 'Forest'].includes(material?.name))) return;
          const objectBounds = new THREE.Box3().setFromObject(object);
          if (!objectBounds.isEmpty()
            && coolerVolume.containsPoint(objectBounds.getCenter(objectCenter))) meshes.push(object);
        });
      }
      if (name === 'Forest') {
        meshes.push(...this.forestInstances.filter((instance) => instance.userData.forestFocus));
      }
      const uniqueMeshes = [...new Set(meshes)];
      const bounds = meshes.length && !['Forest', 'Ocean'].includes(name)
        ? uniqueMeshes.reduce((box, mesh) => box.union(new THREE.Box3().setFromObject(mesh)),
          new THREE.Box3().makeEmpty())
        : pickBounds.clone();
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const region = {
        name, bounds, center, size,
        radius: Math.min(18, Math.max(2.5, bounds.getBoundingSphere(new THREE.Sphere()).radius)),
        meshes: name === 'Ocean' ? [] : uniqueMeshes, pickBounds, pickMarker: marker,
        content: HAMINA_CONFIG.interactions[name],
      };
      if (name === 'Data Center') {
        // This building is wider than Nevada's; the generic capped radius can
        // place the camera inside its facade during the shared archive scene.
        region.focusDistance = Math.max(38,
          bounds.getBoundingSphere(new THREE.Sphere()).radius * 1.25);
      }
      if (name === 'Finland') {
        const flagFabric = this.root.getObjectByName('Flag');
        const flagBounds = flagFabric ? new THREE.Box3().setFromObject(flagFabric) : bounds;
        region.cameraMode = 'flag';
        region.focusTarget = flagBounds.getCenter(new THREE.Vector3());
        region.focusRadius = flagBounds.getBoundingSphere(new THREE.Sphere()).radius;
      }
      if (name === 'Cooler') {
        // The cooler interaction covers a whole plant cluster. Its combined
        // visible bounds are much larger than Nevada's single cooler and made
        // the shared camera formula retreat almost 100 metres. The authored
        // click volume is the intended composition anchor for this world.
        region.cameraMode = 'hamina-cooler';
        region.focusBounds = pickBounds.clone();
        region.focusTarget = pickBounds.getCenter(new THREE.Vector3());
        region.focusSize = pickBounds.getSize(new THREE.Vector3());
        region.focusRadius = pickBounds.getBoundingSphere(new THREE.Sphere()).radius;
      }
      this.interactiveRegions.push(region);
      marker.removeFromParent();
    }
    this.bounds.setFromObject(this.root);
    this.bounds.getSize(this.size);
    this.bounds.getCenter(this.center);
    console.info('[Hamina] loaded', {
      center: this.center.toArray(),
      size: this.size.toArray(),
      echoCenter: this.echoCenter.toArray(),
      trees: this.forestInstances.reduce((count, instance) => count + instance.count, 0),
      landInstances: this.landInstanceSummary,
      interactions: this.interactiveRegions.map((region) => region.name),
    });
    return this;
  }

  async applySnowTerrain() {
    const snow = HAMINA_TERRAIN_TEXTURE_CONFIG.snow;
    const [baseColor, normal, roughness] = await Promise.all([
      this.terrainTextures.loadTexture(snow.baseColor, 1, true),
      this.terrainTextures.loadTexture(snow.normal, 1),
      this.terrainTextures.loadTexture(snow.roughness, 1),
    ]);
    for (const texture of [baseColor, normal, roughness]) texture.anisotropy = 4;
    const replacements = new Map();
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      let ancestor = object;
      while (ancestor && ancestor !== this.root && ancestor.name !== 'Outer') ancestor = ancestor.parent;
      const onOuter = ancestor?.name === 'Outer';
      const snowObject = /^Snow[123]$/.test(object.name);
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const materials = sourceMaterials.map((source) => {
        const forestSurface = source.name === 'Forest';
        if (source.name !== 'Land' && !snowObject && !forestSurface) return source;
        const key = `${source.uuid}:${snowObject ? 'snow' : forestSurface ? 'forest' : 'land'}`;
        if (!replacements.has(key)) {
          const material = source.clone();
          material.map = baseColor;
          material.normalMap = snowObject ? normal : null;
          material.roughnessMap = roughness;
          material.color.set('#ffffff');
          material.metalness = 0;
          material.roughness = snow.roughnessValue;
          if (snowObject) material.normalScale.setScalar(snow.normalScale);
          else this.terrainTextures.applyTriplanarShader(material, {
            scale: snow.triplanarScale,
            snowMap: baseColor,
            snowBlend: 0,
          });
          material.needsUpdate = true;
          replacements.set(key, material);
        }
        return replacements.get(key);
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
    });
    console.info('[Hamina] shared snow texture applied to Land, all Forest surfaces, and Snow1-3');
  }

  update(delta) {
    if (this.oceanWater) this.oceanWater.material.uniforms.time.value += delta * 0.16;
    this.countdownDisplay?.update();
    this.forestWindElapsed += delta;
    const target = this.forestFocus ? 1 : this.forestHover ? 0.24 : 0;
    this.forestWindStrength = THREE.MathUtils.damp(
      this.forestWindStrength ?? 0, target, this.forestFocus ? 3.2 : 5.5, delta,
    );
    for (const instance of this.forestInstances) {
      const uniforms = instance.userData.windUniforms;
      if (!uniforms) continue;
      uniforms.time.value = this.forestWindElapsed;
      uniforms.strength.value = this.forestWindStrength;
    }
  }

  setForestHovered(active) {
    this.forestHover = active ? 1 : 0;
  }

  setForestFocused(active) {
    this.forestFocus = active ? 1 : 0;
  }

  addLighting() {
    const hemisphere = new THREE.HemisphereLight('#badcff', '#73869a', 1.04);
    const sun = new THREE.DirectionalLight('#fff6df', 1.72);
    sun.position.copy(this.center).add(new THREE.Vector3(-42, 68, 30));
    sun.target.position.copy(this.echoCenter);
    const facilityFill = new THREE.DirectionalLight('#bedfff', 0.48);
    facilityFill.position.copy(this.echoCenter).add(new THREE.Vector3(48, 28, -34));
    facilityFill.target.position.copy(this.echoCenter);
    const ambientFill = new THREE.AmbientLight('#91b5d1', 0.12);
    const echoWarm = new THREE.PointLight('#ffc6bd', 0.48,
      Math.max(12, this.echoSphere.radius * 8), 2);
    echoWarm.position.copy(this.echoCenter).add(new THREE.Vector3(-2.8, this.echoSize.y, 2.8));
    const echoCool = new THREE.PointLight('#89d9ff', 0.42,
      Math.max(12, this.echoSphere.radius * 8), 2);
    echoCool.position.copy(this.echoCenter).add(new THREE.Vector3(3, this.echoSize.y * 0.45, -2.5));
    this.scene.add(hemisphere, sun, sun.target, facilityFill, facilityFill.target,
      ambientFill, echoWarm, echoCool);

    this.fixtureLights = new FixtureLights(this.scene, this.lightFixtures, {
      color: HAMINA_FIXTURE_LIGHT, intensity: 16, distance: 11, maxLights: 6,
      focus: this.echoCenter,
    });
    this.lights = [hemisphere, sun, sun.target, facilityFill, facilityFill.target,
      ambientFill, echoWarm, echoCool, ...this.fixtureLights.lights];
  }

  updateFixtureLights(camera) {
    this.fixtureLights?.update(camera.position);
  }

  detach() {
    this.root?.removeFromParent();
    this.lights?.forEach((light) => light.removeFromParent());
  }

  dispose() {
    this.countdownDisplay?.dispose();
    this.countdownDisplay = null;
    this.root?.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
        material.dispose();
      }
    });
    this.detach();
  }
}
