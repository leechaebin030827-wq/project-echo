import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD_CONFIG } from '../config.js';
import { TerrainTextureSystem } from './TerrainTextureSystem.js';

const INTERACTIVE_OBJECT_NAMES = new Set([
  'Data Center',
  'Cooler',
  'Billboard',
  'Cable',
  'Money',
]);

// These are the visible GLB meshes. The five named cubes are export-time
// markers only; they are removed after discovery and never used as hit areas.
const INTERACTIVE_VISIBLE_MESHES = Object.freeze({
  'Data Center': ['Citadel_Main_Entrance'],
  Cooler: ['TSC_Cooling_Module.002'],
  Billboard: ['Mesh_0'],
  Cable: ['Mesh_0.002', 'Mesh_0.001'],
  Money: ['money'],
});

export class NevadaWorld {
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
    this.terrainTextures = new TerrainTextureSystem();
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(WORLD_CONFIG.modelUrl);
    this.root = gltf.scene;
    this.root.name = 'NevadaWorld';
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture) texture.anisotropy = 16;
        }
        if (/^Light/i.test(material.name) && material.emissive?.isColor) {
          material.emissive.set('#ffe7b0');
          material.emissiveIntensity = 3.2;
          material.toneMapped = false;
          if (material.color?.isColor) material.color.set('#fff3cf');
          material.roughness = 0.24;
          this.lightFixtures.push(object);
        } else if (material.emissive?.isColor) {
          const peak = Math.max(material.emissive.r, material.emissive.g, material.emissive.b);
          if (peak > 0.45) {
            material.emissive.multiplyScalar(0.18 / peak);
            material.emissiveIntensity = 0.32;
          }
        }
        material.needsUpdate = true;
      }
    });
    await this.terrainTextures.apply(this.root);
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);

    for (const name of INTERACTIVE_OBJECT_NAMES) {
      const object = this.root.getObjectByName(name)
        ?? this.root.getObjectByName(name.replaceAll(' ', '_'));
      if (!object) {
        console.warn(`[Nevada] interactive object not found: ${name}`);
        continue;
      }
      const meshes = (INTERACTIVE_VISIBLE_MESHES[name] ?? [])
        .map((meshName) => this.root.getObjectByName(meshName)
          ?? this.root.getObjectByName(meshName.replaceAll('.', '')))
        .filter((mesh) => mesh?.isMesh);
      if (meshes.length !== INTERACTIVE_VISIBLE_MESHES[name].length) {
        console.warn(`[Nevada] ${name}: visible interaction mesh missing; click disabled`);
      } else {
        const bounds = new THREE.Box3().makeEmpty();
        for (const mesh of meshes) bounds.union(new THREE.Box3().setFromObject(mesh));
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        this.interactiveRegions.push({ name, bounds, center, size, radius: sphere.radius, meshes });
      }
      object.removeFromParent();
      object.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        for (const material of (Array.isArray(child.material) ? child.material : [child.material])) {
          material?.dispose();
        }
      });
    }
    console.info(`[Nevada] ${this.interactiveRegions.length} interactive regions ready`);

    this.echo = this.root.getObjectByName('echo');
    if (!this.echo) throw new Error('Nevada.glb에서 echo 노드를 찾지 못했습니다.');
    this.echoBox.setFromObject(this.echo);
    this.echoBox.getCenter(this.echoCenter);
    this.echoBox.getSize(this.echoSize);
    this.echoBox.getBoundingSphere(this.echoSphere);
    this.echo.traverse((object) => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.color?.isColor) material.color.multiply(new THREE.Color('#d8dcff'));
        if ('roughness' in material) material.roughness = Math.min(material.roughness, 0.42);
        if ('metalness' in material) material.metalness = Math.max(material.metalness, 0.08);
        if (material.emissive?.isColor) {
          material.emissive.set('#241955');
          material.emissiveIntensity = 0.28;
        }
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
    });
    this.bounds.setFromObject(this.root);
    this.bounds.getSize(this.size);
    this.bounds.getCenter(this.center);
    this.walkableRoots = WORLD_CONFIG.walkableNodeNames
      .map((name) => this.root.getObjectByName(name))
      .filter(Boolean);
    if (!this.walkableRoots.length) {
      const mergedBase = this.root.getObjectByName('Base');
      if (mergedBase) {
        this.walkableRoots = [mergedBase];
        this.navigationBounds = this.getMaterialBounds(mergedBase, 'Garage');
      }
    }

    console.info('[Nevada] loaded');
    console.info('[Nevada] echo found');
    console.info('[Nevada] echo center:', this.echoCenter.toArray());
    return this;
  }

  getMaterialBounds(root, materialName) {
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count, materialIndex: 0 }];
      for (const group of groups) {
        const material = materials[group.materialIndex ?? 0];
        if (material?.name?.toLowerCase() !== materialName.toLowerCase()) continue;
        const position = mesh.geometry.attributes.position;
        const indices = mesh.geometry.index?.array;
        const end = group.start + group.count;
        for (let offset = group.start; offset < end; offset += 1) {
          const vertexIndex = indices ? indices[offset] : offset;
          point.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
          bounds.expandByPoint(point);
        }
      }
    });
    return bounds.isEmpty() ? null : bounds;
  }

  addLighting() {
    const hemisphere = new THREE.HemisphereLight('#9cb8e8', '#455033', 1.12);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight('#fff0d2', 2.45);
    sun.position.copy(this.center).add(new THREE.Vector3(-34, 54, 22));
    sun.target.position.copy(this.echoCenter);
    this.scene.add(sun, sun.target);

    const ambientFill = new THREE.AmbientLight('#687ba5', 0.17);
    this.scene.add(ambientFill);

    const echoGlow = new THREE.PointLight('#a99aff', 2.2, Math.max(14, this.echoSphere.radius * 9), 2);
    echoGlow.position.copy(this.echoCenter).add(new THREE.Vector3(-2.8, this.echoSize.y * 1.1, 3.2));
    const echoRim = new THREE.PointLight('#59c7ff', 1.25, Math.max(12, this.echoSphere.radius * 8), 2);
    echoRim.position.copy(this.echoCenter).add(new THREE.Vector3(3.6, this.echoSize.y * 0.45, -2.6));
    this.scene.add(echoGlow, echoRim);

    const fixtureBox = new THREE.Box3();
    const fixtureCenter = new THREE.Vector3();
    const maxPracticalLights = 6;
    const poleFixtures = [...new Set(this.lightFixtures)]
      .filter((object) => /^Industrial_Light_Pole_A/.test(object.name));
    const fixtureStep = Math.max(1, Math.ceil(poleFixtures.length / maxPracticalLights));
    const practicalLights = poleFixtures
      .filter((_, index) => index % fixtureStep === 0)
      .slice(0, maxPracticalLights)
      .map((fixture) => {
        fixtureBox.setFromObject(fixture);
        fixtureBox.getCenter(fixtureCenter);
        const light = new THREE.PointLight('#ffdca0', 0.72, 5.8, 2);
        light.position.set(fixtureCenter.x, fixtureBox.max.y - 0.08, fixtureCenter.z);
        this.scene.add(light);
        return light;
      });
    this.lights = [hemisphere, sun, sun.target, ambientFill, echoGlow, echoRim, ...practicalLights];
  }

  dispose() {
    this.root?.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose();
        }
        material.dispose();
      }
    });
    this.root?.removeFromParent();
    this.lights?.forEach((light) => light.removeFromParent());
  }

  detach() {
    this.root?.removeFromParent();
    this.lights?.forEach((light) => light.removeFromParent());
  }
}
