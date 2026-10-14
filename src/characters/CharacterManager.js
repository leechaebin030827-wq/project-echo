import { BaseCharacterAsset } from './BaseCharacterAsset.js';
import { CharacterEntity } from './CharacterEntity.js';
import { CharacterBehavior } from './CharacterBehavior.js';
import { GroupDanceDirector } from './GroupDanceDirector.js';
import { ConversationDirector } from './ConversationDirector.js';
import { AVAILABLE_BASES, NEVADA_NPC_IDS } from '../config.js';
import * as THREE from 'three';

export class CharacterManager {
  constructor(scene, camera, navigation) {
    this.scene = scene;
    this.camera = camera;
    this.navigation = navigation;
    this.entities = [];
    this.byId = new Map();
    this.danceDirector = new GroupDanceDirector(camera, navigation);
    this.conversationDirector = new ConversationDirector();
    this.danceEnabled = true;
    this.ambientProps = [];
  }

  getNevadaRoutes(nearEcho) {
    const echo = this.navigation.world?.echoCenter;
    if (!echo || this.navigation.world.root?.name !== 'NevadaWorld') return this.navigation.routes;
    const ranked = this.navigation.routes.map((route) => {
      const center = route.points.reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .divideScalar(route.points.length);
      return { route, distance: Math.hypot(center.x - echo.x, center.z - echo.z) };
    }).sort((a, b) => a.distance - b.distance);
    const nearCount = Math.max(1, Math.ceil(ranked.length * 0.55));
    return (nearEcho ? ranked.slice(0, nearCount) : ranked.slice(nearCount))
      .map((entry) => entry.route);
  }

  placeNevadaCharacter(entity, nearEcho) {
    const echo = this.navigation.world.echoCenter;
    const preferredDistance = Math.max(8, this.navigation.world.echoSphere.radius * 1.75);
    const findPosition = (routes, requiredClearance) => {
      let best = null;
      for (const route of routes) {
        for (let sample = 0; sample < 48; sample += 1) {
          const distance = (sample / 48) * route.length;
          const position = this.navigation.sampleRoute(route, distance, new THREE.Vector3());
          const clearance = this.entities.reduce((minimum, other) => Math.min(minimum,
            Math.hypot(position.x - other.root.position.x, position.z - other.root.position.z)), Infinity);
          if (clearance < requiredClearance) continue;
          const echoDistance = Math.hypot(position.x - echo.x, position.z - echo.z);
          const score = Math.abs(echoDistance - preferredDistance) * (nearEcho ? 0.28 : 0.06)
            - Math.min(clearance, 4.4) * 0.85;
          if (!best || score < best.score) best = { route, distance, position, score, clearance };
        }
      }
      return best;
    };
    const preferredRoutes = this.getNevadaRoutes(nearEcho);
    const placement = findPosition(preferredRoutes, 2.45)
      ?? findPosition(this.navigation.routes, 2.45)
      ?? findPosition(this.navigation.routes, 1.7);
    if (!placement) {
      console.warn(`[Characters] ${entity.id}: no separated Nevada spawn found`);
      return;
    }
    entity.behavior.route = placement.route;
    if (entity.nevadaNpc) entity.behavior.setStartDistance(placement.distance);
    else {
      entity.behavior.distance = placement.distance;
      entity.behavior.current.copy(placement.position);
      entity.root.position.copy(placement.position);
    }
  }

  async preload() {
    this.bases = await Promise.all(AVAILABLE_BASES.map((base) => BaseCharacterAsset.load(base)));
    this.nevadaBases = await Promise.all(
      NEVADA_NPC_IDS.slice(0, 10).map((id) => BaseCharacterAsset.load(id)),
    );
    return this.bases;
  }

  async spawn(count) {
    if (count > AVAILABLE_BASES.length * 5) {
      throw new Error('검증된 캐릭터 베이스는 최대 15명입니다.');
    }
    if (!this.bases) await this.preload();
    for (let index = 0; index < count; index += 1) {
      const baseIndex = Math.floor(index / 5);
      const base = this.bases[baseIndex];
      const id = `${base.base}${String(index % 5 + 1).padStart(2, '0')}`;
      const entity = new CharacterEntity({
        id,
        baseAsset: base,
        navigation: this.navigation,
        routeIndex: index,
        scale: 1 + ((index % 3) - 1) * 0.015,
      });
      if (this.navigation.world?.root?.name === 'NevadaWorld') {
        this.placeNevadaCharacter(entity, index % 5 !== 4);
      } else {
        const minimumSpawnSpacing = 3.25;
        for (let attempt = 0; attempt < 36; attempt += 1) {
          const hasClearance = this.entities.every((other) => (
            entity.root.position.distanceTo(other.root.position) >= minimumSpawnSpacing
          ));
          if (hasClearance) break;
          entity.behavior.distance += entity.behavior.route.length / 17;
          this.navigation.sampleRoute(entity.behavior.route, entity.behavior.distance, entity.root.position);
        }
      }
      this.entities.push(entity);
      this.byId.set(id, entity);
      this.scene.add(entity.root);
    }
    let minimumSpacing = Infinity;
    for (let a = 0; a < this.entities.length; a += 1) {
      for (let b = a + 1; b < this.entities.length; b += 1) {
        minimumSpacing = Math.min(
          minimumSpacing,
          this.entities[a].root.position.distanceTo(this.entities[b].root.position),
        );
      }
    }
    console.info(`[Characters] ${this.entities.length} spawned`);
    console.info(`[Characters] minimum start spacing: ${minimumSpacing.toFixed(2)}`);
    return this.entities;
  }

  async spawnNevadaNpcs() {
    if (!this.nevadaBases) await this.preload();
    // Share the safe routes around ECHO while leaving two walkers on the wider perimeter.
    for (const [index, id] of NEVADA_NPC_IDS.entries()) {
      if (this.byId.has(id)) continue;
      const entity = new CharacterEntity({
        id,
        baseAsset: this.nevadaBases[index % this.nevadaBases.length],
        navigation: this.navigation,
        routeIndex: index % this.navigation.routes.length,
        roaming: true,
      });
      this.placeNevadaCharacter(entity, index % 5 !== 4);
      this.entities.push(entity);
      this.byId.set(id, entity);
      this.scene.add(entity.root);
    }
    this.placeNevadaAmbientCharacters();
    console.info(`[Characters] ${NEVADA_NPC_IDS.length} Nevada NPCs added; total ${this.entities.length}`);
  }

  placeNevadaAmbientCharacters() {
    const world = this.navigation.world;
    const leaner = this.byId.get('N12');
    const poles = [];
    world.root.traverse((object) => {
      if (/^Industrial_Light_Pole_A/.test(object.name) && object.isMesh) poles.push(object);
    });
    const echo = world.echoCenter;
    poles.sort((a, b) => {
      const centerA = new THREE.Box3().setFromObject(a).getCenter(new THREE.Vector3());
      const centerB = new THREE.Box3().setFromObject(b).getCenter(new THREE.Vector3());
      return centerA.distanceToSquared(echo) - centerB.distanceToSquared(echo);
    });
    for (const pole of poles) {
      const center = pole.getWorldPosition(new THREE.Vector3());
      let placed = false;
      for (const radius of [0.6, 0.75, 0.9]) {
        for (let step = 0; step < 12; step += 1) {
          const angle = step * Math.PI / 6;
          const x = center.x + Math.cos(angle) * radius;
          const z = center.z + Math.sin(angle) * radius;
          const y = this.navigation.sampleHeight(x, z);
          if (y === null) continue;
          if (this.entities.some((other) => other !== leaner
            && Math.hypot(other.root.position.x - x, other.root.position.z - z) < 1.65)) continue;
          leaner.setAmbientPose('lean', new THREE.Vector3(x, y, z),
            Math.atan2(center.x - x, center.z - z) - Math.PI / 2);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (placed) break;
    }

    const sitter = this.byId.get('N13');
    if (sitter) {
      sitter.setAmbientPose('sit', sitter.root.position.clone(), sitter.root.rotation.y);
      sitter.model.position.y = -0.39;
      const bin = new THREE.Group();
      bin.name = 'Nevada resting place bin';
      bin.position.copy(sitter.root.position);
      bin.position.x -= Math.sin(sitter.root.rotation.y) * 0.29;
      bin.position.z -= Math.cos(sitter.root.rotation.y) * 0.29;
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.24, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: '#49525a', metalness: 0.65, roughness: 0.57 }),
      );
      shell.position.y = 0.25;
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16),
        new THREE.MeshStandardMaterial({ color: '#222c35', metalness: 0.72, roughness: 0.42 }),
      );
      rim.position.y = 0.52;
      bin.add(shell, rim);
      this.scene.add(bin);
      this.ambientProps.push(bin);
    }
    for (const [id, pose] of [['N14', 'observe'], ['N15', 'stretch']]) {
      const entity = this.byId.get(id);
      if (entity) entity.setAmbientPose(pose, entity.root.position.clone(), entity.root.rotation.y);
    }
  }

  update(delta) {
    if (this.danceEnabled) {
      this.danceDirector.update(delta, this.entities);
      this.conversationDirector.update(delta, this.entities);
    }
    for (const entity of this.entities) entity.update(delta, this.camera, this.entities);
  }

  getDanceGroup(entity) { return this.danceDirector.getGroupFor(entity); }
  viewDanceGroup(group) { this.danceDirector.view(group); }
  releaseDanceGroup(group) { this.danceDirector.release(group); }
  stopDances() {
    this.danceDirector.clear();
    this.conversationDirector.clear();
  }

  setFocused(entity) {
    if (entity?.conversation) this.conversationDirector.end(entity.conversation);
    for (const character of this.entities) character.focused = character === entity;
  }

  setWorldMode(mode) {
    this.danceEnabled = mode === 'nevada';
    if (!this.danceEnabled) this.stopDances();
    for (const character of this.entities) {
      character.setWorldMode(mode);
      if (!character.nevadaNpc) character.behavior.allowIdle = this.danceEnabled;
    }
  }

  setLookingUp(active, selected = null) {
    if (active) this.stopDances();
    const selectedSet = selected ? new Set(selected) : null;
    for (const character of this.entities) {
      character.setLookingUp(active && (!selectedSet || selectedSet.has(character)));
    }
  }

  relocate(navigation) {
    this.stopDances();
    this.removeNevadaNpcs();
    this.navigation = navigation;
    for (let index = 0; index < this.entities.length; index += 1) {
      const entity = this.entities[index];
      entity.behavior = new CharacterBehavior(entity, navigation, index, entity.random);
      entity.setLookingUp(false);
      entity.focused = false;
    }
  }

  removeNevadaNpcs() {
    this.stopDances();
    const remaining = [];
    for (const entity of this.entities) {
      if (!entity.nevadaNpc) {
        remaining.push(entity);
        continue;
      }
      this.byId.delete(entity.id);
      entity.dispose();
    }
    this.entities = remaining;
    for (const prop of this.ambientProps) {
      prop.traverse((object) => {
        if (object.isMesh) {
          object.geometry.dispose();
          object.material.dispose();
        }
      });
      prop.removeFromParent();
    }
    this.ambientProps = [];
  }

  get pickTargets() {
    return this.entities.map((entity) => entity.hitVolume);
  }

  dispose() {
    this.stopDances();
    this.removeNevadaNpcs();
    for (const entity of this.entities) entity.dispose();
    this.entities = [];
    this.byId.clear();
  }
}
