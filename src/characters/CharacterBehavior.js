import * as THREE from 'three';

export const CHARACTER_CLEARANCE = 1.4;

export function isCharacterOccupied(position, character, neighbors, clearance = CHARACTER_CLEARANCE) {
  return neighbors.some((other) => {
    if (other === character) return false;
    const occupiedPositions = [other.root.position];
    const group = other.danceGroup;
    if (group) occupiedPositions.push(group.anchors[group.members.indexOf(other)]);
    return occupiedPositions.some((occupied) => {
      const dx = occupied.x - position.x;
      const dz = occupied.z - position.z;
      const candidateDistance = dx * dx + dz * dz;
      if (candidateDistance >= clearance * clearance) return false;
      // Someone already inside a newly reserved dance spot must be allowed to leave it.
      if (character?.root?.position) {
        const currentDx = occupied.x - character.root.position.x;
        const currentDz = occupied.z - character.root.position.z;
        const currentDistance = currentDx * currentDx + currentDz * currentDz;
        if (currentDistance < clearance * clearance && candidateDistance > currentDistance + 1e-5) {
          return false;
        }
      }
      return true;
    });
  });
}

export class CharacterBehavior {
  constructor(character, navigation, routeIndex, random, options = {}) {
    this.character = character;
    this.navigation = navigation;
    this.random = random;
    this.route = navigation.getRoute(routeIndex);
    this.distance = random() * this.route.length;
    this.directionSign = 1;
    this.speed = 0.42 + random() * 0.22;
    this.allowIdle = false;
    this.lookTarget = options.lookTarget?.clone() ?? null;
    this.observationBias = options.observationBias ?? 0;
    this.state = 'walk';
    this.wait = 0;
    this.walkTime = this.nextWalkDuration();
    this.observationElapsed = 0;
    this.current = new THREE.Vector3();
    this.next = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    navigation.sampleRoute(this.route, this.distance, this.current);
    character.root.position.copy(this.current);
    character.play('walk');
  }

  setStartDistance(distance) {
    this.distance = distance;
    this.navigation.sampleRoute(this.route, distance, this.current);
    this.character.root.position.copy(this.current);
  }

  nextIdleDuration() {
    if (!this.lookTarget) return 1.2 + this.random() * 2.3;
    return 2.8 + this.observationBias * 2.2 + this.random() * 3.2;
  }

  nextWalkDuration() {
    if (!this.lookTarget) return 4.5 + this.random() * 5;
    return 2.6 + this.random() * 4.1;
  }

  faceLookTarget(delta) {
    if (!this.lookTarget) return;
    const dx = this.lookTarget.x - this.character.root.position.x;
    const dz = this.lookTarget.z - this.character.root.position.z;
    if (dx * dx + dz * dz <= 1e-5) return;
    const desired = Math.atan2(dx, dz);
    const current = this.character.root.rotation.y;
    const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
    this.character.root.rotation.y += difference * Math.min(1, delta * 2.35);
  }

  update(delta, neighbors = []) {
    const candidateDistance = this.distance + this.directionSign * delta * this.speed;
    this.navigation.sampleRoute(this.route, candidateDistance, this.next);
    if (isCharacterOccupied(this.next, this.character, neighbors)) {
      this.directionSign *= -1;
      return;
    }
    this.distance = candidateDistance;
    this.current.copy(this.next);
    this.navigation.sampleRoute(this.route, this.distance + this.directionSign * 0.08, this.next);
    this.character.root.position.copy(this.current);
    this.direction.subVectors(this.next, this.current);
    this.direction.y = 0;
    if (this.direction.lengthSq() > 1e-6) {
      const desired = Math.atan2(this.direction.x, this.direction.z);
      const current = this.character.root.rotation.y;
      const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
      this.character.root.rotation.y += difference * Math.min(1, delta * 5);
    }
  }
}

// Nevada's eight individual NPCs use the existing validated walking loops as
// short paths between destinations. This keeps every move on known terrain.
export class NevadaRoamingBehavior {
  constructor(character, navigation, routeIndex, random) {
    this.character = character;
    this.navigation = navigation;
    this.route = navigation.getRoute(routeIndex);
    this.random = random;
    this.current = new THREE.Vector3();
    this.next = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.distance = random() * this.route.length;
    this.state = 'walk';
    this.wait = 0;
    this.directionSign = random() < 0.5 ? -1 : 1;
    this.speed = 0.39 + random() * 0.21;
    this.remaining = 1.6 + random() * Math.min(4.8, this.route.length * 0.42);
    this.setStartDistance(this.distance);
    character.play('walk');
  }

  setStartDistance(distance) {
    this.distance = distance;
    this.navigation.sampleRoute(this.route, distance, this.current);
    this.character.root.position.copy(this.current);
    this.faceAlongRoute(0.016);
  }

  faceAlongRoute(delta) {
    this.navigation.sampleRoute(this.route, this.distance + this.directionSign * 0.08, this.next);
    this.direction.subVectors(this.next, this.current);
    this.direction.y = 0;
    if (this.direction.lengthSq() <= 1e-6) return;
    const desired = Math.atan2(this.direction.x, this.direction.z);
    const current = this.character.root.rotation.y;
    const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
    this.character.root.rotation.y += difference * Math.min(1, delta * 4);
  }

  update(delta, neighbors = []) {
    const step = Math.min(this.remaining, delta * this.speed);
    const candidateDistance = this.distance + this.directionSign * step;
    this.navigation.sampleRoute(this.route, candidateDistance, this.next);
    if (isCharacterOccupied(this.next, this.character, neighbors)) {
      this.directionSign *= -1;
      this.remaining = 1.6 + this.random() * Math.min(4.8, this.route.length * 0.42);
      return;
    }
    this.distance = candidateDistance;
    this.remaining -= step;
    this.current.copy(this.next);
    this.character.root.position.copy(this.current);
    this.faceAlongRoute(delta);
    if (this.remaining <= 0.001) {
      this.directionSign *= -1;
      this.remaining = 1.6 + this.random() * Math.min(4.8, this.route.length * 0.42);
    }
  }
}
