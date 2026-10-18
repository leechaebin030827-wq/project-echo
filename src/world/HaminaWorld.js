import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HAMINA_CONFIG, HAMINA_TERRAIN_TEXTURE_CONFIG } from '../config.js';
import { TerrainTextureSystem } from './TerrainTextureSystem.js';
import { replaceEchoModel } from './EchoModel.js';

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
    this.navigationAnchorName = HAMINA_CONFIG.navigationAnchorName;
    this.terrainTextures = new TerrainTextureSystem(HAMINA_TERRAIN_TEXTURE_CONFIG, {
      triplanar: true,
      snowTextureUrl: HAMINA_TERRAIN_TEXTURE_CONFIG.snow.baseColor,
    });
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
        if (/^light/i.test(material.name) && material.emissive?.isColor) {
          hasLightMaterial = true;
          material.emissive.set('#f3fbff');
          material.emissiveMap = material.map ?? material.emissiveMap;
          material.emissiveIntensity = 6;
          material.toneMapped = false;
          if (material.color?.isColor) material.color.set('#ffffff');
          if ('roughness' in material) material.roughness = 0.16;
        }
        material.needsUpdate = true;
      }
      if (hasLightMaterial) {
        let fixture = object;
        while (fixture.parent && !/^Industrial_Light_Pole_A/.test(fixture.name)) {
          fixture = fixture.parent;
        }
        this.lightFixtures.push(/^Industrial_Light_Pole_A/.test(fixture.name) ? fixture : object);
      }
    });
    await this.terrainTextures.apply(this.root);
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);

    this.echo = await replaceEchoModel(this.root.getObjectByName('echo'));
    this.echoBox.setFromObject(this.echo);
    this.echoBox.getCenter(this.echoCenter);
    this.echoBox.getSize(this.echoSize);
    this.echoBox.getBoundingSphere(this.echoSphere);
    this.bounds.setFromObject(this.root);
    this.bounds.getSize(this.size);
    this.bounds.getCenter(this.center);
    this.walkableRoots = HAMINA_CONFIG.walkableNodeNames
      .map((name) => this.root.getObjectByName(name))
      .filter(Boolean);
    if (!this.walkableRoots.length) throw new Error('Hamina.glb에서 보행 가능한 눈 지형을 찾지 못했습니다.');
    console.info('[Hamina] loaded', {
      center: this.center.toArray(),
      size: this.size.toArray(),
      echoCenter: this.echoCenter.toArray(),
    });
    return this;
  }

  addLighting() {
    const hemisphere = new THREE.HemisphereLight('#c7e2f6', '#687f90', 1.22);
    const sun = new THREE.DirectionalLight('#fff6df', 2.05);
    sun.position.copy(this.center).add(new THREE.Vector3(-42, 68, 30));
    sun.target.position.copy(this.echoCenter);
    const ambientFill = new THREE.AmbientLight('#91b5d1', 0.2);
    this.scene.add(hemisphere, sun, sun.target, ambientFill);

    const fixtureBox = new THREE.Box3();
    const fixtureCenter = new THREE.Vector3();
    const poleFixtures = [...new Set(this.lightFixtures)]
      .filter((object) => /^Industrial_Light_Pole_A/.test(object.name));
    const step = Math.max(1, Math.ceil(poleFixtures.length / 6));
    const practicalLights = poleFixtures.filter((_, index) => index % step === 0).slice(0, 6)
      .map((fixture) => {
        fixtureBox.setFromObject(fixture);
        fixtureBox.getCenter(fixtureCenter);
        const light = new THREE.PointLight('#eaf8ff', 1.05, 9, 2);
        light.position.set(fixtureCenter.x, fixtureBox.max.y - 0.08, fixtureCenter.z);
        this.scene.add(light);
        return light;
      });
    this.lights = [hemisphere, sun, sun.target, ambientFill, ...practicalLights];
  }

  detach() {
    this.root?.removeFromParent();
    this.lights?.forEach((light) => light.removeFromParent());
  }

  dispose() {
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
