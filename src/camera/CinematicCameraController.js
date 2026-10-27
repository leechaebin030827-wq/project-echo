import * as THREE from 'three';
import {
  CAMERA_CONFIG,
  CHARACTER_CAMERA_CONFIG,
  EXPERIENCE_STATES,
} from '../config.js';
import { getEchoLaunchPose } from '../world/shared/EchoTravelAnimator.js';
import {
  sampleBillboardScan, sampleDataCenterSweep, sampleInteractiveShot, sampleMoneyOrbit,
} from './InteractiveCameraShots.js';

// Quintic easing keeps both velocity and acceleration continuous at the ends.
// Camera paths use this instead of cubic smoothstep so consecutive world and
// focus moves do not reveal a small speed kink at their hand-off frames.
const smoothStep = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

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
    this.danceAnimatedHead = new THREE.Vector3();
    this.danceTrackedHead = new THREE.Vector3();
    this.danceTrackReady = false;
    this.dancePoseForward = new THREE.Vector3();
    this.dancePoseSide = new THREE.Vector3();
    this.danceSafePosition = new THREE.Vector3();
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
    this.interactiveFilm = null;
    this.archiveDropFilm = null;
    this.archivePhotoOrigin = null;
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
    this.kobePointerLook = new THREE.Vector2();
    this.kobePointerLookTarget = new THREE.Vector2();
  }

  setState(state, detail = '') {
    this.state = state;
    console.info(`[Camera] ${state}${detail ? `: ${detail}` : ''}`);
    this.onStateChange(state);
  }

  configure(world) {
    this.world = world;
    this.interactiveFilm = null;
    this.archiveDropFilm = null;
    this.echoCenter.copy(world.echoCenter);
    this.echoSize.copy(world.echoSize);
    this.echoSphere = world.echoSphere;
    this.worldSize.copy(world.size);
    this.kobeFixedCamera = world.root?.name === 'KobeWorld';
    if (this.kobeFixedCamera) {
      this.kobeCameraPosition = world.cameraPosition.clone();
      this.kobeCameraTarget = world.cameraTarget.clone();
      this.kobePointerLook.set(0, 0);
      this.kobePointerLookTarget.set(0, 0);
    }
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
    // Nevada and Hamina now finish their entry on the same ECHO-relative
    // distance and elevation. World-specific azimuths remain intact so each
    // world's authored landmarks retain their requested left/right framing.
    const matchedLandEntry = world.root?.name === 'NevadaWorld'
      || world.root?.name === 'HaminaWorld';
    this.nearRadius = (matchedLandEntry
      ? this.config.landNearOrbitRadius : this.config.nearOrbitRadius) ?? Math.max(
      world.echoSphere.radius * this.config.nearOrbitRadiusFromEcho,
      this.config.nearOrbitMinimumRadius,
    );
    this.orbitTargetHeightRatio = world.root?.name === 'NevadaWorld'
      ? this.config.nevadaOrbitTargetHeightRatio : 0.08;
    this.nearHeight = this.echoCenter.y + Math.max(
      world.echoSphere.radius * this.config.nearOrbitHeightFromEcho,
      4,
    ) + (matchedLandEntry
      ? this.config.landNearOrbitHeightOffset : this.config.nearOrbitHeightOffset);
    if (matchedLandEntry) {
      // Both land worlds use the same entry distance from ECHO.
      this.farRadius = this.config.landIntroRadius;
      this.farHeight = this.echoCenter.y
        + (this.nearHeight - this.echoCenter.y) * this.config.landIntroHeightFromNear;
    }
    this.nevadaIntroAngle = null;
    this.nevadaIntroTarget = null;
    if (world.root?.name === 'NevadaWorld' && world.interactiveRegions?.length) {
      const dataCenter = world.interactiveRegions.find((region) => region.name === 'Data Center');
      const coolers = world.interactiveRegions.filter((region) => region.name === 'Cooler');
      if (dataCenter && coolers.length) {
        const coolerCenter = coolers.reduce(
          (center, region) => center.add(region.center), new THREE.Vector3(),
        ).divideScalar(coolers.length);
        this.nevadaIntroTarget = dataCenter.center.clone().add(coolerCenter).multiplyScalar(0.5);
        this.nevadaIntroTarget.y = this.echoCenter.y + this.echoSize.y * 0.08;
        const probe = this.camera.clone();
        probe.zoom = 1;
        probe.updateProjectionMatrix();
        const introTarget = this.nevadaIntroTarget;
        let best = null;
        for (let step = 0; step < 720; step += 1) {
          const angle = (step / 720) * Math.PI * 2;
          probe.position.set(
            this.echoCenter.x + Math.cos(angle) * this.farRadius,
            this.farHeight,
            this.echoCenter.z + Math.sin(angle) * this.farRadius,
          );
          probe.lookAt(this.echoCenter);
          probe.updateMatrixWorld(true);
          const dataScreen = dataCenter.center.clone().project(probe);
          const coolerScreen = coolerCenter.clone().project(probe);
          const separation = coolerScreen.x - dataScreen.x;
          if (dataScreen.z < -1 || dataScreen.z > 1
            || coolerScreen.z < -1 || coolerScreen.z > 1
            || separation < 0.12) continue;
          const edgePenalty = Math.max(0, Math.abs(dataScreen.x) - 0.94)
            + Math.max(0, Math.abs(coolerScreen.x) - 0.94);
          const screenCenter = (dataScreen.x + coolerScreen.x) * 0.5;
          const score = Math.abs(screenCenter) * 1.4
            + Math.abs(separation - 0.84)
            + Math.abs(dataScreen.y - coolerScreen.y) * 0.08
            + edgePenalty * 6;
          if (!best || score < best.score) {
            best = { angle, score, dataX: dataScreen.x, coolerX: coolerScreen.x };
          }
        }
        if (best) {
          this.nevadaIntroAngle = best.angle;
          console.info(`[Camera] Nevada intro angle ${(best.angle * 180 / Math.PI).toFixed(1)}°, data ${best.dataX.toFixed(2)}, cooler ${best.coolerX.toFixed(2)}`);
        }
      }
    }
    this.haminaArrivalAngle = null;
    if (world.root?.name === 'HaminaWorld' && world.timerBounds) {
      const probe = this.camera.clone();
      probe.zoom = 1;
      probe.updateProjectionMatrix();
      const timerCorners = [];
      for (const x of [world.timerBounds.min.x, world.timerBounds.max.x]) {
        for (const y of [world.timerBounds.min.y, world.timerBounds.max.y]) {
          for (const z of [world.timerBounds.min.z, world.timerBounds.max.z]) {
            timerCorners.push(new THREE.Vector3(x, y, z));
          }
        }
      }
      const arrivalTarget = this.echoCenter.clone().add(new THREE.Vector3(0, this.echoSize.y * 0.08, 0));
      const projectLeftEdge = (angle) => {
        probe.position.set(
          this.echoCenter.x + Math.cos(angle) * this.nearRadius,
          this.nearHeight,
          this.echoCenter.z + Math.sin(angle) * this.nearRadius,
        );
        probe.lookAt(arrivalTarget);
        probe.updateMatrixWorld(true);
        let left = Infinity;
        let visibleDepth = false;
        for (const corner of timerCorners) {
          const projected = corner.clone().project(probe);
          if (projected.z >= -1 && projected.z <= 1) visibleDepth = true;
          left = Math.min(left, projected.x);
        }
        return visibleDepth ? left : Infinity;
      };
      let best = null;
      for (let step = 0; step < 720; step += 1) {
        const angle = (step / 720) * Math.PI * 2;
        const leftEdge = projectLeftEdge(angle);
        const nextLeftEdge = projectLeftEdge(angle + 0.01);
        if (!Number.isFinite(leftEdge) || nextLeftEdge >= leftEdge) continue;
        const score = Math.abs(leftEdge - 1.03);
        if (!best || score < best.score) best = { angle, score, leftEdge };
      }
      if (best) {
        this.haminaArrivalAngle = best.angle;
        console.info(`[Camera] Hamina landing angle ${(best.angle * 180 / Math.PI).toFixed(1)}°, timer edge ${best.leftEdge.toFixed(2)}`);
      }
    }
    this.proximityThreshold = world.echoSphere.radius * 5.4;
    return this;
  }

  applyKobeCamera() {
    const breath = this.elapsed;
    const panicFollow = this.world?.cameraFollowOffset ?? 0;
    this.camera.position.copy(this.kobeCameraPosition);
    this.camera.position.x -= panicFollow;
    this.camera.position.y += Math.sin(breath * 0.72) * 0.018;
    this.camera.position.z += Math.sin(breath * 0.47 + 0.8) * 0.012;
    this.camera.position.y += this.kobePointerLook.y * 0.025;
    this.camera.position.z -= this.kobePointerLook.x * 0.05;
    this.target.copy(this.kobeCameraTarget);
    this.target.x -= panicFollow;
    this.target.y += Math.sin(breath * 0.63 + 1.4) * 0.012;
    this.target.z += Math.sin(breath * 0.41) * 0.01;
    this.target.y += this.kobePointerLook.y * 0.24;
    this.target.z -= this.kobePointerLook.x * 0.46;
    this.camera.lookAt(this.target);
    const departureFov = this.world?.tunnelExitFov;
    if (Number.isFinite(departureFov) && Math.abs(this.camera.fov - departureFov) > .01) {
      this.camera.fov = departureFov;
      this.camera.updateProjectionMatrix();
    }
  }

  setKobePointerLook(normalizedX, normalizedY = 0) {
    if (!this.kobeFixedCamera) return;
    this.kobePointerLookTarget.set(
      THREE.MathUtils.clamp(normalizedX, -1, 1),
      THREE.MathUtils.clamp(normalizedY, -1, 1),
    );
  }

  clearKobePointerLook() {
    this.kobePointerLookTarget.set(0, 0);
  }

  startIntro() {
    this.elapsed = 0;
    if (this.kobeFixedCamera) {
      this.transition = null;
      this.focused = null;
      this.setState(EXPERIENCE_STATES.ECHO_ORBIT);
      this.applyKobeCamera();
      return;
    }
    const stopAngle = Number.isFinite(this.nevadaIntroAngle)
      ? this.nevadaIntroAngle : -Math.PI * 0.15;
    this.angle = stopAngle - Math.PI * 2;
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

  startEchoRitualSpin(entities) {
    if (this.state !== EXPERIENCE_STATES.ECHO_ORBIT || !entities.length) return false;
    const nearestIndex = entities.reduce((best, entity, index) => {
      const angle = Math.atan2(
        entity.root.position.z - this.echoCenter.z,
        entity.root.position.x - this.echoCenter.x,
      );
      const difference = Math.abs(Math.atan2(
        Math.sin(angle - this.angle), Math.cos(angle - this.angle),
      ));
      return difference < best.difference ? { index, difference } : best;
    }, { index: 0, difference: Infinity }).index;
    const shots = Array.from({ length: 5 }, (_, index) =>
      entities[(nearestIndex + index * 3) % entities.length]);
    this.ritualSpin = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      shots,
      shotDuration: 3.4,
      activeShot: 0,
      blendDuration: 0.82,
      blendFromPosition: this.camera.position.clone(),
      blendFromTarget: this.target.clone(),
    };
    this.elapsed = 0;
    this.transition = null;
    this.setState(EXPERIENCE_STATES.ECHO_RITUAL_SPIN);
    return true;
  }

  getOrbitPosition(angle = this.angle, target = new THREE.Vector3()) {
    return target.set(
      this.echoCenter.x + Math.cos(angle) * this.nearRadius,
      this.nearHeight,
      this.echoCenter.z + Math.sin(angle) * this.nearRadius,
    );
  }

  applyOrbitPose(radius, height, angle, targetOverride = null) {
    this.camera.position.set(
      this.echoCenter.x + Math.cos(angle) * radius,
      height,
      this.echoCenter.z + Math.sin(angle) * radius,
    );
    if (targetOverride) this.target.copy(targetOverride);
    else this.target.copy(this.echoCenter).add(this.tempA.set(
      0, this.echoSize.y * this.orbitTargetHeightRatio, 0,
    ));
    this.camera.lookAt(this.target);
  }

  getFocusPose(entity, positionTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3()) {
    entity.getHeadWorldPosition(lookTarget);
    const faceFraming = this.focusFraming === 'face';
    lookTarget.y -= entity.height * (faceFraming ? 0.035 : 0.1);
    entity.getHeadDirection(this.focusForward);
    this.focusForward.y = 0;
    if (this.focusForward.lengthSq() < 1e-6) this.focusForward.set(0, 0, 1);
    this.focusForward.normalize().multiplyScalar(
      entity.height * this.config.portraitDistanceFromHeight * (faceFraming ? 0.88 : 1.08),
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
    const minimum = this.focused.height * (this.focusFraming === 'face' ? 0.92 : 1.02);
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
      // Follow the filtered animated head anchor. The filter is updated once
      // per frame below, so the portrait breathes with the dancer without
      // inheriting the raw head-bone jitter that previously shook the camera.
      if (this.danceTrackReady) target.copy(this.danceTrackedHead);
      else {
        target.copy(point);
        target.y += member.height * 0.83;
      }
      const forward = member.getFaceSurfaceDirection
        ? member.getFaceSurfaceDirection(this.dancePoseForward)
        : this.dancePoseForward.set(
          Math.sin(member.root.rotation.y), 0, Math.cos(member.root.rotation.y),
        );
      forward.y = 0;
      if (forward.lengthSq() < 0.04) forward.copy(this.danceViewDirection).negate();
      forward.normalize();
      const side = this.dancePoseSide.set(-forward.z, 0, forward.x);
      // Use a longer lens instead of pushing the camera into the face mesh.
      position.copy(target).addScaledVector(forward, member.height * 3.0)
        .addScaledVector(side, member.height * 0.07 * (this.danceHeroIndex % 2 ? -1 : 1));
      position.y += member.height * 0.025;
      // Aim below the eyes so the face sits higher in the portrait frame.
      target.y -= member.height * 0.20;
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

  keepDanceCameraOutsidePeople(delta) {
    this.danceSafePosition.copy(this.camera.position);
    for (const member of this.danceGroup?.members ?? []) {
      const body = member.root.position;
      if (this.danceSafePosition.y < body.y + member.height * 0.35
        || this.danceSafePosition.y > body.y + member.height * 1.45) continue;
      const dx = this.danceSafePosition.x - body.x;
      const dz = this.danceSafePosition.z - body.z;
      const distance = Math.hypot(dx, dz);
      const minimum = Math.max(2.2, member.height * 1.25);
      if (distance >= minimum) continue;
      if (distance > 0.001) {
        this.danceSafePosition.x = body.x + dx / distance * minimum;
        this.danceSafePosition.z = body.z + dz / distance * minimum;
      } else {
        this.danceSafePosition.x = body.x + this.danceViewDirection.x * minimum;
        this.danceSafePosition.z = body.z + this.danceViewDirection.z * minimum;
      }
    }
    // During a move between dancers, another face may cross the lens even
    // while the selected dancer is safely framed.
    for (const member of this.danceGroup?.members ?? []) {
      this.tempA.copy(member.root.position);
      this.tempA.y += member.height * 0.83;
      this.tempB.subVectors(this.danceSafePosition, this.tempA);
      const distance = this.tempB.length();
      const minimum = member.height * 1.8;
      if (distance >= minimum) continue;
      if (distance < 0.001) this.tempB.copy(this.danceViewDirection);
      else this.tempB.divideScalar(distance);
      this.danceSafePosition.copy(this.tempA).addScaledVector(this.tempB, minimum);
    }
    // Resolve an obstruction over several frames. The old hard assignment
    // produced a one-frame camera jump whenever a dancer crossed the safety
    // radius during a shot change.
    this.camera.position.lerp(
      this.danceSafePosition,
      1 - Math.exp(-Math.min(delta, 0.05) * 11),
    );
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
    this.danceTrackReady = false;
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
    if (this.kobeFixedCamera) return;
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
      && !this.transition && !this.archivePhotoOrigin && !this.archiveDropFilm;
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
    this.interactiveFilm = null;
    this.archiveDropFilm = null;
    const flagFocus = region.cameraMode === 'flag' || region.name === 'Flag';
    const coolerFocus = region.name === 'Cooler';
    const haminaCoolerFocus = region.cameraMode === 'hamina-cooler';
    const kobePosterFocus = region.cameraMode === 'kobe-poster';
    const focusCenter = region.focusTarget ?? region.center;
    const focusBounds = region.focusBounds ?? region.bounds;
    const focusSize = region.focusSize ?? region.size;
    const viewDirection = this.tempA.subVectors(this.camera.position, focusCenter);
    if (viewDirection.lengthSq() < 1e-6) viewDirection.set(0, 0.35, 1);
    if (flagFocus) viewDirection.y = 0;
    viewDirection.normalize();
    if (kobePosterFocus && region.focusDirection) {
      viewDirection.copy(region.focusDirection).normalize();
    } else if (haminaCoolerFocus) {
      // Always show the machinery from its open ECHO-facing side. Depending
      // on the orbit angle, using the current camera direction could otherwise
      // place the lens behind the facility or out over the sea.
      viewDirection.subVectors(this.echoCenter, focusCenter);
      viewDirection.y = 0.13;
      viewDirection.normalize();
    } else if (region.cameraMode === 'timer' && region.focusDirection) {
      viewDirection.copy(region.focusDirection).setY(0.08).normalize();
    } else if (!flagFocus && !coolerFocus && region.radius > 10) {
      // Approach the facade from ECHO's side, with enough lateral offset to
      // keep the ECHO out of the building's center frame.
      viewDirection.subVectors(this.echoCenter, region.center);
      viewDirection.y = 0.16;
      viewDirection.normalize();
      this.tempB.set(viewDirection.z, 0, -viewDirection.x).normalize();
      viewDirection.addScaledVector(this.tempB, 0.45).normalize();
    }
    const distance = flagFocus
      ? Math.max(5.6, Math.min(Math.max(focusSize.x, focusSize.z) * 2.3, 9.5))
      : haminaCoolerFocus
        ? Math.max(9, Math.min((region.focusRadius ?? region.radius) * 1.45, 18))
      : kobePosterFocus
        ? region.focusDistance
      : region.name === 'Data Center'
      ? (region.focusDistance ?? region.radius * 1.55)
      : region.cameraMode === 'timer'
        ? region.focusDistance
      : region.name === 'Cooler'
        ? region.focusRadius
          ? Math.max(8, Math.min(region.focusRadius * 1.5, 24))
          : Math.max(5.5, Math.min(region.radius * 1.7, 11))
        : region.name === 'Money'
          ? Math.max(9.5, Math.min(region.radius * 2.8, 38))
        : Math.max(7.5, Math.min(region.radius * 2.2, 34));
    const destination = focusCenter.clone().addScaledVector(viewDirection, distance);
    if (kobePosterFocus) destination.y = focusCenter.y;
    else if (flagFocus) destination.y = Math.max(focusBounds.min.y + 3.5,
      focusCenter.y - Math.max(1.4, focusSize.y * 0.18));
    else if (coolerFocus) destination.y = focusCenter.y + Math.max(5, focusSize.y * 0.65);
    else if (region.cameraMode === 'timer') destination.y = focusCenter.y + 0.65;
    else destination.y = Math.max(destination.y, focusBounds.min.y + focusSize.y * 0.72);
    const destinationTarget = focusCenter.clone();
    if (!flagFocus && !kobePosterFocus) {
      destinationTarget.y += focusSize.y * (coolerFocus ? 0.1 : 0.06);
    }
    if (region.name === 'Billboard') {
      const graphic = region.meshes?.[0];
      graphic?.updateWorldMatrix(true, false);
      const axis = graphic
        ? new THREE.Vector3(1, 0, 0).transformDirection(graphic.matrixWorld).setY(0)
        : new THREE.Vector3(viewDirection.z, 0, -viewDirection.x);
      axis.normalize();
      const screenRight = new THREE.Vector3(viewDirection.z, 0, -viewDirection.x);
      if (axis.dot(screenRight) < 0) axis.negate();
      const span = focusSize.x * Math.abs(axis.x) + focusSize.z * Math.abs(axis.z);
      destinationTarget.addScaledVector(axis, -span * 0.3);
      destination.addScaledVector(axis, -span * 0.34);
    }
    const travelDistance = this.camera.position.distanceTo(destination);
    const duration = coolerFocus
      ? THREE.MathUtils.clamp(1.35 + travelDistance * 0.045, 2.1, 3.2)
      : THREE.MathUtils.clamp(0.82 + travelDistance * 0.045, 1.2, 2.55);
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration,
      // Poster shots must stay inside the Kobe tunnel. The shared cinematic
      // arc can lift long-distance approaches through the tunnel ceiling.
      arcHeight: flagFocus || kobePosterFocus ? 0 : Math.min(3.4, travelDistance * 0.1),
      filmEntry: true,
    };
    this.elapsed = 0;
    this.setState(EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS, region.name);
    return duration;
  }

  deepenInteractiveObjectFocus(region) {
    if (!region || this.interactiveFocus !== region) return;
    const flagFocus = region.cameraMode === 'flag' || region.name === 'Flag';
    const haminaCoolerFocus = region.cameraMode === 'hamina-cooler';
    const focusCenter = region.focusTarget ?? region.center;
    const focusBounds = region.focusBounds ?? region.bounds;
    const focusSize = region.focusSize ?? region.size;
    const viewDirection = this.tempA.subVectors(this.camera.position, focusCenter);
    if (viewDirection.lengthSq() < 1e-6) viewDirection.set(0, 0.3, 1);
    if (flagFocus) viewDirection.y = 0;
    viewDirection.normalize();
    const distance = flagFocus
      ? Math.max(5, Math.min(Math.max(focusSize.x, focusSize.z) * 1.85, 8.2))
      : haminaCoolerFocus
        ? Math.max(7.5, Math.min((region.focusRadius ?? region.radius) * 1.15, 14))
      : region.name === 'Data Center'
      ? region.radius * 1.22
      : Math.max(4.8, region.radius * 2.15);
    const destination = focusCenter.clone().addScaledVector(viewDirection, distance);
    if (flagFocus) destination.y = Math.max(focusBounds.min.y + 1.7,
      focusCenter.y - Math.max(2.5, focusSize.y * 0.45));
    else if (region.name === 'Cooler') destination.y = focusCenter.y + Math.max(4.2, focusSize.y * 0.95);
    else destination.y = Math.max(destination.y, focusBounds.min.y + focusSize.y * 0.66);
    const destinationTarget = focusCenter.clone();
    if (!flagFocus) destinationTarget.y += focusSize.y * 0.045;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration: 1.1,
    };
    this.elapsed = 0;
  }

  startFlagWorldSweep(overviewTargets) {
    const film = this.interactiveFilm;
    if (film?.region.cameraMode !== 'flag' && film?.region.name !== 'Flag') return;
    const targets = (Array.isArray(overviewTargets) ? overviewTargets : [overviewTargets])
      .filter(Boolean);
    if (!targets.length) return;
    const flagCenter = film.region.focusTarget ?? film.region.center;
    const worldCenter = targets[0].clone().add(new THREE.Vector3(0, 3.5, 0));
    const away = this.camera.position.clone().sub(worldCenter).setY(0);
    if (away.lengthSq() < 0.001) away.copy(film.horizontalOutward);
    away.normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), away).normalize();
    const retreatDistance = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(worldCenter) * 0.16, 4.5, 8.5);
    const panoramaSpan = THREE.MathUtils.clamp(
      Math.max(this.worldSize.x, this.worldSize.z) * 0.055, 3.5, 5);
    const lateralTravel = THREE.MathUtils.clamp(panoramaSpan * 0.3, 1.8, 2.8);
    const rear = this.camera.position.clone().addScaledVector(away, retreatDistance);
    rear.y += 3;
    const leftPosition = rear.clone().addScaledVector(right, -lateralTravel);
    const rightPosition = rear.clone().addScaledVector(right, lateralTravel);
    const panoramaCenter = worldCenter.clone().lerp(flagCenter, 0.82);
    const leftTarget = panoramaCenter.clone().addScaledVector(right, -panoramaSpan);
    const rightTarget = panoramaCenter.clone().addScaledVector(right, panoramaSpan);
    film.flagSweep = {
      startedAt: film.elapsed,
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      leftPosition, rightPosition, leftTarget, rightTarget,
    };
  }

  focusArchiveDrop({ launch, echo, groundY, outward, sky }) {
    if (!launch || !echo || this.state !== EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS) return;
    const viewOutward = outward?.clone() ?? this.tempA.subVectors(this.camera.position, launch).setY(0).normalize();
    if (viewOutward.lengthSq() < 0.001) viewOutward.set(0, 0, 1);
    const side = new THREE.Vector3(0, 1, 0).cross(viewOutward).normalize();
    if (side.dot(this.camera.position.clone().sub(launch)) < 0) side.negate();
    const destination = launch.clone().addScaledVector(viewOutward, 6.5)
      .addScaledVector(side, 5);
    destination.y = groundY + 1.85;
    const destinationTarget = launch.clone();
    destinationTarget.y += 12;
    const widePosition = echo.clone().addScaledVector(viewOutward, 13.5)
      .addScaledVector(side, 4.5);
    widePosition.y = groundY + 7.2;
    const wideTarget = echo.clone();
    wideTarget.y = groundY + 0.8;
    this.archiveDropFilm = {
      lowPosition: destination.clone(), lowTarget: destinationTarget.clone(),
      skyTarget: sky?.clone() ?? destinationTarget.clone(),
      widePosition, wideTarget,
    };
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration: 1.05,
    };
    this.elapsed = 0;
  }

  applyInteractiveFilm(delta, archive = null) {
    if (this.state !== EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS
      || !this.interactiveFocus || this.transition || this.archivePhotoOrigin) return;
    if (this.interactiveFocus.name === 'Cooler'
      || this.interactiveFocus.cameraMode === 'kobe-poster') return;

    if (this.archiveDropFilm && (archive?.dropActive || archive?.settledHold)) {
      const fall = this.archiveDropFilm;
      const age = archive.dropElapsed;
      const rise = THREE.MathUtils.smootherstep(age, 1.05, 4.2);
      const settle = THREE.MathUtils.smootherstep(age, 4.2, 8.2);
      const dolly = THREE.MathUtils.smootherstep(age, 1.05, 7.8);
      this.camera.position.lerpVectors(fall.lowPosition, fall.widePosition, dolly);
      this.target.lerpVectors(fall.lowTarget, fall.skyTarget, rise)
        .lerp(fall.wideTarget, settle);
      this.camera.lookAt(this.target);
      return;
    }

    const film = this.interactiveFilm;
    if (!film || film.region !== this.interactiveFocus) return;
    film.elapsed += delta;
    if (film.region.name === 'Billboard') {
      const shot = sampleBillboardScan(film.elapsed);
      this.target.copy(film.target)
        .addScaledVector(film.billboardAxis, film.billboardSpan * shot.across);
      this.camera.position.copy(film.target)
        .addScaledVector(film.billboardAxis, film.billboardSpan * shot.cameraAcross)
        .addScaledVector(film.outward, Math.max(film.minimumDistance, film.distance * shot.distance))
        .addScaledVector(film.up, film.distance * shot.height);
      this.camera.position.y = Math.max(this.camera.position.y, film.region.bounds.min.y + 1.3);
      this.camera.lookAt(this.target);
      this.camera.rotateZ(shot.tilt);
      return;
    }
    if (film.region.name === 'Data Center') {
      const shot = sampleDataCenterSweep(film.elapsed);
      const radius = Math.max(film.minimumDistance, film.horizontalDistance * shot.distance);
      this.target.copy(film.target)
        .addScaledVector(film.horizontalRight, film.region.size.x * shot.angle * 0.035);
      this.camera.position.copy(this.target)
        .addScaledVector(film.horizontalOutward, Math.cos(shot.angle) * radius)
        .addScaledVector(film.horizontalRight, Math.sin(shot.angle) * radius);
      this.camera.position.y += film.verticalOffset + film.distance * shot.height;
      this.camera.lookAt(this.target);
      return;
    }
    if (film.region.name === 'Money') {
      const shot = sampleMoneyOrbit(film.elapsed);
      const radial = Math.max(film.minimumDistance, film.horizontalDistance * shot.distance);
      this.target.copy(film.target);
      if (film.region.interestCenter) this.target.lerp(film.region.interestCenter, shot.targetBlend);
      this.camera.position.copy(this.target)
        .addScaledVector(film.horizontalOutward, Math.cos(shot.angle) * radial)
        .addScaledVector(film.horizontalRight, Math.sin(shot.angle) * radial);
      this.camera.position.y += film.verticalOffset + film.distance * shot.height;
      this.camera.lookAt(this.target);
      return;
    }
    if (film.region.cameraMode === 'flag' || film.region.name === 'Flag') {
      if (film.flagSweep) {
        const sweep = film.flagSweep;
        const age = film.elapsed - sweep.startedAt;
        const retreat = THREE.MathUtils.smootherstep(age, 0, 1.5);
        const scanAge = Math.max(0, age - 1.5);
        const scan = (1 - Math.cos(scanAge * Math.PI * 2 / 6.4)) * 0.5;
        this.camera.position.lerpVectors(sweep.fromPosition, sweep.leftPosition, retreat)
          .lerp(sweep.rightPosition, scan);
        this.target.lerpVectors(sweep.fromTarget, sweep.leftTarget, retreat)
          .lerp(sweep.rightTarget, scan);
        this.camera.lookAt(this.target);
        return;
      }
      const shot = sampleInteractiveShot('Flag', film.elapsed);
      const radius = Math.max(film.minimumDistance, film.horizontalDistance * shot.distance);
      this.target.copy(film.target);
      this.camera.position.copy(this.target)
        .addScaledVector(film.horizontalOutward, radius)
        .addScaledVector(film.horizontalRight, film.distance * shot.side);
      this.camera.position.y = Math.max(film.region.bounds.min.y + 1.6,
        film.target.y + film.verticalOffset + film.distance * shot.height);
      this.camera.lookAt(this.target);
      return;
    }
    const shot = sampleInteractiveShot(film.region.name, film.elapsed);
    const distance = Math.max(film.minimumDistance, film.distance * shot.distance);
    this.camera.position.copy(film.target)
      .addScaledVector(film.outward, distance)
      .addScaledVector(film.right, film.distance * shot.side)
      .addScaledVector(film.up, film.distance * shot.height);
    this.camera.position.y = Math.max(
      this.camera.position.y, (film.region.focusBounds ?? film.region.bounds).min.y + 1.3,
    );
    this.target.copy(film.target)
      .addScaledVector(film.right, film.distance * shot.side * 0.16)
      .addScaledVector(film.up, film.distance * shot.height * 0.16);
    this.camera.lookAt(this.target);
  }

  focusArchivePhoto(mesh) {
    if (!mesh || this.archivePhotoOrigin) return;
    this.archivePhotoOrigin = {
      position: this.camera.position.clone(),
      target: this.target.clone(),
      up: this.camera.up.clone(),
      state: this.state,
    };
    const photoUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion).normalize();
    const size = new THREE.Vector3();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.boundingBox.getSize(size);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) * 0.5;
    const aspect = this.camera.aspect;
    const distance = Math.max(
      size.y / (2 * Math.tan(halfFov)),
      size.x / (2 * Math.tan(halfFov) * aspect),
    ) * 1.28 / this.camera.zoom;
    const destination = mesh.position.clone().add(new THREE.Vector3(0, Math.max(distance, 1.1), 0));
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      fromUp: this.camera.up.clone(),
      destination,
      destinationTarget: mesh.position.clone(),
      destinationUp: photoUp,
      duration: 1.2,
      archivePhoto: true,
    };
    this.elapsed = 0;
    this.setState(EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS, 'Archive Photo');
  }

  returnFromArchivePhoto({ instant = false } = {}) {
    const origin = this.archivePhotoOrigin;
    if (!origin) return;
    this.archivePhotoOrigin = null;
    if (instant) {
      this.camera.up.copy(origin.up);
      this.transition = null;
      this.setState(origin.state);
      return;
    }
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      fromUp: this.camera.up.clone(),
      destination: origin.position,
      destinationTarget: origin.target,
      destinationUp: origin.up,
      duration: 1.05,
      archiveReturnState: origin.state,
    };
    this.elapsed = 0;
  }

  returnFromInteractiveObject() {
    if (!this.interactiveOrigin) return;
    const travelDistance = this.camera.position.distanceTo(this.interactiveOrigin.position);
    const kobePosterFocus = this.interactiveFocus?.cameraMode === 'kobe-poster';
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination: this.interactiveOrigin.position.clone(),
      destinationTarget: this.interactiveOrigin.target.clone(),
      duration: THREE.MathUtils.clamp(0.8 + travelDistance * 0.042, 1.2, 2.4),
      // Keep the reverse trip inside the tunnel as well. Distant posters make
      // the default return arc tall enough to briefly expose the exterior.
      arcHeight: kobePosterFocus ? 0 : Math.min(2.6, travelDistance * 0.08),
      orbitAngle: this.interactiveOrigin.angle,
    };
    this.interactiveFocus = null;
    this.interactiveFilm = null;
    this.archiveDropFilm = null;
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
    this.interactiveFilm = null;
    this.archiveDropFilm = null;
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
      returnObstacles: this.world?.root?.name === 'HaminaWorld'
        ? this.world.interactiveRegions
          .filter((region) => ['Data Center', 'Cooler'].includes(region.name))
          .map((region) => region.bounds.clone().expandByScalar(2.5))
        : [],
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
    this.loadingOrbitAngle = null;
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
    this.loadingOrbitAngle = null;
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

  startWorldArrival(duration = 2.4, landingHeight = 80) {
    if (this.kobeFixedCamera) {
      this.elapsed = 0;
      this.transition = null;
      this.setState(EXPERIENCE_STATES.ECHO_ORBIT);
      this.applyKobeCamera();
      return;
    }
    const direction = this.tempC.subVectors(this.camera.position, this.echoCenter);
    direction.y = 0;
    if (Number.isFinite(this.haminaArrivalAngle)) {
      direction.set(Math.cos(this.haminaArrivalAngle), 0, Math.sin(this.haminaArrivalAngle));
    } else {
      if (direction.lengthSq() < 0.001) direction.set(1, 0, 0);
      direction.normalize();
    }
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
      direction: direction.clone(),
      landingHeight,
      duration,
      startedAt: performance.now(),
    };
    this.setState(EXPERIENCE_STATES.HAMINA_ARRIVAL);
  }

  update(delta) {
    this.camera.position.sub(this.hoverOffset);
    this.hoverOffset.set(0, 0, 0);
    const kobeTunnelHover = this.kobeFixedCamera
      && this.state === EXPERIENCE_STATES.ECHO_ORBIT
      && this.hoverTarget?.cameraMode === 'kobe-tunnel';
    const portraitZoom = kobeTunnelHover ? 1.2
      : this.state === EXPERIENCE_STATES.GROUP_DANCE_FOCUS
      && this.danceHeroIndex >= 0 ? 1.78
      : this.state === EXPERIENCE_STATES.ECHO_RITUAL_SPIN ? 1.15
        : (this.state === EXPERIENCE_STATES.CHARACTER_FOCUS
          || this.state === EXPERIENCE_STATES.CHARACTER_SWITCH) ? 1.2 : 1;
    const nextZoom = THREE.MathUtils.damp(this.camera.zoom, portraitZoom, 3.2, delta);
    if (Math.abs(nextZoom - this.camera.zoom) > 0.0001) {
      this.camera.zoom = nextZoom;
      this.camera.updateProjectionMatrix();
    }
    this.elapsed += delta;
    if (this.kobeFixedCamera && ![
      EXPERIENCE_STATES.WORLD_JUMP_PREP,
      EXPERIENCE_STATES.WORLD_JUMP_SPLIT,
      EXPERIENCE_STATES.WORLD_JUMP_ECHO,
      EXPERIENCE_STATES.WORLD_JUMP_SKY,
      EXPERIENCE_STATES.WORLD_LOADING,
      EXPERIENCE_STATES.INTERACTIVE_OBJECT_FOCUS,
      EXPERIENCE_STATES.INTERACTIVE_OBJECT_RETURN,
    ].includes(this.state)) {
      this.kobePointerLook.x = THREE.MathUtils.damp(
        this.kobePointerLook.x, this.kobePointerLookTarget.x, 3.6, delta,
      );
      this.kobePointerLook.y = THREE.MathUtils.damp(
        this.kobePointerLook.y, this.kobePointerLookTarget.y, 3.6, delta,
      );
      this.applyKobeCamera();
      return;
    }
    if (this.state === EXPERIENCE_STATES.WORLD_JUMP_PREP
      || this.state === EXPERIENCE_STATES.WORLD_JUMP_SKY
      || this.state === EXPERIENCE_STATES.HAMINA_ARRIVAL) {
      const progress = Math.min(1, this.transition.startedAt
        ? (performance.now() - this.transition.startedAt) / (this.transition.duration * 1000)
        : this.elapsed / this.transition.duration);
      if (this.state === EXPERIENCE_STATES.HAMINA_ARRIVAL) {
        const descent = smoothStep(THREE.MathUtils.clamp(progress / 0.92, 0, 1));
        const entry = THREE.MathUtils.smootherstep(progress, 0, 0.22);
        const settle = THREE.MathUtils.smootherstep(progress, 0.58, 1);
        const lift = this.transition.landingHeight * (1 - descent);
        const trackedRadius = THREE.MathUtils.lerp(
          this.farRadius, this.nearRadius, smoothStep(progress),
        );
        this.tempA.copy(this.echoCenter).addScaledVector(this.transition.direction, trackedRadius);
        this.tempA.y = this.echoCenter.y + Math.max(
          lift * 0.8,
          this.nearHeight - this.echoCenter.y,
        );
        this.tempB.copy(this.echoCenter);
        this.tempB.y = this.echoCenter.y + Math.max(lift * 0.9, this.echoSize.y * 0.08);
        this.tempC.lerpVectors(this.transition.fromPosition, this.tempA, entry);
        this.camera.position.lerpVectors(this.tempC, this.transition.destination, settle);
        this.tempC.lerpVectors(this.transition.fromTarget, this.tempB, entry);
        this.target.lerpVectors(this.tempC, this.transition.destinationTarget, settle);
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
        if (progress >= 1) {
          this.transition = null;
          this.loadingOrbitAngle = Math.atan2(
            this.camera.position.z - this.target.z,
            this.camera.position.x - this.target.x,
          );
        }
      } else if (this.loadingOrbitAngle !== null) {
        const radius = Math.hypot(
          this.camera.position.x - this.target.x,
          this.camera.position.z - this.target.z,
        );
        this.loadingOrbitAngle += delta * 0.28;
        this.camera.position.x = this.target.x + Math.cos(this.loadingOrbitAngle) * radius;
        this.camera.position.z = this.target.z + Math.sin(this.loadingOrbitAngle) * radius;
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
      const farSpeed = Math.PI * 2 / this.config.introOrbitDuration;
      const nearSpeed = this.config.echoOrbitSpeed;
      const taperingTurn = progress - progress * progress + progress ** 3 / 3;
      this.angle = this.transition.fromAngle + this.transition.duration
        * (nearSpeed * progress + (farSpeed - nearSpeed) * taperingTurn);
      this.camera.position.set(
        this.echoCenter.x + Math.cos(this.angle) * radius,
        height,
        this.echoCenter.z + Math.sin(this.angle) * radius,
      );
      this.tempA.copy(this.echoCenter).add(this.tempB.set(
        0, this.echoSize.y * this.orbitTargetHeightRatio, 0,
      ));
      this.target.lerpVectors(this.transition.fromTarget, this.tempA, eased);
      this.camera.lookAt(this.target);
      if (progress >= 1) this.startEchoOrbit();
      return;
    }

    if (this.state === EXPERIENCE_STATES.ECHO_ORBIT) {
      this.angle += delta * this.config.echoOrbitSpeed;
      this.applyOrbitPose(this.nearRadius, this.nearHeight, this.angle);
      return;
    }

    if (this.state === EXPERIENCE_STATES.ECHO_RITUAL_SPIN) {
      const spin = this.ritualSpin;
      const shotIndex = Math.min(spin.shots.length - 1,
        Math.floor(this.elapsed / spin.shotDuration));
      const shotTime = this.elapsed - shotIndex * spin.shotDuration;
      const shotProgress = THREE.MathUtils.smootherstep(
        THREE.MathUtils.clamp(shotTime / (spin.shotDuration - 0.45), 0, 1), 0, 1,
      );
      const subject = spin.shots[shotIndex];
      const head = subject.getHeadWorldPosition(this.tempA);
      const outward = this.tempB.subVectors(head, this.echoCenter);
      outward.y = 0;
      outward.normalize();
      const side = this.tempC.set(-outward.z, 0, outward.x);
      const position = head.clone()
        .addScaledVector(outward, -2.1)
        .addScaledVector(side, THREE.MathUtils.lerp(-0.36, 0.2, shotProgress));
      position.y += THREE.MathUtils.lerp(0.55, 0.2, shotProgress);
      const target = head.clone().add(new THREE.Vector3(0, -0.15, 0));
      if (shotIndex !== spin.activeShot) {
        spin.activeShot = shotIndex;
        spin.blendFromPosition.copy(this.camera.position);
        spin.blendFromTarget.copy(this.target);
      }
      if (shotIndex === 0) {
        const entry = THREE.MathUtils.smootherstep(Math.min(1, shotTime / 1.55), 0, 1);
        this.camera.position.lerpVectors(spin.fromPosition, position, entry);
        this.target.lerpVectors(spin.fromTarget, target, entry);
      } else {
        // Preserve the current frame at every shot boundary and glide into the
        // next portrait. This removes the one-frame teleport that was visible
        // in every land world during the five-face ritual.
        const blend = smoothStep(shotTime / spin.blendDuration);
        this.camera.position.lerpVectors(spin.blendFromPosition, position, blend);
        this.target.lerpVectors(spin.blendFromTarget, target, blend);
      }
      this.camera.lookAt(this.target);
      if (this.elapsed >= spin.shots.length * spin.shotDuration) {
        this.ritualSpin = null;
        this.returnToEcho();
      }
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
            this.danceTrackReady = false;
            this.danceMove = {
              fromPosition: this.camera.position.clone(),
              fromTarget: this.target.clone(),
              elapsed: 0,
              duration: this.danceHeroIndex < 0 ? 2.1 : 1.75,
            };
          }
        }
      }
      const trackedMember = this.danceGroup.members?.[this.danceHeroIndex];
      if (trackedMember) {
        if (trackedMember.getHeadWorldPosition) {
          trackedMember.getHeadWorldPosition(this.danceAnimatedHead);
        } else {
          this.danceAnimatedHead.copy(trackedMember.root.position);
          this.danceAnimatedHead.y += trackedMember.height * 0.83;
        }
        if (!this.danceTrackReady) {
          this.danceTrackedHead.copy(this.danceAnimatedHead);
          this.danceTrackReady = true;
        } else {
          this.danceTrackedHead.lerp(
            this.danceAnimatedHead,
            1 - Math.exp(-Math.min(delta, 0.05) * 5.2),
          );
        }
      } else this.danceTrackReady = false;
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
      this.keepDanceCameraOutsidePeople(delta);
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
      if (this.transition.destinationUp) {
        this.camera.up.lerpVectors(this.transition.fromUp, this.transition.destinationUp, eased).normalize();
      }
      this.camera.lookAt(this.target);
      if (progress >= 1) {
        const returnState = this.transition.archiveReturnState;
        if (this.transition.filmEntry && this.interactiveFocus) {
          const up = new THREE.Vector3(0, 1, 0);
          const arrivalOutward = this.camera.position.clone().sub(this.interactiveFocus.center)
            .setY(0).normalize();
          if (arrivalOutward.lengthSq() < 0.001) arrivalOutward.set(0, 0, 1);
          const arrivalRight = up.clone().cross(arrivalOutward).normalize();
          const graphic = this.interactiveFocus.meshes?.[0];
          graphic?.updateWorldMatrix(true, false);
          const billboardAxis = graphic
            ? new THREE.Vector3(1, 0, 0).transformDirection(graphic.matrixWorld).setY(0)
            : arrivalRight.clone();
          if (billboardAxis.lengthSq() < 0.001) billboardAxis.copy(arrivalRight);
          billboardAxis.normalize();
          if (billboardAxis.dot(arrivalRight) < 0) billboardAxis.negate();
          const boundsSize = this.interactiveFocus.size;
          const billboardSpan = boundsSize.x * Math.abs(billboardAxis.x)
            + boundsSize.z * Math.abs(billboardAxis.z);
          const billboard = this.interactiveFocus.name === 'Billboard';
          const filmTarget = this.target.clone();
          if (billboard) filmTarget.addScaledVector(billboardAxis, billboardSpan * 0.3);
          const filmOffset = this.camera.position.clone().sub(filmTarget);
          if (billboard) filmOffset.addScaledVector(billboardAxis, billboardSpan * 0.34);
          const filmDistance = filmOffset.length();
          const outward = filmOffset.normalize();
          const right = up.clone().cross(outward).normalize();
          const horizontalOutward = outward.clone().setY(0).normalize();
          if (horizontalOutward.lengthSq() < 0.001) horizontalOutward.set(0, 0, 1);
          const horizontalRight = up.clone().cross(horizontalOutward).normalize();
          this.interactiveFilm = {
            region: this.interactiveFocus,
            target: filmTarget.clone(),
            outward,
            right,
            up,
            horizontalOutward,
            horizontalRight,
            horizontalDistance: Math.hypot(
              this.camera.position.x - filmTarget.x, this.camera.position.z - filmTarget.z,
            ),
            verticalOffset: this.camera.position.y - filmTarget.y,
            billboardAxis,
            billboardSpan,
            distance: filmDistance,
            minimumDistance: Math.max(3.5, this.interactiveFocus.radius * 0.9),
            elapsed: 0,
          };
        }
        this.transition = null;
        this.elapsed = 0;
        if (returnState) this.setState(returnState);
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
      for (const bounds of this.transition.returnObstacles) {
        const dx = Math.max(bounds.min.x - this.camera.position.x, 0,
          this.camera.position.x - bounds.max.x);
        const dz = Math.max(bounds.min.z - this.camera.position.z, 0,
          this.camera.position.z - bounds.max.z);
        const distance = Math.hypot(dx, dz);
        const influence = 1 - THREE.MathUtils.smoothstep(distance, 0, 6);
        const safeHeight = bounds.max.y + 1.5;
        this.camera.position.y += Math.max(0, safeHeight - this.camera.position.y) * influence;
      }
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
