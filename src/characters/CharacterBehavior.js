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
    this.speed = 0.58 + random() * 0.2;
    this.motionSpeed = this.speed * 0.8;
    this.preferredTrip = 4.5 + random() * 4.5;
    this.tripSpeed = this.speed;
    this.pacePhase = random() * Math.PI * 2;
    this.allowIdle = false;
    this.lookTarget = options.lookTarget?.clone() ?? null;
    this.observationBias = options.observationBias ?? 0;
    this.state = 'walk';
    this.wait = 0;
    this.walkTime = 0;
    this.observationElapsed = 0;
    this.current = new THREE.Vector3();
    this.next = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.destination = null;
    this.interest = null;
    this.blockedFor = 0;
    this.turnAmount = 0;
    this.elapsed = random() * 10;
    navigation.sampleRoute(this.route, this.distance, this.current);
    character.root.position.copy(this.current);
    character.play('walk');
  }

  setStartDistance(distance) {
    this.distance = distance;
    this.navigation.sampleRoute(this.route, distance, this.current);
    this.character.root.position.copy(this.current);
    this.destination = null;
    this.blockedFor = 0;
  }

  setInterest(center, seconds = 18) {
    this.interest = { center: center.clone(), remaining: seconds };
    this.destination = null;
  }

  clearInterest() {
    if (!this.interest) return;
    this.interest = null;
    this.destination = null;
  }

  chooseDestination(neighbors) {
    const origin = this.character.root.position;
    const heading = this.character.root.rotation.y;
    let best = null;
    for (let attempt = 0; attempt < (this.interest ? 72 : 36); attempt += 1) {
      const route = this.navigation.routes[Math.floor(this.random() * this.navigation.routes.length)];
      const distance = this.random() * route.length;
      const point = this.navigation.sampleRoute(route, distance, this.next);
      const travel = Math.hypot(point.x - origin.x, point.z - origin.z);
      if (travel < 2.4 || travel > 11.5 || isCharacterOccupied(point, this.character, neighbors, 1.75)) continue;
      if (!this.navigation.canWalkBetween(origin, point)) continue;
      const desired = Math.atan2(point.x - origin.x, point.z - origin.z);
      const turn = Math.abs(Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading)));
      const interestDistance = this.interest
        ? Math.hypot(point.x - this.interest.center.x, point.z - this.interest.center.z) : 0;
      const score = Math.abs(travel - this.preferredTrip) * 0.2
        + turn * 0.85 + this.random() * 0.65
        + interestDistance * (this.interest ? 1.35 : 0)
        + (route === this.route ? 0.2 : 0);
      if (!best || score < best.score) best = {
        route, distance, point: point.clone(), score,
      };
    }
    if (!best) {
      // A short step on the current validated loop is still preferable to
      // freezing when nearby routes have no unobstructed connection.
      for (const sign of [1, -1]) {
        const distance = this.distance + sign * Math.min(3.5, this.route.length * 0.28);
        const point = this.navigation.sampleRoute(this.route, distance, this.next);
        if (this.navigation.canWalkBetween(origin, point)
          && !isCharacterOccupied(point, this.character, neighbors, 1.5)) {
          best = { route: this.route, distance, point: point.clone() };
          break;
        }
      }
    }
    this.destination = best;
    if (best) this.tripSpeed = this.speed * (0.84 + this.random() * 0.3);
    return best;
  }

  update(delta, neighbors = []) {
    this.elapsed += delta;
    if (this.interest) {
      this.interest.remaining -= delta;
      if (this.interest.remaining <= 0) this.clearInterest();
    }
    const root = this.character.root;
    if (!this.destination) this.chooseDestination(neighbors);
    if (!this.destination) {
      this.character.animator.setLocomotionSpeed(0.3);
      return;
    }

    this.direction.subVectors(this.destination.point, root.position);
    this.direction.y = 0;
    const remaining = this.direction.length();
    if (remaining < 0.36) {
      this.route = this.destination.route;
      this.distance = this.destination.distance;
      this.destination = null;
      this.chooseDestination(neighbors);
      return;
    }
    const desired = Math.atan2(this.direction.x, this.direction.z);
    const turn = Math.atan2(Math.sin(desired - root.rotation.y), Math.cos(desired - root.rotation.y));
    this.turnAmount = THREE.MathUtils.damp(this.turnAmount,
      THREE.MathUtils.clamp(turn, -1, 1), 3, delta);
    root.rotation.y += THREE.MathUtils.clamp(turn, -delta * 2.7, delta * 2.7);
    const forward = Math.max(0.12, Math.cos(turn));
    const pace = 0.94 + Math.sin(this.elapsed * 0.7 + this.pacePhase) * 0.06;
    const targetSpeed = this.tripSpeed * pace * forward;
    this.motionSpeed = THREE.MathUtils.damp(this.motionSpeed, targetSpeed, 3.6, delta);
    const step = Math.min(remaining, Math.abs(turn) > 0.9 ? 0 : this.motionSpeed * delta);
    this.next.copy(root.position).addScaledVector(this.direction, step / remaining);
    const floor = this.navigation.sampleHeight(this.next.x, this.next.z);
    if (floor === null || !this.navigation.isClear(this.next.x, floor, this.next.z)
      || !this.navigation.isInActivityArea(this.next.x, this.next.z, 0.5)
      || isCharacterOccupied(this.next, this.character, neighbors)) {
      this.blockedFor += delta;
      this.motionSpeed = Math.max(0.22, this.motionSpeed * 0.8);
      if (this.blockedFor > 0.18) {
        this.destination = null;
        this.blockedFor = 0;
      }
    } else {
      this.blockedFor = 0;
      this.next.y = floor;
      root.position.copy(this.next);
      this.current.copy(this.next);
    }
    this.character.animator.setLocomotionSpeed(this.motionSpeed);
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
