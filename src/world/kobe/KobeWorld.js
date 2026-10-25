import * as THREE from 'three';
import { replaceEchoModel } from '../shared/EchoModel.js';
import { KobeMaterialManager } from './KobeMaterialManager.js';
import { createKobeTunnel } from './KobeTunnel.js';

export const KOBE_DEFAULTS = Object.freeze({
  width: 7,
  wallHeight: 3.5,
  length: 64,
  bracketSpacing: 2,
  bracketArmLength: 0.9,
  rightSide: true,
  tileSize: 2.5,
});

export class KobeWorld {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = { ...KOBE_DEFAULTS, ...options };
    this.materialManager = new KobeMaterialManager({ tileSize: this.options.tileSize });
    this.root = new THREE.Group();
    this.root.name = 'KobeWorld';
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
    this.navigationAnchorName = 'KobeNavigation';
    this.lightFixtures = [];
  }

  async load({ visible = true } = {}) {
    this.root.visible = visible;
    await this.materialManager.loadBundledDefaults();
    this.rebuild(this.options);
    const echoMount = new THREE.Group();
    echoMount.name = 'Project_Echo';
    echoMount.position.set(0, 0.92, -36);
    // The shared rig is already authored at human scale. Outdoor worlds enlarge
    // it through their GLB placeholder; the narrow Kobe interior keeps it 1:1.
    echoMount.scale.setScalar(0.58);
    this.root.add(echoMount);
    this.scene.add(this.root);
    this.echo = await replaceEchoModel(echoMount);
    this.refreshBounds();
    return this;
  }

  rebuild(next = {}) {
    this.options = { ...this.options, ...next };
    this.materialManager.setTileSize(this.options.tileSize);
    if (this.tunnel) {
      this.tunnel.traverse((object) => object.geometry?.dispose());
      this.tunnel.removeFromParent();
    }
    this.tunnel = createKobeTunnel({
      ...this.options,
      materials: this.materialManager.materials,
    });
    this.root.add(this.tunnel);
    const floor = this.tunnel.userData.floor;
    floor.userData.ignoreNavigation = true;
    this.walkableRoots = [floor];
    const { width, length } = this.options;
    this.navigationBounds = new THREE.Box3(
      new THREE.Vector3(-width * 0.34, -0.25, -length + 4),
      new THREE.Vector3(width * 0.34, 2.5, -3),
    );
    if (this.echo) this.refreshBounds();
    return this.tunnel;
  }

  refreshBounds() {
    this.root.updateMatrixWorld(true);
    this.echoBox.setFromObject(this.echo);
    this.echoBox.getCenter(this.echoCenter);
    this.echoBox.getSize(this.echoSize);
    this.echoBox.getBoundingSphere(this.echoSphere);
    this.bounds.setFromObject(this.root);
    this.bounds.getSize(this.size);
    this.bounds.getCenter(this.center);
  }

  async updateMaterial(surface, kind, source) {
    return this.materialManager.update(surface, kind, source);
  }

  addLighting() {
    const ambient = new THREE.HemisphereLight('#f0e6d4', '#28231d', 1.05);
    const roomFill = new THREE.AmbientLight('#e6d8c2', 0.72);
    const entrance = new THREE.DirectionalLight('#fff5df', 1.35);
    entrance.position.set(0, 8, 4);
    entrance.target.position.set(0, 2.5, -18);
    this.scene.add(ambient, roomFill, entrance, entrance.target);
    const practicals = [];
    for (let z = -4; z > -this.options.length; z -= 9) {
      const light = new THREE.PointLight('#fff3d5', 11, 11, 2);
      light.position.set(0, this.options.wallHeight + 2.4, z);
      this.scene.add(light);
      practicals.push(light);
    }
    const echoFill = new THREE.PointLight('#ffe1b2', 0.48, 15, 2);
    echoFill.position.copy(this.echoCenter).add(new THREE.Vector3(2.4, 3.8, 2));
    this.scene.add(echoFill);
    this.lights = [ambient, roomFill, entrance, entrance.target, echoFill, ...practicals];
  }

  updateFixtureLights() {}

  detach() {
    this.root?.removeFromParent();
    this.lights?.forEach((light) => light.removeFromParent());
  }

  dispose() {
    this.root?.traverse((object) => object.geometry?.dispose());
    this.materialManager.dispose();
    this.detach();
  }
}
