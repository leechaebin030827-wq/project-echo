import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { TERRAIN_TEXTURE_CONFIG, WORLD_CONFIG } from '../../config.js';
import { replaceEchoModel } from '../shared/EchoModel.js';
import { TerrainTextureSystem } from '../shared/TerrainTextureSystem.js';
import { NevadaGrass } from './NevadaGrass.js';
import { BillboardFaceTexture } from '../shared/BillboardFaceTexture.js';
import { FixtureLights } from '../shared/FixtureLights.js';

const INTERACTIVE_OBJECT_NAMES = new Set([
  'Data Center',
  'Cooler',
  'Billboard',
  'Flag',
  'Money',
]);

// Legacy Nevada exports use visible meshes for picking. Nevada1017 uses the
// separate *_Click cubes listed below as its exact interaction hit areas.
const INTERACTIVE_VISIBLE_MESHES = Object.freeze({
  'Data Center': ['Citadel_Main_Entrance'],
  Cooler: ['TSC_Cooling_Module.002'],
  Billboard: ['Mesh_0'],
  Flag: ['Mesh_0.002', 'Mesh_0.001'],
  Money: ['money'],
});

// Nevada1017 exports visible objects and separate *_Click volumes. Blender
// collection names do not survive this GLB export, so use exported node names.
const NEVADA_1017_INTERACTIONS = [
  { name: 'Data Center', visible: ['Data_Center'], marker: 'Data Center_Click' },
  {
    name: 'Cooler', visible: ['TSC_Cooling_Module.001', 'TSC_Cooling_Module.002'],
    highlight: [
      'Citadel_Wall_Service_Bay', 'Citadel_Wall_Service_Bay.001',
      'Citadel_Wall_Service_Bay.002', 'Citadel_Wall_Service_Bay.003',
      'Citadel_Wall_Service_Bay.004', 'Citadel_Wall_Service_Bay.005',
      'Citadel_Wall_Straight', 'TSC_Service_Platform',
    ],
    marker: 'Cooler1_Click',
  },
  {
    name: 'Cooler', visible: ['TSC_Cooling_Module.003'],
    highlight: [
      'Citadel_Wall_Straight.001', 'Citadel_Wall_Straight.002',
      'Citadel_Wall_Straight.003', 'TSC_Service_Platform.001',
    ],
    marker: 'Cooler2_Click',
  },
  { name: 'Billboard', visible: ['output_unwrapped'], marker: 'Billboard_Click' },
  { name: 'Flag', visible: ['USA'], marker: 'USA_Click' },
  { name: 'Money', visible: ['Money', 'Money_Cover'], marker: 'Money_Click' },
];

const findNode = (root, name) => root.getObjectByName(name)
  ?? root.getObjectByName(name.replaceAll(' ', '_'))
  ?? root.getObjectByName(name.replaceAll('.', ''));

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
    this.terrainTextures = new TerrainTextureSystem(TERRAIN_TEXTURE_CONFIG, {
      materialAliases: { 'material.003': 'mountain' },
    });
    this.grass = null;
    this.clickMarkers = [];
    this.instancedFixtures = [];
    this.billboardFaceTexture = null;
  }

  async load() {
    const [gltf, billboardImage] = await Promise.all([
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(WORLD_CONFIG.modelUrl),
      new THREE.ImageLoader().loadAsync('/textures/nevada/billboard/acquired-no-text.png'),
    ]);
    this.billboardFaceTexture = new BillboardFaceTexture(billboardImage);
    const billboardTexture = this.billboardFaceTexture.texture;
    this.root = gltf.scene;
    this.root.name = 'NevadaWorld';
    const oldBase = findNode(this.root, "Base_Save_Don'tShow");
    oldBase?.removeFromParent();
    if (oldBase) this.clickMarkers.push(oldBase);
    const isNevada1017 = !!findNode(this.root, 'Data Center_Click');
    this.root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.name === 'Billboard') {
          material.map = billboardTexture;
          material.emissiveMap = billboardTexture;
          material.color.set('#ffffff');
          material.emissive.set('#ffffff');
          material.emissiveIntensity = 0.35;
          material.roughness = 0.65;
          material.metalness = 0;
        } else if (/^Light/i.test(material.name) && material.emissive?.isColor) {
          material.color.set('#fff3cb');
          material.emissive.set('#ffd88c');
          material.emissiveIntensity = 5.2;
          material.toneMapped = false;
          material.roughness = 0.32;
          material.metalness = 0;
          this.lightFixtures.push(object);
        } else if (material.emissive?.isColor) {
          const peak = Math.max(material.emissive.r, material.emissive.g, material.emissive.b);
          if (peak > 0.45) {
            material.emissive.multiplyScalar(0.18 / peak);
            material.emissiveIntensity = 0.32;
          }
        }
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          if (texture) texture.anisotropy = Math.min(8, texture.anisotropy || 8);
        }
        material.needsUpdate = true;
      }
    });
    await this.terrainTextures.apply(this.root);
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    if (isNevada1017) this.instanceLightPoles();

    if (isNevada1017) {
      for (const definition of NEVADA_1017_INTERACTIONS) {
        const marker = findNode(this.root, definition.marker);
        const meshes = [];
        const anchorMeshes = [];
        for (const name of [...definition.visible, ...(definition.highlight ?? [])]) {
          findNode(this.root, name)?.traverse((object) => {
            if (!object.isMesh || meshes.includes(object)) return;
            meshes.push(object);
            if (definition.visible.includes(name)) anchorMeshes.push(object);
          });
        }
        if (!marker || !anchorMeshes.length) {
          console.warn(`[Nevada] ${definition.name}: missing ${definition.marker} or visible mesh`);
          continue;
        }
        const bounds = new THREE.Box3().makeEmpty();
        for (const mesh of anchorMeshes) bounds.union(new THREE.Box3().setFromObject(mesh));
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const pickBounds = new THREE.Box3().setFromObject(marker);
        const region = {
          name: definition.name, bounds, center, size, radius: sphere.radius, meshes, pickBounds,
          pickMarker: marker,
          cover: definition.name === 'Money' ? findNode(this.root, 'Money_Cover') : null,
          money: definition.name === 'Money' ? findNode(this.root, 'Money') : null,
        };
        if (definition.name === 'Flag') {
          region.cameraMode = 'flag';
          region.focusTarget = center.clone();
          if (size.y > size.x * 1.4) region.focusTarget.y = bounds.max.y - size.y * 0.22;
          region.focusRadius = sphere.radius;
        } else if (definition.name === 'Cooler') {
          // The rear service bays and platform belong to the cooling assembly.
          // Keep the small marker for picking, but frame the entire assembly.
          region.focusBounds = bounds.clone();
          for (const mesh of meshes) region.focusBounds.union(new THREE.Box3().setFromObject(mesh));
          region.focusTarget = region.focusBounds.getCenter(new THREE.Vector3());
          region.focusSize = region.focusBounds.getSize(new THREE.Vector3());
          region.focusRadius = region.focusBounds.getBoundingSphere(new THREE.Sphere()).radius;
        }
        this.interactiveRegions.push(region);
        marker.removeFromParent();
        this.clickMarkers.push(marker);
      }
    } else for (const name of INTERACTIVE_OBJECT_NAMES) {
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
        const region = { name, bounds, center, size, radius: sphere.radius, meshes };
        if (name === 'Flag') {
          region.cameraMode = 'flag';
          region.focusTarget = center.clone();
          if (size.y > size.x * 1.4) region.focusTarget.y = bounds.max.y - size.y * 0.22;
          region.focusRadius = sphere.radius;
        }
        this.interactiveRegions.push(region);
      }
      object.removeFromParent();
      this.clickMarkers.push(object);
    }
    console.info(`[Nevada] ${this.interactiveRegions.length} interactive regions ready`);

    this.echo = await replaceEchoModel(this.root.getObjectByName('echo') ?? this.root.getObjectByName('Echo'));
    this.echoBox.setFromObject(this.echo);
    this.echoBox.getCenter(this.echoCenter);
    this.echoBox.getSize(this.echoSize);
    this.echoBox.getBoundingSphere(this.echoSphere);
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

    if (isNevada1017) {
      this.grass = new NevadaGrass(this.root);
      this.grass.populate();
    }

    console.info('[Nevada] loaded');
    console.info('[Nevada] echo found');
    console.info('[Nevada] echo center:', this.echoCenter.toArray());
    return this;
  }

  instanceLightPoles() {
    const poles = this.root.children.filter((object) => /^Industrial_Light_Pole_A/.test(object.name));
    if (poles.length < 2) return;
    const batches = new Map();
    let sourceMeshCount = 0;
    for (const pole of poles) {
      pole.traverse((mesh) => {
        if (!mesh.isMesh || mesh.isSkinnedMesh || Array.isArray(mesh.material)) return;
        sourceMeshCount++;
        const key = `${mesh.geometry.uuid}:${mesh.material.uuid}`;
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key).push(mesh);
      });
    }
    const inverseRoot = this.root.matrixWorld.clone().invert();
    const localMatrix = new THREE.Matrix4();
    for (const meshes of batches.values()) {
      if (meshes.length < 2) continue;
      const instance = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
      instance.name = `Instanced_${meshes[0].material.name}_LightPoles`;
      instance.userData.ignoreNavigation = true;
      instance.castShadow = false;
      instance.receiveShadow = true;
      meshes.forEach((mesh, index) => {
        localMatrix.multiplyMatrices(inverseRoot, mesh.matrixWorld);
        instance.setMatrixAt(index, localMatrix);
      });
      instance.instanceMatrix.needsUpdate = true;
      instance.computeBoundingSphere();
      this.root.add(instance);
      this.instancedFixtures.push(instance);
    }
    if (this.instancedFixtures.reduce((count, instance) => count + instance.count, 0) === sourceMeshCount) {
      for (const pole of poles) pole.visible = false;
      console.info(`[Nevada] ${poles.length} light poles batched into ${this.instancedFixtures.length} GPU draws`);
    } else {
      for (const instance of this.instancedFixtures) {
        instance.removeFromParent();
        instance.dispose();
      }
      this.instancedFixtures = [];
    }
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
    const hemisphere = new THREE.HemisphereLight('#a2c3f3', '#8e8794', 1.24);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight('#ffe9df', 2.12);
    sun.position.copy(this.center).add(new THREE.Vector3(-34, 54, 22));
    sun.target.position.copy(this.echoCenter);
    this.scene.add(sun, sun.target);

    const ambientFill = new THREE.AmbientLight('#9da7b3', 0.22);
    this.scene.add(ambientFill);

    const echoGlow = new THREE.PointLight('#ffb7a9', 1.12, Math.max(14, this.echoSphere.radius * 9), 2);
    echoGlow.position.copy(this.echoCenter).add(new THREE.Vector3(-2.8, this.echoSize.y * 1.1, 3.2));
    const echoRim = new THREE.PointLight('#8edcff', 0.54, Math.max(12, this.echoSphere.radius * 8), 2);
    echoRim.position.copy(this.echoCenter).add(new THREE.Vector3(3.6, this.echoSize.y * 0.45, -2.6));
    this.scene.add(echoGlow, echoRim);

    this.fixtureLights = new FixtureLights(this.scene, this.lightFixtures, {
      color: '#ffdca0', intensity: 12, distance: 7.5, maxLights: 6,
      focus: this.echoCenter,
    });
    this.lights = [hemisphere, sun, sun.target, ambientFill, echoGlow, echoRim,
      ...this.fixtureLights.lights];
  }

  updateFixtureLights(camera) {
    this.fixtureLights?.update(camera.position);
  }

  dispose() {
    this.grass?.dispose();
    for (const instance of this.instancedFixtures) instance.dispose();
    this.instancedFixtures = [];
    for (const marker of this.clickMarkers) marker.traverse((object) => object.geometry?.dispose());
    this.clickMarkers = [];
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
    this.billboardFaceTexture = null;
    this.lights?.forEach((light) => light.removeFromParent());
  }

  applyVisitorFaceToBillboard(session, previousFaces = []) {
    return this.billboardFaceTexture?.applyVisitorFace(session, previousFaces) ?? false;
  }

  detach() {
    this.root?.removeFromParent();
    this.lights?.forEach((light) => light.removeFromParent());
  }
}
