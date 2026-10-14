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
  constructor(character, navigation, routeIndex, random) {
    this.character = character;
    this.navigation = navigation;
    this.random = random;
    this.route = navigation.getRoute(routeIndex);
    this.distance = random() * this.route.length;
    this.directionSign = 1;
    this.speed = 0.42 + random() * 0.22;
    this.allowIdle = true;
    this.state = random() < 0.24 ? 'idle' : 'walk';
    this.wait = this.state === 'idle' ? 1 + random() * 2 : 0;
    this.walkTime = 4.5 + random() * 5;
    this.current = new THREE.Vector3();
    this.next = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    navigation.sampleRoute(this.route, this.distance, this.current);
    character.root.position.copy(this.current);
    character.play(this.state);
  }

  update(delta, neighbors = []) {
    if (this.state === 'idle') {
      this.wait -= delta;
      if (this.wait > 0 && this.allowIdle) return;
      this.state = 'walk';
      this.character.play('walk');
      this.walkTime = 4.5 + this.random() * 5;
    }
    const candidateDistance = this.distance + this.directionSign * delta * this.speed;
    this.navigation.sampleRoute(this.route, candidateDistance, this.next);
    if (isCharacterOccupied(this.next, this.character, neighbors)) {
      this.state = 'idle';
      this.wait = 0.5 + this.random() * 0.8;
      this.directionSign *= -1;
      this.character.play('idle');
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
    if (this.allowIdle) {
      this.walkTime -= delta;
      if (this.walkTime <= 0) {
        this.state = 'idle';
        this.wait = 1.2 + this.random() * 2.3;
        this.character.play('idle');
      }
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
    this.state = random() < 0.45 ? 'idle' : 'walk';
    this.wait = this.state === 'idle' ? 0.6 + random() * 3.4 : 0;
    this.directionSign = random() < 0.5 ? -1 : 1;
    this.speed = 0.39 + random() * 0.21;
    this.remaining = 1.6 + random() * Math.min(4.8, this.route.length * 0.42);
    this.setStartDistance(this.distance);
    character.play(this.state);
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
    if (this.state === 'idle') {
      this.wait -= delta;
      if (this.wait > 0) return;
      this.state = 'walk';
      this.character.play('walk');
      this.directionSign = this.random() < 0.5 ? -1 : 1;
      this.remaining = 1.6 + this.random() * Math.min(4.8, this.route.length * 0.42);
    }

    const step = Math.min(this.remaining, delta * this.speed);
    const candidateDistance = this.distance + this.directionSign * step;
    this.navigation.sampleRoute(this.route, candidateDistance, this.next);
    if (isCharacterOccupied(this.next, this.character, neighbors)) {
      this.state = 'idle';
      this.wait = 0.9 + this.random() * 1.4;
      this.directionSign *= -1;
      this.character.play('idle');
      return;
    }
    this.distance = candidateDistance;
    this.remaining -= step;
    this.current.copy(this.next);
    this.character.root.position.copy(this.current);
    this.faceAlongRoute(delta);
    if (this.remaining <= 0.001) {
      this.state = 'idle';
      this.wait = 1.4 + this.random() * 3.8;
      this.character.play('idle');
    }
  }
}
