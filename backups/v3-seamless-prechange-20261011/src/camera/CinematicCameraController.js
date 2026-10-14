import * as THREE from 'three';
import {
  CAMERA_CONFIG,
  CHARACTER_CAMERA_CONFIG,
  EXPERIENCE_STATES,
} from '../config.js';

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
      world.root?.name === 'HaminaWorld' ? 18 : 26,
      horizontal * this.config.farOrbitRadiusScale * (world.farOrbitScale ?? 1),
    );
    this.farHeight = Math.max(
      world.bounds.max.y + this.config.farOrbitBoundsClearance,
      this.echoCenter.y + Math.max(12, world.size.y * this.config.farOrbitHeightScale),
    );
    this.nearRadius = Math.max(
      world.echoSphere.radius * this.config.nearOrbitRadiusFromEcho * (world.nearOrbitScale ?? 1),
      world.root?.name === 'HaminaWorld' ? 7.4 : 8.5,
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
    );
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
      entity.height * this.config.portraitDistanceFromHeight * (faceFraming ? 0.52 : 1),
    );
    positionTarget.copy(lookTarget).add(this.focusForward);
    positionTarget.y += entity.height * (faceFraming
      ? 0.012
      : CHARACTER_CAMERA_CONFIG.verticalOffset);
    return { position: positionTarget, target: lookTarget };
  }

  focusCharacter(entity, options = {}) {
    if (!entity) return;
    const previous = this.focused;
    this.focused = entity;
    this.focusFraming = options.framing === 'face' ? 'face' : 'character';
    const state = previous && previous !== entity
      ? EXPERIENCE_STATES.CHARACTER_SWITCH
      : EXPERIENCE_STATES.CHARACTER_FOCUS;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      duration: this.config.characterTransitionDuration,
      destinationEntity: entity,
    };
    this.elapsed = 0;
    this.setState(state, state === EXPERIENCE_STATES.CHARACTER_SWITCH
      ? `${previous.id} -> ${entity.id}` : entity.id);
    const initialPose = this.getFocusPose(entity, this.tempA, this.tempB);
    console.info(`[Camera] target head position: ${initialPose.target.toArray().map((value) => value.toFixed(2)).join(', ')}`);
    console.info('[Camera] focus distance:', initialPose.position.distanceTo(initialPose.target).toFixed(2));
  }

  switchCharacter(entity) { this.focusCharacter(entity); }

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
    this.focusFraming = 'character';
    this.elapsed = 0;
    const offset = this.tempA.subVectors(this.camera.position, this.echoCenter);
    this.angle = Math.atan2(offset.z, offset.x);
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      duration: this.config.returnDuration,
      orbitAngle: this.angle,
    };
    this.setState(EXPERIENCE_STATES.RETURN_TO_ECHO);
  }

  startWorldJumpOverview(duration = 1.65) {
    const horizontal = Math.max(this.worldSize.x, this.worldSize.z);
    const destination = this.echoCenter.clone().add(new THREE.Vector3(
      horizontal * 0.13,
      Math.max(this.echoSize.y * 3.2, horizontal * 0.24, 18),
      horizontal * 0.17,
    ));
    const destinationTarget = this.echoCenter.clone().add(new THREE.Vector3(0, this.echoSize.y * 0.05, 0));
    this.focused = null;
    this.elapsed = 0;
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.target.clone(),
      destination,
      destinationTarget,
      duration,
    };
    this.setState(EXPERIENCE_STATES.WORLD_JUMP_PREP);
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

  startWorldArrival(duration = 1.35) {
    this.angle = -Math.PI * 0.15;
    const skyPosition = this.echoCenter.clone().add(new THREE.Vector3(
      0,
      Math.max(3.2, this.echoSize.y * 0.45),
      Math.max(5, this.echoSphere.radius * 1.4),
    ));
    const skyTarget = skyPosition.clone().add(new THREE.Vector3(0, 24, -2.5));
    const destination = new THREE.Vector3(
      this.echoCenter.x + Math.cos(this.angle) * this.farRadius,
      this.farHeight,
      this.echoCenter.z + Math.sin(this.angle) * this.farRadius,
    );
    const destinationTarget = this.echoCenter.clone().add(new THREE.Vector3(0, this.echoSize.y * 0.08, 0));
    this.camera.position.copy(skyPosition);
    this.target.copy(skyTarget);
    this.camera.lookAt(this.target);
    this.elapsed = 0;
    this.transition = {
      fromPosition: skyPosition,
      fromTarget: skyTarget,
      destination,
      destinationTarget,
      duration,
    };
    this.setState(EXPERIENCE_STATES.HAMINA_ARRIVAL);
  }

  update(delta) {
    this.elapsed += delta;
    if (this.state === EXPERIENCE_STATES.WORLD_JUMP_PREP
      || this.state === EXPERIENCE_STATES.WORLD_JUMP_SKY
      || this.state === EXPERIENCE_STATES.HAMINA_ARRIVAL) {
      const progress = Math.min(1, this.elapsed / this.transition.duration);
      const eased = smoothStep(progress);
      this.camera.position.lerpVectors(this.transition.fromPosition, this.transition.destination, eased);
      this.target.lerpVectors(this.transition.fromTarget, this.transition.destinationTarget, eased);
      this.camera.lookAt(this.target);
      if (progress >= 1 && this.state === EXPERIENCE_STATES.HAMINA_ARRIVAL) this.startIntro();
      return;
    }

    if (this.state === EXPERIENCE_STATES.WORLD_JUMP_SPLIT
      || this.state === EXPERIENCE_STATES.WORLD_JUMP_ECHO
      || this.state === EXPERIENCE_STATES.WORLD_LOADING) return;

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
        const eased = smoothStep(progress);
        this.camera.position.lerpVectors(this.transition.fromPosition, pose.position, eased);
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
      this.camera.lookAt(this.target);
      return;
    }

    if (this.state === EXPERIENCE_STATES.FREE_ROAM) {
      this.updateFreeRoamFrame(delta);
      return;
    }

    if (this.state === EXPERIENCE_STATES.RETURN_TO_ECHO) {
      const progress = Math.min(1, this.elapsed / this.transition.duration);
      const eased = smoothStep(progress);
      const destination = this.getOrbitPosition(this.transition.orbitAngle, this.tempA);
      const destinationTarget = this.tempB.copy(this.echoCenter).add(this.tempC.set(0, this.echoSize.y * 0.08, 0));
      this.camera.position.lerpVectors(this.transition.fromPosition, destination, eased);
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
