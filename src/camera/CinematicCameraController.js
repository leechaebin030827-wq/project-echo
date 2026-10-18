import * as THREE from 'three';
import {
  CAMERA_CONFIG,
  CHARACTER_CAMERA_CONFIG,
  EXPERIENCE_STATES,
} from '../config.js';
import { getEchoLaunchPose } from '../world/EchoTravelAnimator.js';

const smoothStep = (value) => value * value * (3 - 2 * value);

export class CinematicCameraController {
  constructor(camera, navigation, config = CAMERA_CONFIG) {
    this.camera = camera;
    this.navigation = navigation;
    this.config = config;
    this.state = EXPERIENCE_STATES.CAPTURE;
    this.target = new THREE.Vector3();
    this.echoCenter = new THREE.Vector3();
    this.echoSize = new THREE.Vector3();
    this.worldSize = new THREE.Vector3();
    this.focused = null;
    this.danceGroup = null;
    this.danceViewDirection = new THREE.Vector3();
    this.danceViewDistance = 0;
    this.danceHeroIndex = -1;
    this.danceHeroSide = 1;
    this.danceShotElapsed = 0;
    this.danceShotStep = 0;
    this.danceSequenceComplete = false;
    this.danceFirstHeroIndex = 0;
    this.danceMove = null;
    this.danceViewPosition = new THREE.Vector3();
    this.danceViewTarget = new THREE.Vector3();
    this.angle = 0;
    this.elapsed = 0;
    this.transition = null;
    this.drag = new THREE.Vector2();
    this.freeVelocity = new THREE.Vector3();
    this.tempA = new THREE.Vector3();
    this.tempB = new THREE.Vector3();
    this.tempC = new THREE.Vector3();
    this.focusForward = new THREE.Vector3();
    this.focusFraming = 'character';
    this.tempQuaternion = new THREE.Quaternion();
    this.onStateChange = () => {};
    this.interactiveFocus = null;
    this.interactiveOrigin = null;
    this.hoverTarget = null;
    this.hoverZoom = 0;
    this.hoverOffset = new THREE.Vector3();
    this.hoverPoint = new THREE.Vector3();
    this.hoverDesiredPoint = new THREE.Vector3();
    this.hoverPointReady = false;
    this.focusBreath = 0;
    this.focusBreathAmplitude = 0;
    this.ambientElapsed = 0;
    this.ambientOffset = new THREE.Vector3();
    this.motionRight = new THREE.Vector3();
    this.motionUp = new THREE.Vector3();
    this.motionForward = new THREE.Vector3();
    this.motionLookTarget = new THREE.Vector3();
  }

  setState(state, detail = '') {
    this.state = state;
    console.info(`[Camera] ${state}${detail ? `: ${detail}` : ''}`);
    this.onStateChange(state);
  }

  configure(world) {
    this.world = world;
    this.echoCenter.copy(world.echoCenter);
    this.echoSize.copy(world.echoSize);
    this.echoSphere = world.echoSphere;
    this.worldSize.copy(world.size);
    const horizontal = Math.max(world.size.x, world.size.z);
    this.farRadius = Math.max(
      world.root?.name === 'HaminaWorld' ? 18 : 16,
      horizontal * this.config.farOrbitRadiusScale * (world.farOrbitScale ?? 1)
        * (world.root?.name === 'HaminaWorld' ? 1 : 0.56),
    );
    this.farHeight = Math.max(
      world.bounds.max.y + (world.root?.name === 'HaminaWorld'
        ? this.config.farOrbitBoundsClearance : 1),
      this.echoCenter.y + Math.max(14, this.farRadius * 0.82),
    );
    this.nearRadius = Math.max(
      world.echoSphere.radius * this.config.nearOrbitRadiusFromEcho * (world.nearOrbitScale ?? 1)
        * (world.root?.name === 'HaminaWorld' ? 1 : 0.8),
      world.root?.name === 'HaminaWorld' ? 7.4 : 6.8,
    );
    if (world.root?.name === 'HaminaWorld') {
      this.farRadius = Math.max(
        this.nearRadius * 1.85,
        world.echoSphere.radius * 6.8,
        18,
      );
      this.farHeight = this.echoCenter.y + Math.max(
        world.echoSize.y * 2.5,
        world.echoSphere.radius * 3.9,
        23,
      );
    }
    this.nearHeight = this.echoCenter.y + Math.max(
      world.echoSphere.radius * this.config.nearOrbitHeightFromEcho,
      4.2,
    ) + (world.root?.name === 'HaminaWorld' ? 0 : -0.3);
    this.proximityThreshold = world.echoSphere.radius * 5.4;
    return this;
  }

  startIntro() {
    this.elapsed = 0;
    this.angle = -Math.PI * 0.15;
    this.focused = null;
    this.focusFraming = 'character';
    this.target.copy(this.echoCenter);
    this.setState(EXPERIENCE_STATES.INTRO_FAR_ORBIT);
    this.applyOrbitPose(this.farRadius, this.farHeight, this.angle);
  }

  startFarOrbit() { this.startIntro(); }

  zoomToEcho() {
    this.elapsed = 0;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      fromAngle: this.angle,
      duration: this.config.zoomDuration,
    };
    this.setState(EXPERIENCE_STATES.INTRO_ZOOM);
  }

  startEchoOrbit() {
    this.elapsed = 0;
    this.transition = null;
    this.setState(EXPERIENCE_STATES.ECHO_ORBIT);
  }

  getOrbitPosition(angle = this.angle, target = new THREE.Vector3()) {
    return target.set(
      this.echoCenter.x + Math.cos(angle) * this.nearRadius,
      this.nearHeight,
      this.echoCenter.z + Math.sin(angle) * this.nearRadius,
    );
  }

  applyOrbitPose(radius, height, angle) {
    this.camera.position.set(
      this.echoCenter.x + Math.cos(angle) * radius,
      height,
      this.echoCenter.z + Math.sin(angle) * radius,
    );
    this.target.copy(this.echoCenter).add(this.tempA.set(0, this.echoSize.y * 0.08, 0));
    this.camera.lookAt(this.target);
  }

  getFocusPose(entity, positionTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3()) {
    entity.getHeadWorldPosition(lookTarget);
    const faceFraming = this.focusFraming === 'face';
    lookTarget.y -= entity.height * (faceFraming
      ? 0.035
      : CHARACTER_CAMERA_CONFIG.lookTargetOffset);
    lookTarget.y += entity.height * CHARACTER_CAMERA_CONFIG.headroomRatio * 0.15;
    entity.getHeadDirection(this.focusForward);
    this.focusForward.y = 0;
    if (this.focusForward.lengthSq() < 1e-6) this.focusForward.set(0, 0, 1);
    this.focusForward.normalize().multiplyScalar(
      entity.height * this.config.portraitDistanceFromHeight * (faceFraming ? 1.8 : 1.65),
    );
    positionTarget.copy(lookTarget).add(this.focusForward);
    positionTarget.y += entity.height * (faceFraming
      ? 0.012
      : CHARACTER_CAMERA_CONFIG.verticalOffset);
    return { position: positionTarget, target: lookTarget };
  }

  keepCharacterCameraOutsideFace() {
    if (!this.focused) return;
    this.focused.getHeadWorldPosition(this.tempC);
    const minimum = this.focused.height * 1.6;
    this.tempB.subVectors(this.camera.position, this.tempC);
    const distance = this.tempB.length();
    if (distance >= minimum) return;
    if (distance > 0.001) this.tempB.multiplyScalar(1 / distance);
    else this.focused.getFaceSurfaceDirection(this.tempB);
    this.camera.position.copy(this.tempC).addScaledVector(this.tempB, minimum);
  }

  focusCharacter(entity, options = {}) {
    if (!entity) return;
    this.hoverTarget = null;
    this.danceGroup = null;
    const previous = this.focused;
    this.focused = entity;
    this.focusFraming = options.framing === 'face' ? 'face' : 'character';
    const state = previous && previous !== entity
      ? EXPERIENCE_STATES.CHARACTER_SWITCH
      : EXPERIENCE_STATES.CHARACTER_FOCUS;
    const initialPose = this.getFocusPose(entity, this.tempA, this.tempB);
    const travelDistance = this.camera.position.distanceTo(initialPose.position);
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      duration: THREE.MathUtils.clamp(
        this.config.characterTransitionDuration + travelDistance * 0.045, 1, 2.2,
      ),
      arcHeight: Math.min(1.8, travelDistance * 0.065),
      destinationEntity: entity,
    };
    this.elapsed = 0;
    this.setState(state, state === EXPERIENCE_STATES.CHARACTER_SWITCH
      ? `${previous.id} -> ${entity.id}` : entity.id);
    console.info(`[Camera] target head position: ${initialPose.target.toArray().map((value) => value.toFixed(2)).join(', ')}`);
    console.info('[Camera] focus distance:', initialPose.position.distanceTo(initialPose.target).toFixed(2));
  }

  switchCharacter(entity) { this.focusCharacter(entity); }

  getDanceGroupDistance(group, direction) {
    const halfHorizontalFov = Math.atan(
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * this.camera.aspect,
    );
    const halfWidthAtUnitDistance = Math.tan(halfHorizontalFov) * 0.9;
    if (!group.targets?.length) {
      const danceRadius = Math.min(group.focusRadius ?? group.radius, 2.7);
      return THREE.MathUtils.clamp(danceRadius / halfWidthAtUnitDistance, 6.4, 8.8);
    }
    // Dance clips extend the arms well beyond the body center.
    const bodyHalfWidth = Math.max(0.52, group.height * 0.29);
    let distance = 6.4;
    for (const point of group.targets) {
      const x = point.x - group.center.x;
      const z = point.z - group.center.z;
      const depthTowardCamera = x * direction.x + z * direction.z;
      const horizontalOffset = Math.abs(x * direction.z - z * direction.x);
      distance = Math.max(distance,
        depthTowardCamera + (horizontalOffset + bodyHalfWidth) / halfWidthAtUnitDistance);
    }
    return Math.min(distance, 13.5);
  }

  getDanceGroupPose(group, angleOffset = 0, position = new THREE.Vector3(), target = new THREE.Vector3()) {
    const member = group.members?.[this.danceHeroIndex];
    if (member) {
      const point = member.root.position;
      if (member.getHeadWorldPosition) member.getHeadWorldPosition(target);
      else target.copy(point).add(new THREE.Vector3(0, member.height * 0.78, 0));
      // The head bone gives the same reliable frontal direction used for a
      // single portrait; averaged face mesh normals can point through a cheek.
      const forward = member.getHeadDirection
        ? member.getHeadDirection(this.tempC)
        : member.getFaceSurfaceDirection
          ? member.getFaceSurfaceDirection(this.tempC)
        : this.tempC.copy(group.center).sub(point);
      forward.y = 0;
      if (forward.lengthSq() < 0.04) forward.copy(this.danceViewDirection).negate();
      forward.normalize();
      const side = this.tempB.set(-forward.z, 0, forward.x);
      // Use a longer lens instead of pushing the camera into the face mesh.
      position.copy(target).addScaledVector(forward, member.height * 3.0)
        .addScaledVector(side, member.height * 0.07 * (this.danceHeroIndex % 2 ? -1 : 1));
      position.y += member.height * 0.025;
      // Aim below the eyes so the face sits higher in the portrait frame.
      target.y -= member.height * 0.13;
      return { position, target };
    }
    const direction = this.tempC.copy(this.danceViewDirection)
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, angleOffset);
    const distance = this.getDanceGroupDistance(group, direction);
    position.copy(group.center).addScaledVector(direction, distance);
    position.y = group.center.y + group.height * 0.93;
    target.copy(group.center);
    target.y += group.height * 0.54;
    return { position, target };
  }

  keepDanceCameraOutsidePeople() {
    for (const member of this.danceGroup?.members ?? []) {
      const body = member.root.position;
      if (this.camera.position.y < body.y + member.height * 0.35
        || this.camera.position.y > body.y + member.height * 1.45) continue;
      const dx = this.camera.position.x - body.x;
      const dz = this.camera.position.z - body.z;
      const distance = Math.hypot(dx, dz);
      const minimum = Math.max(2.2, member.height * 1.25);
      if (distance >= minimum) continue;
      if (distance > 0.001) {
        this.camera.position.x = body.x + dx / distance * minimum;
        this.camera.position.z = body.z + dz / distance * minimum;
      } else {
        this.camera.position.x = body.x + this.danceViewDirection.x * minimum;
        this.camera.position.z = body.z + this.danceViewDirection.z * minimum;
      }
    }
    // During a move between dancers, another face may cross the lens even
    // while the selected dancer is safely framed.
    for (const member of this.danceGroup?.members ?? []) {
      if (member.getHeadWorldPosition) member.getHeadWorldPosition(this.tempA);
      else this.tempA.copy(member.root.position).add(this.tempC.set(0, member.height * 0.78, 0));
      this.tempB.subVectors(this.camera.position, this.tempA);
      const distance = this.tempB.length();
      const minimum = member.height * 1.8;
      if (distance >= minimum) continue;
      if (distance < 0.001) this.tempB.copy(this.danceViewDirection);
      else this.tempB.divideScalar(distance);
      this.camera.position.copy(this.tempA).addScaledVector(this.tempB, minimum);
    }
  }

  focusDanceGroup(group, selectedMember = null) {
    if (!group) return;
    this.hoverTarget = null;
    this.focused = null;
    this.danceGroup = group;
    this.danceShotElapsed = 0;
    this.danceShotStep = 0;
    this.danceSequenceComplete = false;
    this.danceMove = null;
    this.danceViewDirection.subVectors(this.camera.position, group.center).setY(0);
    if (this.danceViewDirection.lengthSq() < 1e-6) this.danceViewDirection.set(0, 0, 1);
    this.danceViewDirection.normalize();
    this.danceHeroIndex = group.members.indexOf(selectedMember);
    if (this.danceHeroIndex < 0 && group.targets?.length) {
      let closest = -Infinity;
      group.targets.forEach((point, index) => {
        const towardCamera = this.tempA.copy(point).sub(group.center)
          .dot(this.danceViewDirection);
        if (towardCamera > closest) {
          closest = towardCamera;
          this.danceHeroIndex = index;
        }
      });
    }
    this.danceFirstHeroIndex = Math.max(0, this.danceHeroIndex);
    if (this.danceHeroIndex >= 0 && group.targets?.[this.danceHeroIndex]) {
      const radial = this.tempA.copy(group.targets[this.danceHeroIndex])
        .sub(group.center).setY(0).normalize();
      const tangent = this.tempB.set(-radial.z, 0, radial.x);
      this.danceHeroSide = this.danceViewDirection.dot(tangent) >= 0 ? 1 : -1;
    }
    const initialDirection = this.danceViewDirection.clone();
    let best = null;
    for (const offset of [-Math.PI / 4, -Math.PI / 6, -Math.PI / 12,
      0, Math.PI / 12, Math.PI / 6, Math.PI / 4]) {
      const direction = initialDirection.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, offset);
      const distance = this.getDanceGroupDistance(group, direction);
      const score = distance + Math.abs(offset) * 0.35;
      if (!best || score < best.score) best = { direction, distance, score };
    }
    this.danceViewDirection.copy(best.direction);
    this.danceViewDistance = best.distance;
    const pose = this.getDanceGroupPose(group, 0, this.danceViewPosition, this.danceViewTarget);
    const travelDistance = this.camera.position.distanceTo(pose.position);
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      duration: THREE.MathUtils.clamp(1.1 + travelDistance * 0.045, 1.35, 2.5),
      arcHeight: Math.min(2.2, travelDistance * 0.075),
    };
    this.elapsed = 0;
    this.setState(EXPERIENCE_STATES.GROUP_DANCE_FOCUS, group.members.map((member) => member.id).join(', '));
  }

  setHoverTarget(target) {
    this.hoverTarget = target;
  }

  getHoverWorldPosition(target, result) {
    if (target.getHeadWorldPosition) {
      target.getHeadWorldPosition(result);
    } else if (target.center) {
      result.copy(target.center);
    } else {
      result.copy(target);
    }
    return result;
  }

  applyInteractiveMotion(delta) {
    this.ambientElapsed += delta;
    const interactiveState = [
      EXPERIENCE_STATES.ECHO_ORBIT,
      EXPERIENCE_STATES.CHARACTER_FOCUS,
      EXPERIENCE_STATES.GROUP_DANCE_FOCUS,
      EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS,
    ].includes(this.state);
    const active = interactiveState && Boolean(this.hoverTarget);
    this.hoverZoom = THREE.MathUtils.damp(this.hoverZoom, active ? 1 : 0, active ? 5.2 : 3.5, delta);
    this.hoverOffset.set(0, 0, 0);

    if (active) {
      this.getHoverWorldPosition(this.hoverTarget, this.hoverDesiredPoint);
      if (!this.hoverPointReady) {
        this.hoverPoint.copy(this.hoverDesiredPoint);
        this.hoverPointReady = true;
      } else {
        const anchorSmoothing = 1 - Math.exp(-delta * 6.5);
        this.hoverPoint.lerp(this.hoverDesiredPoint, anchorSmoothing);
      }
    }

    if (this.hoverPointReady && this.hoverZoom >= 0.0005) {
      const distance = this.camera.position.distanceTo(this.hoverPoint);
      const maxShift = this.state === EXPERIENCE_STATES.CHARACTER_FOCUS
        || this.state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS ? 0.14 : 0.46;
      const shift = THREE.MathUtils.clamp(distance * 0.024, 0.04, maxShift) * this.hoverZoom;
      this.hoverOffset.subVectors(this.hoverPoint, this.camera.position).normalize().multiplyScalar(shift);
    } else if (!active) {
      this.hoverPointReady = false;
    }

    const settledFocus = (this.state === EXPERIENCE_STATES.CHARACTER_FOCUS
      || this.state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS)
      && !this.transition;
    this.focusBreath = THREE.MathUtils.damp(
      this.focusBreath,
      settledFocus ? 1 : 0,
      settledFocus ? 2.2 : 3.2,
      delta,
    );

    const desiredBreathAmplitude = settledFocus
      ? (this.state === EXPERIENCE_STATES.CHARACTER_FOCUS
        ? THREE.MathUtils.clamp(this.camera.position.distanceTo(this.target) * 0.01, 0.018, 0.05)
        : THREE.MathUtils.clamp(this.camera.position.distanceTo(this.target) * 0.012, 0.065, 0.18))
      : 0;
    this.focusBreathAmplitude = THREE.MathUtils.damp(
      this.focusBreathAmplitude,
      desiredBreathAmplitude,
      settledFocus ? 2.2 : 3.2,
      delta,
    );

    if (this.focusBreathAmplitude >= 0.0005) {
      const amplitude = this.focusBreathAmplitude;
      const time = this.ambientElapsed;
      this.camera.lookAt(this.target);
      this.motionRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this.motionUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.motionForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.ambientOffset.set(0, 0, 0)
        .addScaledVector(this.motionRight, Math.sin(time * 0.41 + 0.4) * amplitude * 0.62)
        .addScaledVector(this.motionUp, Math.sin(time * 0.63 + 1.3) * amplitude * 0.44)
        .addScaledVector(this.motionForward, Math.sin(time * 0.29 + 2.1) * amplitude * 0.36);
      this.hoverOffset.add(this.ambientOffset);
      this.motionLookTarget.copy(this.target)
        .addScaledVector(this.motionRight, Math.sin(time * 0.37 + 2.4) * amplitude * 0.28)
        .addScaledVector(this.motionUp, Math.sin(time * 0.53 + 0.2) * amplitude * 0.16);
    }

    this.camera.position.add(this.hoverOffset);
    this.camera.lookAt(this.focusBreathAmplitude >= 0.0005 ? this.motionLookTarget : this.target);
  }

  focusInteractiveObject(region) {
    if (!region) return 0;
    this.hoverTarget = null;
    if (!this.interactiveOrigin) {
      this.interactiveOrigin = {
        position: this.camera.position.clone(),
        target: this.target.clone(),
        angle: this.angle,
      };
    }
    this.interactiveFocus = region;
    const viewDirection = this.tempA.subVectors(this.camera.position, region.center);
    if (viewDirection.lengthSq() < 1e-6) viewDirection.set(0, 0.35, 1);
    viewDirection.normalize();
    if (region.radius > 10) {
      // Approach the facade from ECHO's side, with enough lateral offset to
      // keep the ECHO out of the building's center frame.
      viewDirection.subVectors(this.echoCenter, region.center);
      viewDirection.y = 0.16;
      viewDirection.normalize();
      this.tempB.set(viewDirection.z, 0, -viewDirection.x).normalize();
      viewDirection.addScaledVector(this.tempB, 0.45).normalize();
    }
    const distance = region.name === 'Data Center'
      ? region.radius * 1.55
      : region.name === 'Cooler'
        ? Math.max(20.5, region.radius * 5.25)
        : region.name === 'Money'
          ? Math.max(9.5, Math.min(region.radius * 2.8, 38))
        : Math.max(7.5, Math.min(region.radius * 2.2, 34));
    const destination = region.center.clone().addScaledVector(viewDirection, distance);
    destination.y = Math.max(destination.y, region.bounds.min.y + region.size.y * 0.72);
    if (region.name === 'Flag') destination.y += Math.max(2.5, region.size.y * 0.4);
    const destinationTarget = region.center.clone();
    if (region.name !== 'Flag') destinationTarget.y += region.size.y * 0.06;
    const travelDistance = this.camera.position.distanceTo(destination);
    const duration = THREE.MathUtils.clamp(0.82 + travelDistance * 0.045, 1.2, 2.55);
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration,
      arcHeight: Math.min(3.4, travelDistance * 0.1),
    };
    this.elapsed = 0;
    this.setState(EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS, region.name);
    return duration;
  }

  deepenInteractiveObjectFocus(region) {
    if (!region || this.interactiveFocus !== region) return;
    const viewDirection = this.tempA.subVectors(this.camera.position, region.center);
    if (viewDirection.lengthSq() < 1e-6) viewDirection.set(0, 0.3, 1);
    viewDirection.normalize();
    const distance = region.name === 'Data Center'
      ? region.radius * 1.22
      : Math.max(4.8, region.radius * 2.15);
    const destination = region.center.clone().addScaledVector(viewDirection, distance);
    destination.y = Math.max(destination.y, region.bounds.min.y + region.size.y * 0.66);
    const destinationTarget = region.center.clone();
    destinationTarget.y += region.size.y * 0.045;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration: 1.1,
    };
    this.elapsed = 0;
  }

  returnFromInteractiveObject() {
    if (!this.interactiveOrigin) return;
    const travelDistance = this.camera.position.distanceTo(this.interactiveOrigin.position);
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination: this.interactiveOrigin.position.clone(),
      destinationTarget: this.interactiveOrigin.target.clone(),
      duration: THREE.MathUtils.clamp(0.8 + travelDistance * 0.042, 1.2, 2.4),
      arcHeight: Math.min(2.6, travelDistance * 0.08),
      orbitAngle: this.interactiveOrigin.angle,
    };
    this.interactiveFocus = null;
    this.elapsed = 0;
    this.setState(EXPERIENCE_STATES.INTERACTIVE_OBJECT_RETURN);
  }

  enterFreeRoam() {
    if (this.state !== EXPERIENCE_STATES.ECHO_ORBIT) return;
    const direction = this.tempA.subVectors(this.target, this.camera.position).normalize();
    this.freeYaw = Math.atan2(direction.x, direction.z);
    this.freePitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    this.freeVelocity.set(0, 0, 0);
    this.drag.set(0, 0);
    this.setState(EXPERIENCE_STATES.FREE_ROAM);
  }

  updateFreeRoam(deltaX, deltaY) {
    if (this.state !== EXPERIENCE_STATES.FREE_ROAM) return;
    this.drag.x += deltaX;
    this.drag.y += deltaY;
  }

  exitFreeRoam() {
    if (this.state === EXPERIENCE_STATES.FREE_ROAM) this.returnToEcho();
  }

  returnToEcho() {
    this.focused = null;
    this.danceGroup = null;
    this.interactiveFocus = null;
    this.interactiveOrigin = null;
    this.focusFraming = 'character';
    this.elapsed = 0;
    const offset = this.tempA.subVectors(this.camera.position, this.echoCenter);
    this.angle = Math.atan2(offset.z, offset.x);
    const travelDistance = this.camera.position.distanceTo(this.getOrbitPosition(this.angle, this.tempB));
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      duration: THREE.MathUtils.clamp(
        this.config.returnDuration + travelDistance * 0.038, 1.2, 2.35,
      ),
      arcHeight: Math.min(1.8, travelDistance * 0.06),
      orbitAngle: this.angle,
    };
    this.setState(EXPERIENCE_STATES.RETURN_TO_ECHO);
  }

  startWorldJumpFocus(duration = 1.2) {
    const direction = this.tempC.subVectors(this.camera.position, this.echoCenter);
    direction.y = 0;
    if (direction.lengthSq() < 0.001) direction.set(1, 0, 0);
    direction.normalize();
    this.angle = Math.atan2(direction.z, direction.x);
    const destination = this.echoCenter.clone()
      .addScaledVector(direction, Math.max(this.echoSphere.radius * 2.55, 5.5))
      .add(new THREE.Vector3(0, Math.max(this.echoSize.y * 0.42, 1.5), 0));
    const destinationTarget = this.echoCenter.clone();
    this.focused = null;
    this.elapsed = 0;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration,
      startedAt: performance.now(),
    };
    this.setState(EXPERIENCE_STATES.WORLD_JUMP_PREP);
  }

  startWorldJumpAscent(duration, height) {
    const direction = this.tempC.subVectors(this.camera.position, this.echoCenter);
    direction.y = 0;
    if (direction.lengthSq() < 0.001) direction.set(1, 0, 0);
    direction.normalize();
    const upwardViewOffset = Math.max(11, this.echoSize.y * 1.25);
    this.elapsed = 0;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination: this.echoCenter.clone()
        .addScaledVector(direction, Math.max(this.echoSphere.radius * 4.4, 18))
        .add(new THREE.Vector3(0, height - upwardViewOffset, 0)),
      destinationTarget: this.echoCenter.clone().add(new THREE.Vector3(0, height, 0)),
      duration,
      launchHeight: height,
      startedAt: performance.now(),
    };
    this.setState(EXPERIENCE_STATES.WORLD_JUMP_SKY);
  }

  holdWorldJumpSplit() {
    this.elapsed = 0;
    this.transition = null;
    this.setState(EXPERIENCE_STATES.WORLD_JUMP_SPLIT);
  }

  holdWorldJumpEcho() {
    this.elapsed = 0;
    this.transition = null;
    this.setState(EXPERIENCE_STATES.WORLD_JUMP_ECHO);
  }

  startSkyLook(duration = 1.45) {
    const direction = this.tempC.set(Math.cos(this.angle), 0, Math.sin(this.angle));
    const destination = this.echoCenter.clone()
      .addScaledVector(direction, Math.max(this.echoSphere?.radius ?? 4, 4) * 2.1)
      .add(new THREE.Vector3(0, Math.max(2.2, this.echoSize.y * 0.24), 0));
    const destinationTarget = destination.clone().add(new THREE.Vector3(
      -direction.x * 3,
      Math.max(18, this.worldSize.y * 1.35),
      -direction.z * 3,
    ));
    this.elapsed = 0;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration,
    };
    this.setState(EXPERIENCE_STATES.WORLD_JUMP_SKY);
  }

  holdWorldLoading() {
    this.elapsed = 0;
    this.transition = null;
    this.setState(EXPERIENCE_STATES.WORLD_LOADING);
  }

  startWorldSpinFocus(duration = 2.2) {
    const direction = this.tempC.subVectors(this.camera.position, this.target).setY(0);
    if (direction.lengthSq() < 0.001) direction.set(Math.cos(this.angle), 0, Math.sin(this.angle));
    direction.normalize();
    const destination = this.target.clone()
      .addScaledVector(direction, Math.max(this.echoSphere.radius * 2.6, 11.2));
    destination.y = this.target.y + Math.max(0.5, this.echoSize.y * 0.08);
    this.elapsed = 0;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget: this.target.clone(),
      duration,
      startedAt: performance.now(),
    };
    this.setState(EXPERIENCE_STATES.WORLD_LOADING);
  }

  startWorldArrival(duration = 2.4) {
    const direction = this.tempC.subVectors(this.camera.position, this.echoCenter);
    direction.y = 0;
    if (direction.lengthSq() < 0.001) direction.set(1, 0, 0);
    direction.normalize();
    this.angle = Math.atan2(direction.z, direction.x);
    const destination = new THREE.Vector3(
      this.echoCenter.x + Math.cos(this.angle) * this.nearRadius,
      this.nearHeight,
      this.echoCenter.z + Math.sin(this.angle) * this.nearRadius,
    );
    const destinationTarget = this.echoCenter.clone().add(new THREE.Vector3(0, this.echoSize.y * 0.08, 0));
    this.elapsed = 0;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration,
      startedAt: performance.now(),
    };
    this.setState(EXPERIENCE_STATES.HAMINA_ARRIVAL);
  }

  update(delta) {
    this.camera.position.sub(this.hoverOffset);
    this.hoverOffset.set(0, 0, 0);
    const portraitZoom = this.state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS
      && this.danceHeroIndex >= 0 ? 1.65
      : (this.state === EXPERIENCE_STATES.CHARACTER_FOCUS
        || this.state === EXPERIENCE_STATES.CHARACTER_SWITCH) ? 1.2 : 1;
    const nextZoom = THREE.MathUtils.damp(this.camera.zoom, portraitZoom, 3.2, delta);
    if (Math.abs(nextZoom - this.camera.zoom) > 0.0001) {
      this.camera.zoom = nextZoom;
      this.camera.updateProjectionMatrix();
    }
    this.elapsed += delta;
    if (this.state === EXPERIENCE_STATES.WORLD_JUMP_PREP
      || this.state === EXPERIENCE_STATES.WORLD_JUMP_SKY
      || this.state === EXPERIENCE_STATES.HAMINA_ARRIVAL) {
      const progress = Math.min(1, this.state === EXPERIENCE_STATES.HAMINA_ARRIVAL
        ? this.elapsed / this.transition.duration
        : this.transition.startedAt
        ? (performance.now() - this.transition.startedAt) / (this.transition.duration * 1000)
        : this.elapsed / this.transition.duration);
      if (this.state === EXPERIENCE_STATES.HAMINA_ARRIVAL) {
        const descent = smoothStep(THREE.MathUtils.clamp(progress / 0.86, 0, 1));
        const approach = smoothStep(progress);
        this.camera.position.x = THREE.MathUtils.lerp(
          this.transition.fromPosition.x, this.transition.destination.x, approach,
        );
        this.camera.position.z = THREE.MathUtils.lerp(
          this.transition.fromPosition.z, this.transition.destination.z, approach,
        );
        this.camera.position.y = THREE.MathUtils.lerp(
          this.transition.fromPosition.y, this.transition.destination.y, descent,
        );
        this.target.x = THREE.MathUtils.lerp(
          this.transition.fromTarget.x, this.transition.destinationTarget.x, approach,
        );
        this.target.z = THREE.MathUtils.lerp(
          this.transition.fromTarget.z, this.transition.destinationTarget.z, approach,
        );
        this.target.y = THREE.MathUtils.lerp(
          this.transition.fromTarget.y, this.transition.destinationTarget.y, descent,
        );
        this.camera.lookAt(this.target);
        if (progress >= 1) this.startEchoOrbit();
        return;
      }
      const eased = this.state === EXPERIENCE_STATES.WORLD_JUMP_SKY
        && this.transition.launchHeight
        ? getEchoLaunchPose(progress, this.transition.launchHeight).lift / this.transition.launchHeight
        : smoothStep(progress);
      this.camera.position.lerpVectors(this.transition.fromPosition, this.transition.destination, eased);
      this.target.lerpVectors(this.transition.fromTarget, this.transition.destinationTarget, eased);
      this.camera.lookAt(this.target);
      return;
    }

    if (this.state === EXPERIENCE_STATES.WORLD_LOADING) {
      if (this.transition) {
        const progress = Math.min(1,
          (performance.now() - this.transition.startedAt) / (this.transition.duration * 1000));
        const eased = smoothStep(progress);
        this.camera.position.lerpVectors(this.transition.fromPosition, this.transition.destination, eased);
        this.target.lerpVectors(this.transition.fromTarget, this.transition.destinationTarget, eased);
        if (progress >= 1) this.transition = null;
      }
      this.camera.lookAt(this.target);
      return;
    }

    if (this.state === EXPERIENCE_STATES.WORLD_JUMP_SPLIT
      || this.state === EXPERIENCE_STATES.WORLD_JUMP_ECHO) return;

    if (this.state === EXPERIENCE_STATES.INTRO_FAR_ORBIT) {
      const progress = Math.min(1, this.elapsed / this.config.introOrbitDuration);
      this.angle += delta * Math.PI * 2 / this.config.introOrbitDuration;
      this.applyOrbitPose(this.farRadius, this.farHeight, this.angle);
      if (progress >= 1) this.zoomToEcho();
      return;
    }

    if (this.state === EXPERIENCE_STATES.INTRO_ZOOM) {
      const progress = Math.min(1, this.elapsed / this.transition.duration);
      const eased = smoothStep(progress);
      const radius = THREE.MathUtils.lerp(this.farRadius, this.nearRadius, eased);
      const height = THREE.MathUtils.lerp(this.farHeight, this.nearHeight, eased);
      this.angle = this.transition.fromAngle + eased * 0.42;
      this.applyOrbitPose(radius, height, this.angle);
      if (progress >= 1) this.startEchoOrbit();
      return;
    }

    if (this.state === EXPERIENCE_STATES.ECHO_ORBIT) {
      this.angle += delta * this.config.echoOrbitSpeed;
      this.applyOrbitPose(this.nearRadius, this.nearHeight, this.angle);
      return;
    }

    if (this.state === EXPERIENCE_STATES.CHARACTER_FOCUS
      || this.state === EXPERIENCE_STATES.CHARACTER_SWITCH) {
      const isTransitioning = Boolean(this.transition);
      const pose = this.getFocusPose(this.focused, this.tempA, this.tempB);
      if (isTransitioning) {
        const progress = Math.min(1, this.elapsed / this.transition.duration);
        const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
        this.camera.position.lerpVectors(this.transition.fromPosition, pose.position, eased);
        this.camera.position.y += Math.sin(Math.PI * eased) * this.transition.arcHeight;
        this.target.lerpVectors(this.transition.fromTarget, pose.target, eased);
        if (progress >= 1) {
          this.transition = null;
          this.elapsed = 0;
          if (this.state === EXPERIENCE_STATES.CHARACTER_SWITCH) {
            this.setState(EXPERIENCE_STATES.CHARACTER_FOCUS, this.focused.id);
          }
        }
      } else {
        const smoothing = 1 - Math.exp(-delta * this.config.followSpeed);
        this.camera.position.lerp(pose.position, smoothing);
        this.target.lerp(pose.target, smoothing);
      }
      this.keepCharacterCameraOutsideFace();
      this.camera.lookAt(this.target);
      return;
    }

    if (this.state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS) {
      if (!this.danceGroup) {
        this.returnToEcho();
        return;
      }
      const settled = !this.transition;
      if (settled) {
        this.danceShotElapsed += delta;
        const shotDuration = this.danceShotStep === this.danceGroup.members.length ? 3.8 : 3.15;
        if (this.danceShotElapsed >= shotDuration && this.danceGroup.members.length > 1
          && !this.danceSequenceComplete) {
          this.danceShotElapsed = 0;
          if (this.danceShotStep === this.danceGroup.members.length) {
            this.danceSequenceComplete = true;
          } else {
            this.danceShotStep += 1;
            this.danceHeroIndex = this.danceShotStep === this.danceGroup.members.length
              ? -1 : (this.danceFirstHeroIndex + this.danceShotStep) % this.danceGroup.members.length;
            this.danceMove = {
              fromPosition: this.camera.position.clone(),
              fromTarget: this.target.clone(),
              elapsed: 0,
              duration: this.danceHeroIndex < 0 ? 2.1 : 1.75,
            };
          }
        }
      }
      const pose = this.getDanceGroupPose(
        this.danceGroup, this.danceHeroIndex < 0 ? this.danceShotElapsed * 0.06 : 0,
        this.danceViewPosition, this.danceViewTarget,
      );
      if (this.transition) {
        const progress = Math.min(1, this.elapsed / this.transition.duration);
        const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
        this.camera.position.lerpVectors(this.transition.fromPosition, pose.position, eased);
        this.camera.position.y += Math.sin(Math.PI * eased) * this.transition.arcHeight;
        this.target.lerpVectors(this.transition.fromTarget, pose.target, eased);
        if (progress >= 1) {
          this.transition = null;
          this.elapsed = 0;
        }
      } else if (this.danceMove) {
        const move = this.danceMove;
        move.elapsed += delta;
        const t = THREE.MathUtils.smootherstep(
          Math.min(1, move.elapsed / move.duration), 0, 1,
        );
        this.camera.position.lerpVectors(move.fromPosition, pose.position, t);
        this.camera.position.y += Math.sin(Math.PI * t) * 0.32;
        this.target.lerpVectors(move.fromTarget, pose.target, t);
        if (move.elapsed >= move.duration) this.danceMove = null;
      } else {
        const smoothing = 1 - Math.exp(-delta * 2.4);
        this.camera.position.lerp(pose.position, smoothing);
        this.target.lerp(pose.target, smoothing);
      }
      this.keepDanceCameraOutsidePeople();
      this.camera.lookAt(this.target);
      return;
    }

    if (this.state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS) {
      if (!this.transition) return;
      const progress = Math.min(1, this.elapsed / this.transition.duration);
      const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
      this.camera.position.lerpVectors(this.transition.fromPosition, this.transition.destination, eased);
      this.camera.position.y += Math.sin(Math.PI * eased) * (this.transition.arcHeight ?? 0);
      this.target.lerpVectors(this.transition.fromTarget, this.transition.destinationTarget, eased);
      this.camera.lookAt(this.target);
      if (progress >= 1) {
        this.transition = null;
        this.elapsed = 0;
      }
      return;
    }

    if (this.state === EXPERIENCE_STATES.INTERACTIVE_OBJECT_RETURN) {
      const progress = Math.min(1, this.elapsed / this.transition.duration);
      const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
      this.camera.position.lerpVectors(this.transition.fromPosition, this.transition.destination, eased);
      this.camera.position.y += Math.sin(Math.PI * eased) * (this.transition.arcHeight ?? 0);
      this.target.lerpVectors(this.transition.fromTarget, this.transition.destinationTarget, eased);
      this.camera.lookAt(this.target);
      if (progress >= 1) {
        this.angle = this.transition.orbitAngle;
        this.interactiveOrigin = null;
        this.transition = null;
        this.startEchoOrbit();
      }
      return;
    }

    if (this.state === EXPERIENCE_STATES.FREE_ROAM) {
      this.updateFreeRoamFrame(delta);
      return;
    }

    if (this.state === EXPERIENCE_STATES.RETURN_TO_ECHO) {
      const progress = Math.min(1, this.elapsed / this.transition.duration);
      const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
      const destination = this.getOrbitPosition(this.transition.orbitAngle, this.tempA);
      const destinationTarget = this.tempB.copy(this.echoCenter).add(this.tempC.set(0, this.echoSize.y * 0.08, 0));
      this.camera.position.lerpVectors(this.transition.fromPosition, destination, eased);
      this.camera.position.y += Math.sin(Math.PI * eased) * this.transition.arcHeight;
      this.target.lerpVectors(this.transition.fromTarget, destinationTarget, eased);
      this.camera.lookAt(this.target);
      if (progress >= 1) this.startEchoOrbit();
    }
  }

  updateFreeRoamFrame(delta) {
    const dx = this.drag.x;
    const dy = this.drag.y;
    this.drag.set(0, 0);
    this.freeYaw -= dx * this.config.freeRoamLookSpeed;
    this.freePitch = THREE.MathUtils.clamp(
      this.freePitch - dy * this.config.freeRoamLookSpeed,
      -0.72,
      0.72,
    );
    const forward = this.tempA.set(
      Math.sin(this.freeYaw) * Math.cos(this.freePitch),
      Math.sin(this.freePitch),
      Math.cos(this.freeYaw) * Math.cos(this.freePitch),
    ).normalize();
    const right = this.tempB.set(Math.cos(this.freeYaw), 0, -Math.sin(this.freeYaw));
    this.freeVelocity.addScaledVector(right, dx * -this.config.freeRoamMoveSpeed);
    this.freeVelocity.addScaledVector(forward, dy * -this.config.freeRoamMoveSpeed);
    this.freeVelocity.multiplyScalar(Math.exp(-delta * this.config.freeRoamDamping));
    this.camera.position.addScaledVector(this.freeVelocity, delta * 60);
    this.navigation.constrainCamera(this.camera.position);
    this.target.copy(this.camera.position).addScaledVector(forward, 12);
    this.camera.lookAt(this.target);
  }
}
