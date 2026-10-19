import { BaseCharacterAsset } from './BaseCharacterAsset.js';
import { CharacterEntity } from './CharacterEntity.js';
import { CharacterBehavior } from './CharacterBehavior.js';
import { GroupDanceDirector } from './GroupDanceDirector.js';
import { ConversationDirector } from './ConversationDirector.js';
import { AVAILABLE_BASES, NEVADA_NPC_IDS } from '../config.js';
import * as THREE from 'three';

const VISITOR_HEIGHT = 2.2;

export class CharacterManager {
  constructor(scene, camera, navigation) {
    this.scene = scene;
    this.camera = camera;
    this.navigation = navigation;
    this.entities = [];
    this.byId = new Map();
    this.danceDirector = new GroupDanceDirector(camera, navigation);
    this.conversationDirector = new ConversationDirector();
    this.danceEnabled = false;
    this.ambientProps = [];
    this.ritualActive = false;
    this.ritualDispersal = null;
  }

  startEchoRitual() {
    this.stopDances();
    const echo = this.navigation.world.echoCenter;
    const count = this.entities.length;
    const garage = this.navigation.garageBox;
    const insideGarage = (x, z) => x >= garage.min.x + 0.5 && x <= garage.max.x - 0.5
      && z >= garage.min.z + 0.5 && z <= garage.max.z - 0.5;
    const clearRing = (radius) => {
      for (let sample = 0; sample < 90; sample += 1) {
        const angle = sample * Math.PI * 2 / 90;
        const x = echo.x + Math.cos(angle) * radius;
        const z = echo.z + Math.sin(angle) * radius;
        if (!insideGarage(x, z)) return false;
        const y = this.navigation.sampleHeight(x, z);
        if (y === null || !this.navigation.isClear(x, y, z)) return false;
      }
      return true;
    };
    this.ritualRadius = [6.7, 6.5, 6.9, 7.1, 7.3, 7.5]
      .find(clearRing) ?? 6.7;
    for (const [index, entity] of this.entities.entries()) {
      const angle = -Math.PI * 0.5 + index * Math.PI * 2 / count;
      const x = echo.x + Math.cos(angle) * this.ritualRadius;
      const z = echo.z + Math.sin(angle) * this.ritualRadius;
      const position = new THREE.Vector3(x, this.navigation.sampleHeight(x, z) ?? entity.root.position.y, z);
      entity.setAmbientPose('ritual', position, Math.atan2(echo.x - position.x, echo.z - position.z));
      entity.ambientAge = 0;
    }
    this.ritualActive = true;
  }

  releaseEchoRitual() {
    if (!this.ritualActive || this.ritualDispersal) return;
    this.ritualActive = false;
    for (const entity of this.entities) {
      entity.endRitualPose();
    }
    this.ritualDispersal = {
      elapsed: 0,
      moves: this.entities.map((entity, index) => {
        const from = entity.root.position.clone();
        let best = null;
        for (const route of this.navigation.routes) {
          for (let sample = 0; sample < 48; sample += 1) {
            const distance = route.length * sample / 48;
            const point = this.navigation.sampleRoute(route, distance, new THREE.Vector3());
            const score = point.distanceToSquared(from);
            if (!best || score < best.score) best = { route, distance, point, score };
          }
        }
        const direction = best.point.clone().sub(from);
        direction.y = 0;
        return {
          entity, from, ...best,
          heading: Math.atan2(direction.x, direction.z),
          length: direction.length(),
          progress: 0,
          elapsed: 0,
          delay: (index % 5) * 0.16,
          walking: false,
          complete: false,
        };
      }),
    };
  }

  getEchoRoutes() {
    const echo = this.navigation.world?.echoCenter;
    if (!echo) return this.navigation.routes;
    const ranked = this.navigation.routes.map((route) => {
      const center = route.points.reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .divideScalar(route.points.length);
      const maximumDistance = route.points.reduce((maximum, point) => Math.max(
        maximum,
        Math.hypot(point.x - echo.x, point.z - echo.z),
      ), 0);
      return { route, distance: Math.hypot(center.x - echo.x, center.z - echo.z), maximumDistance };
    }).sort((a, b) => a.distance - b.distance);
    const contained = ranked.filter((entry) => entry.maximumDistance <= 15);
    if (contained.length) return contained.map((entry) => entry.route);
    const nearCount = Math.max(1, Math.ceil(ranked.length * 0.72));
    return ranked.slice(0, nearCount).map((entry) => entry.route);
  }

  createHaminaEchoRoute(entityIndex, placedCharacters) {
    if (this.navigation.world?.root?.name !== 'HaminaWorld') return null;
    const world = this.navigation.world;
    const echo = world.echoCenter;
    const crowdCount = Math.max(1, NEVADA_NPC_IDS.length);
    const targetAngle = 0.28 + (entityIndex / crowdCount) * Math.PI * 2;
    const angleOffsets = [0];
    for (let step = 1; step <= 5; step += 1) {
      angleOffsets.push(step * 0.035, -step * 0.035);
    }
    const safeRadius = Math.max(7.2, Math.min(10.2, world.echoSphere.radius * 1.35));
    const primaryRadius = safeRadius + (entityIndex % 2) * 1.35;
    const radii = [primaryRadius, safeRadius + 0.7, safeRadius + 2.1, safeRadius];
    for (const angleOffset of angleOffsets) {
      const angle = targetAngle + angleOffset;
      for (const radius of radii) {
        const centerX = echo.x + Math.cos(angle) * radius;
        const centerZ = echo.z + Math.sin(angle) * radius;
        const centerY = this.navigation.sampleHeight(centerX, centerZ);
        if (centerY === null) continue;
        if (placedCharacters.some((other) => Math.hypot(
          other.root.position.x - centerX, other.root.position.z - centerZ,
        ) < 2.25)) continue;

        const points = [];
        const orbitRadiusX = 0.42 + (entityIndex % 2) * 0.12;
        const orbitRadiusZ = 0.34 + (entityIndex % 3) * 0.06;
        for (let sample = 0; sample < 16; sample += 1) {
          const localAngle = (sample / 16) * Math.PI * 2;
          const x = centerX + Math.cos(localAngle) * orbitRadiusX;
          const z = centerZ + Math.sin(localAngle) * orbitRadiusZ;
          const y = this.navigation.sampleHeight(x, z);
          if (y === null) {
            points.length = 0;
            break;
          }
          points.push(new THREE.Vector3(x, y, z));
        }
        if (points.length === 16) {
          const route = this.navigation.finishRoute(points);
          route.echoRing = true;
          route.echoAngle = angle;
          return route;
        }
      }
    }
    return null;
  }

  placeCharacterAroundEcho(entity, placedCharacters = this.entities) {
    const echo = this.navigation.world.echoCenter;
    const entityIndex = placedCharacters.length;
    const haminaRoute = this.createHaminaEchoRoute(entityIndex, placedCharacters);
    if (haminaRoute) {
      entity.behavior.route = haminaRoute;
      entity.behavior.setStartDistance(entity.random() * haminaRoute.length);
      return;
    }
    const preferredDistance = 7.5 + (entityIndex % 3) * 2.25;
    const maximumDistance = 15;
    const targetAngle = 0.35 + entityIndex * 2.399963229728653;
    const findPosition = (routes, requiredClearance) => {
      let best = null;
      for (const route of routes) {
        for (let sample = 0; sample < 48; sample += 1) {
          const distance = (sample / 48) * route.length;
          const position = this.navigation.sampleRoute(route, distance, new THREE.Vector3());
          const clearance = placedCharacters.reduce((minimum, other) => Math.min(minimum,
            Math.hypot(position.x - other.root.position.x, position.z - other.root.position.z)), Infinity);
          if (clearance < requiredClearance) continue;
          const echoDistance = Math.hypot(position.x - echo.x, position.z - echo.z);
          if (echoDistance > maximumDistance) continue;
          const angle = Math.atan2(position.z - echo.z, position.x - echo.x);
          const angleDifference = Math.abs(Math.atan2(
            Math.sin(angle - targetAngle), Math.cos(angle - targetAngle),
          ));
          const score = Math.abs(echoDistance - preferredDistance) * 0.7
            + angleDifference * 1.65
            - Math.min(clearance, 4.4) * 0.85;
          if (!best || score < best.score) best = { route, distance, position, score, clearance };
        }
      }
      return best;
    };
    const preferredRoutes = this.getEchoRoutes();
    const placement = findPosition(preferredRoutes, 2.45)
      ?? findPosition(preferredRoutes, 1.3)
      ?? findPosition(preferredRoutes, 0);
    if (!placement) {
      console.warn(`[Characters] ${entity.id}: no ECHO-centered spawn found`);
      return;
    }
    entity.behavior.route = placement.route;
    if (typeof entity.behavior.setStartDistance === 'function') {
      entity.behavior.setStartDistance(placement.distance);
    } else {
      entity.behavior.distance = placement.distance;
      entity.behavior.current.copy(placement.position);
      entity.root.position.copy(placement.position);
    }
  }

  async preload() {
    if (this.nevadaBases) return this.nevadaBases;
    this.nevadaBases = await Promise.all(
      NEVADA_NPC_IDS.slice(0, 10).map((id) => BaseCharacterAsset.load(id)),
    );
    return this.nevadaBases;
  }

  async spawn(count) {
    if (count > AVAILABLE_BASES.length * 5) {
      throw new Error('검증된 캐릭터 베이스는 최대 15명입니다.');
    }
    if (!this.bases) {
      this.bases = await Promise.all(AVAILABLE_BASES.map((base) => BaseCharacterAsset.load(base)));
    }
    for (let index = 0; index < count; index += 1) {
      const baseIndex = Math.floor(index / 5);
      const base = this.bases[baseIndex];
      const id = `${base.base}${String(index % 5 + 1).padStart(2, '0')}`;
      const entity = new CharacterEntity({
        id,
        baseAsset: base,
        navigation: this.navigation,
        routeIndex: index,
        scale: VISITOR_HEIGHT / base.renderHeight,
      });
      if (this.navigation.world?.root?.name === 'NevadaWorld') {
        this.placeCharacterAroundEcho(entity);
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
      if (this.navigation.world?.root?.name === 'HaminaWorld' && index % 2 === 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
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
    // Every visitor shares the same walk → observe ECHO → walk behavior.
    for (const [index, id] of NEVADA_NPC_IDS.entries()) {
      if (this.byId.has(id)) continue;
      const baseAsset = this.nevadaBases[index % this.nevadaBases.length];
      const entity = new CharacterEntity({
        id,
        baseAsset,
        navigation: this.navigation,
        routeIndex: index % this.navigation.routes.length,
        scale: VISITOR_HEIGHT / baseAsset.renderHeight,
        nevadaNpc: true,
      });
      entity.behavior = new CharacterBehavior(entity, this.navigation, index, entity.random, {
        lookTarget: this.navigation.world.echoCenter,
        observationBias: (index % 4) / 3,
      });
      this.placeCharacterAroundEcho(entity);
      this.entities.push(entity);
      this.byId.set(id, entity);
      this.scene.add(entity.root);
    }
    this.startEchoRitual();
    console.info(`[Characters] rendered visitor height ${VISITOR_HEIGHT.toFixed(2)}m`);
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
    if (this.ritualDispersal) {
      const dispersal = this.ritualDispersal;
      dispersal.elapsed += delta;
      for (const move of dispersal.moves) {
        if (move.complete) continue;
        move.elapsed += delta;
        if (move.elapsed < move.delay) continue;
        const root = move.entity.root;
        const difference = Math.atan2(
          Math.sin(move.heading - root.rotation.y), Math.cos(move.heading - root.rotation.y),
        );
        root.rotation.y += difference * Math.min(1, delta * 5);
        if (move.elapsed < move.delay + 0.65) continue;
        if (!move.walking) {
          move.walking = true;
          move.entity.animator.play('walk');
        }
        move.progress = Math.min(move.length, move.progress + delta * move.entity.behavior.speed);
        root.position.lerpVectors(move.from, move.point,
          move.length > 0.001 ? move.progress / move.length : 1);
        if (move.progress >= move.length) {
          move.entity.behavior.route = move.route;
          move.entity.behavior.setStartDistance(move.distance);
          move.entity.ambientPose = null;
          move.entity.ambientBones = null;
          move.entity.model.position.y = 0;
          move.complete = true;
        }
      }
      if (dispersal.moves.every((move) => move.complete)) {
        this.ritualDispersal = null;
        this.danceEnabled = true;
        this.danceDirector.ensurePersistentGroup(this.entities);
      }
    }
    if (this.danceEnabled) {
      this.danceDirector.ensurePersistentGroup(this.entities);
      this.danceDirector.update(delta, this.entities);
      this.conversationDirector.update(delta, this.entities);
    }
    for (const entity of this.entities) entity.update(delta, this.camera, this.entities);
  }

  getDanceGroup(entity) { return this.danceDirector.getGroupFor(entity); }
  viewDanceGroup(group) { this.danceDirector.view(group); }
  releaseDanceGroup(group) { this.danceDirector.release(group); }
  stopDances() {
    this.danceEnabled = false;
    this.danceDirector.clear();
    this.conversationDirector.clear();
  }

  setFocused(entity) {
    if (entity?.conversation) this.conversationDirector.end(entity.conversation);
    for (const character of this.entities) {
      character.focused = character === entity;
      if (!character.focused) character.stopSpeaking();
    }
  }

  setWorldMode(mode) {
    this.stopDances();
    this.danceDirector.navigation = this.navigation;
    for (const character of this.entities) {
      character.setWorldMode(mode);
      character.behavior.allowIdle = false;
      character.behavior.state = 'walk';
      character.play('walk');
    }
    this.danceEnabled = true;
    this.danceDirector.ensurePersistentGroup(this.entities);
  }

  setLookingUp(active, selected = null) {
    if (active) this.stopDances();
    const selectedSet = selected ? new Set(selected) : null;
    for (const character of this.entities) {
      character.setLookingUp(active && (!selectedSet || selectedSet.has(character)));
    }
  }

  relocate(navigation, { preserveNevadaNpcs = false } = {}) {
    this.stopDances();
    this.ritualActive = false;
    this.ritualDispersal = null;
    if (preserveNevadaNpcs) this.clearAmbientProps();
    else this.removeNevadaNpcs();
    this.navigation = navigation;
    for (let index = 0; index < this.entities.length; index += 1) {
      const entity = this.entities[index];
      entity.navigation = navigation;
      entity.ambientPose = null;
      entity.ambientBones = null;
      entity.animator.actions.walk.setEffectiveTimeScale(1);
      entity.model.position.set(0, 0, 0);
      entity.behavior = new CharacterBehavior(entity, navigation, index, entity.random, {
        lookTarget: navigation.world.echoCenter,
        // Stagger longer and shorter observation beats through the crowd.
        observationBias: (index % 4) / 3,
      });
      entity.behavior.allowIdle = false;
      entity.setLookingUp(false);
      entity.focused = false;
      entity.root.visible = true;
    }

    const placed = [];
    for (const entity of this.entities) {
      this.placeCharacterAroundEcho(entity, placed);
      placed.push(entity);
    }
    const echoRingCount = this.entities.filter((entity) => entity.behavior.route.echoRing).length;
    console.info(`[Characters] ECHO ring routes ${echoRingCount}/${this.entities.length}`);
    console.info(`[Characters] ${this.entities.length} visitors relocated to ${navigation.world.root.name}`);
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
    this.clearAmbientProps();
  }

  clearAmbientProps() {
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
