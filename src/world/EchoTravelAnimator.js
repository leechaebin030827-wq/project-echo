import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const clamp = THREE.MathUtils.clamp;
const smooth = (value) => {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

export function getEchoLaunchPose(progress, height) {
  return {
    lift: height * smooth((progress - 0.08) / 0.92),
    crouch: 1 - smooth(progress / 0.25),
    tuck: smooth((progress - 0.28) / 0.62),
    groundContact: 1 - smooth((progress - 0.1) / 0.18),
  };
}

// The world GLBs contain static ECHO meshes. The intro asset is the matching
// skinned geometry with four articulated legs, used only during travel.
export class EchoTravelAnimator {
  constructor(scene, stage) {
    this.scene = scene;
    this.stage = stage;
    this.actor = null;
    this.source = null;
    this.phase = 'idle';
    this.elapsed = 0;
    this.duration = 1;
    this.lift = 0;
    this.tuck = 0;
    this.spin = 0;
    this.yaw = new THREE.Quaternion();
    this.identity = new THREE.Quaternion();
    this.center = new THREE.Vector3(0, 0.55, 0);
    this.hip = new THREE.Vector3();
    this.knee = new THREE.Vector3();
    this.legDirection = new THREE.Vector3();
    this.legPole = new THREE.Vector3();
    this.legTarget = new THREE.Vector3();
    this.groundFootPosition = new THREE.Vector3();
    this.deltaQ = new THREE.Quaternion();
    this.desiredQ = new THREE.Quaternion();
    this.parentQ = new THREE.Quaternion();
  }

  preload() {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = new GLTFLoader()
      .loadAsync('/intro/assets/opening/echo-opening-rig.glb')
      .then(({ scene }) => {
        this.actor = scene;
        this.actor.name = 'ECHO_TravelRig';
        this.actor.visible = false;
        this.mesh = scene.getObjectByName('ECHO_Mesh');
        this.body = scene.getObjectByName('Body');
        if (!this.mesh?.isSkinnedMesh || !this.body?.isBone) {
          throw new Error('ECHO travel rig is missing its skinned mesh or Body bone.');
        }
        this.rigMaterial = this.mesh.material;
        this.mesh.frustumCulled = false;
        this.bodyRest = this.body.position.clone();
        this.legs = Array.from({ length: 4 }, (_, index) => {
          const id = String(index + 1).padStart(2, '0');
          const upper = scene.getObjectByName(`Leg_${id}_Upper`);
          const lower = scene.getObjectByName(`Leg_${id}_Lower`);
          const foot = scene.getObjectByName(`Leg_${id}_Foot`);
          if (!upper?.isBone || !lower?.isBone || !foot?.isBone) {
            throw new Error(`ECHO travel rig is missing leg ${id}.`);
          }
          const hip = upper.getWorldPosition(new THREE.Vector3());
          const inward = this.center.clone().sub(hip).normalize();
          const upperWorldQ = upper.getWorldQuaternion(new THREE.Quaternion());
          const inwardLocal = inward.applyQuaternion(upperWorldQ.invert());
          const lowerInward = this.center.clone().sub(lower.getWorldPosition(new THREE.Vector3())).normalize();
          lowerInward.applyQuaternion(lower.getWorldQuaternion(new THREE.Quaternion()).invert());
          return {
            upper, lower, foot,
            upperRest: upper.quaternion.clone(),
            lowerRest: lower.quaternion.clone(),
            footRest: foot.quaternion.clone(),
            upperScale: upper.scale.clone(),
            lowerScale: lower.scale.clone(),
            footScale: foot.scale.clone(),
            fold: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inwardLocal),
            foldedQ: new THREE.Quaternion(),
            lowerFoldedQ: lower.quaternion.clone().multiply(
              new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lowerInward),
            ),
            targetQ: new THREE.Quaternion(),
          };
        });
        for (const leg of this.legs) {
          leg.foldedQ.copy(leg.upperRest)
            .multiply(this.identity.clone().slerp(leg.fold, 0.82));
        }
        this.scene.add(this.actor);
        return this;
      });
    return this.loadPromise;
  }

  attach(world) {
    if (!this.actor) throw new Error('ECHO travel rig is not ready.');
    this.detach();
    const source = world.echo;
    let sourceMesh = null;
    source.traverse((object) => {
      if (!sourceMesh && object.isMesh) sourceMesh = object;
    });
    if (!sourceMesh) throw new Error('World ECHO has no visible mesh to align the travel rig.');
    sourceMesh.updateWorldMatrix(true, false);
    sourceMesh.matrixWorld.decompose(this.actor.position, this.actor.quaternion, this.actor.scale);
    this.basePosition = this.actor.position.clone();
    this.baseQuaternion = this.actor.quaternion.clone();
    this.worldScale = Math.max(this.actor.scale.x, this.actor.scale.y, this.actor.scale.z);
    // Keep the in-flight appearance independent of either world's materials.
    // The backdrop transition temporarily fades the world materials.
    this.travelMaterial = Array.isArray(sourceMesh.material)
      ? sourceMesh.material.map((material) => material.clone())
      : sourceMesh.material.clone();
    const copiedTextures = new Map();
    for (const material of (Array.isArray(this.travelMaterial)
      ? this.travelMaterial : [this.travelMaterial])) {
      for (const [key, value] of Object.entries(material)) {
        if (!value?.isTexture) continue;
        if (!copiedTextures.has(value)) copiedTextures.set(value, value.clone());
        material[key] = copiedTextures.get(value);
      }
    }
    this.travelTextures = [...copiedTextures.values()];
    this.mesh.material = this.travelMaterial;
    this.source = source;
    this.sourceWasVisible = source.visible;
    source.visible = false;
    this.actor.visible = true;
    this.setPose(0, 0, 0, 0);
    this.captureGroundPose();
  }

  captureGroundPose() {
    this.actor.updateMatrixWorld(true);
    for (const leg of this.legs) {
      const hip = leg.upper.getWorldPosition(new THREE.Vector3());
      const knee = leg.lower.getWorldPosition(new THREE.Vector3());
      const ankle = leg.foot.getWorldPosition(new THREE.Vector3());
      const direction = ankle.clone().sub(hip).normalize();
      const pole = knee.clone().sub(hip);
      pole.addScaledVector(direction, -pole.dot(direction));
      if (pole.lengthSq() < 1e-8) {
        pole.copy(hip).sub(this.actor.position).setY(0);
        pole.addScaledVector(direction, -pole.dot(direction));
      }
      const outward = hip.clone().sub(this.actor.position).setY(0);
      outward.addScaledVector(direction, -outward.dot(direction));
      if (outward.lengthSq() < 1e-8) outward.copy(pole).negate();
      pole.normalize();
      outward.normalize();
      leg.groundFoot = ankle;
      leg.upperLength = hip.distanceTo(knee);
      leg.lowerLength = knee.distanceTo(ankle);
      leg.restUpperDirection = knee.clone().sub(hip).normalize();
      leg.restLowerDirection = ankle.clone().sub(knee).normalize();
      leg.restPole = pole;
      leg.poleAxis = direction;
      leg.outwardAngle = Math.atan2(
        direction.dot(pole.clone().cross(outward)), pole.dot(outward),
      );
      leg.restUpperWorldQ = leg.upper.getWorldQuaternion(new THREE.Quaternion());
      leg.restLowerWorldQ = leg.lower.getWorldQuaternion(new THREE.Quaternion());
      leg.restFootWorldQ = leg.foot.getWorldQuaternion(new THREE.Quaternion());
    }
  }

  solveGroundedLeg(leg, crouch = 0) {
    // The lower strut telescopes as the body sinks, so the knees can open
    // outward without flipping above the hips or dragging the feet.
    leg.lower.scale.y = leg.lowerScale.y * (1 - 0.28 * crouch);
    const lowerLength = leg.lowerLength * leg.lower.scale.y / leg.lowerScale.y;
    leg.upper.getWorldPosition(this.hip);
    this.legDirection.copy(leg.groundFoot).sub(this.hip);
    const requestedReach = this.legDirection.length();
    this.legDirection.divideScalar(Math.max(requestedReach, 1e-9));
    const reach = clamp(requestedReach,
      Math.abs(lowerLength - leg.upperLength) + 0.001,
      leg.upperLength + lowerLength - 0.001);
    this.legTarget.copy(this.hip).addScaledVector(this.legDirection, reach);
    this.legPole.copy(leg.restPole)
      .applyAxisAngle(leg.poleAxis, leg.outwardAngle * smooth(crouch / 0.1))
      .addScaledVector(this.legDirection, -this.legPole.dot(this.legDirection));
    if (this.legPole.lengthSq() < 1e-8) this.legPole.set(1, 0, 0);
    this.legPole.normalize();
    const along = (leg.upperLength ** 2 - lowerLength ** 2 + reach ** 2) / (2 * reach);
    const away = Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2));
    this.knee.copy(this.hip).addScaledVector(this.legDirection, along)
      .addScaledVector(this.legPole, away);

    this.legDirection.copy(this.knee).sub(this.hip).normalize();
    this.deltaQ.setFromUnitVectors(leg.restUpperDirection, this.legDirection);
    this.desiredQ.multiplyQuaternions(this.deltaQ, leg.restUpperWorldQ);
    leg.upper.parent.getWorldQuaternion(this.parentQ).invert();
    leg.upper.quaternion.multiplyQuaternions(this.parentQ, this.desiredQ).normalize();
    leg.upper.updateWorldMatrix(false, true);

    leg.lower.getWorldPosition(this.knee);
    this.legDirection.copy(this.legTarget).sub(this.knee).normalize();
    this.deltaQ.setFromUnitVectors(leg.restLowerDirection, this.legDirection);
    this.desiredQ.multiplyQuaternions(this.deltaQ, leg.restLowerWorldQ);
    leg.upper.getWorldQuaternion(this.parentQ).invert();
    leg.lower.quaternion.multiplyQuaternions(this.parentQ, this.desiredQ).normalize();
    leg.lower.updateWorldMatrix(false, true);

    leg.lower.getWorldQuaternion(this.parentQ).invert();
    leg.foot.quaternion.multiplyQuaternions(this.parentQ, leg.restFootWorldQ).normalize();
  }

  shiftWorld(offset) {
    if (!this.actor?.visible) return;
    this.basePosition.add(offset);
    this.actor.position.add(offset);
  }

  retarget(world) {
    if (!this.actor?.visible) return;
    let sourceMesh = null;
    world.echo.traverse((object) => {
      if (!sourceMesh && object.isMesh) sourceMesh = object;
    });
    if (!sourceMesh) throw new Error('Hamina ECHO has no mesh for travel alignment.');
    sourceMesh.updateWorldMatrix(true, false);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    sourceMesh.matrixWorld.decompose(position, quaternion, scale);
    if (this.source) this.source.visible = this.sourceWasVisible;
    this.source = world.echo;
    this.sourceWasVisible = world.echo.visible;
    world.echo.visible = false;
    this.arrivalFromPosition = this.basePosition.clone();
    this.arrivalFromQuaternion = this.baseQuaternion.clone();
    this.arrivalFromScale = this.actor.scale.clone();
    this.arrivalTarget = { position, quaternion, scale };
  }

  start(phase, duration, height = this.height) {
    this.spinStart = phase === 'spin' || phase === 'loading-spin' ? this.spin : 0;
    this.phase = phase;
    this.startedAt = performance.now();
    this.elapsed = 0;
    this.duration = Math.max(0.001, duration);
    this.height = height ?? 0;
    this.update(0);
  }

  setPose(lift, crouch, tuck, spin, groundContact = 0, legRetract = 0) {
    if (!this.actor?.visible) return;
    this.lift = lift;
    this.tuck = tuck;
    this.spin = spin;
    for (const material of (Array.isArray(this.travelMaterial)
      ? this.travelMaterial : [this.travelMaterial])) {
      if (material) {
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
      }
    }
    const lowerTuck = smooth((tuck - 0.16) / 0.84);
    this.actor.position.copy(this.basePosition).add(new THREE.Vector3(0, lift, 0));
    this.yaw.setFromAxisAngle(THREE_Y, spin);
    this.actor.quaternion.copy(this.baseQuaternion).multiply(this.yaw);
    this.body.position.copy(this.bodyRest);
    this.body.position.y -= crouch * 0.22;
    for (const leg of this.legs) {
      leg.upper.quaternion.copy(leg.upperRest).slerp(leg.foldedQ, tuck);
      leg.lower.quaternion.copy(leg.lowerRest).slerp(leg.lowerFoldedQ, lowerTuck);
      leg.foot.quaternion.copy(leg.footRest);
      leg.upper.scale.copy(leg.upperScale);
      leg.lower.scale.copy(leg.lowerScale);
      leg.foot.scale.copy(leg.footScale);
    }
    if (groundContact > 0) {
      for (const leg of this.legs) {
        leg.upper.quaternion.copy(leg.upperRest);
        leg.lower.quaternion.copy(leg.lowerRest);
        leg.foot.quaternion.copy(leg.footRest);
        leg.upper.scale.copy(leg.upperScale);
        leg.lower.scale.copy(leg.lowerScale);
        leg.foot.scale.copy(leg.footScale);
      }
      this.actor.updateMatrixWorld(true);
      for (const leg of this.legs) this.solveGroundedLeg(leg, crouch);
      const airborne = 1 - groundContact;
      for (const leg of this.legs) {
        leg.targetQ.copy(leg.upperRest).slerp(leg.foldedQ, tuck);
        leg.upper.quaternion.slerp(leg.targetQ, airborne);
        leg.lower.quaternion.slerp(leg.lowerFoldedQ, lowerTuck * airborne);
        leg.foot.quaternion.slerp(leg.footRest, airborne);
        leg.lower.scale.y = THREE.MathUtils.lerp(
          leg.lowerScale.y * (1 - 0.28 * crouch),
          leg.lowerScale.y, airborne,
        );
      }
    }
    if (legRetract > 0) {
      const scale = 1 - 0.98 * legRetract;
      for (const leg of this.legs) {
        leg.upper.scale.multiplyScalar(scale);
        leg.lower.scale.multiplyScalar(scale);
        leg.foot.scale.multiplyScalar(scale);
      }
    }
    if (import.meta.env.DEV) {
      let footDrift = null;
      if (this.phase === 'crouch' && this.legs[0].groundFoot) {
        this.actor.updateMatrixWorld(true);
        footDrift = Math.max(...this.legs.map((leg) => leg.foot
          .getWorldPosition(this.groundFootPosition).distanceTo(leg.groundFoot)));
      }
      this.stage.dataset.echoTravel = JSON.stringify({
        phase: this.phase,
        lift: Number(lift.toFixed(2)),
        crouch: Number(crouch.toFixed(2)),
        tuck: Number(tuck.toFixed(2)),
        spin: Number(spin.toFixed(2)),
        groundContact: Number(groundContact.toFixed(2)),
        footDrift: footDrift === null ? null : Number(footDrift.toFixed(3)),
      });
    }
  }

  update(delta = 0) {
    if (!this.actor?.visible || this.phase === 'idle') return;
    if (this.phase === 'arrival') this.elapsed += clamp(delta, 0, 0.05);
    const progress = this.phase === 'arrival'
      ? clamp(this.elapsed / this.duration, 0, 1)
      : (performance.now() - this.startedAt) / (this.duration * 1000);
    const boundedProgress = clamp(progress, 0, 1);
    if (this.phase === 'crouch') {
      this.setPose(0, smooth(boundedProgress), 0, 0, 1);
    } else if (this.phase === 'launch') {
      const pose = getEchoLaunchPose(boundedProgress, this.height);
      this.setPose(pose.lift, pose.crouch, pose.tuck, 0, pose.groundContact,
        smooth((boundedProgress - 0.88) / 0.12));
    } else if (this.phase === 'spin' || this.phase === 'loading-spin') {
      this.setPose(this.height, 0, 1,
        this.spinStart + Math.PI * 2 * progress, 0, 1);
    } else if (this.phase === 'arrival') {
      const alignment = smooth(boundedProgress);
      if (this.arrivalTarget) {
        this.basePosition.lerpVectors(this.arrivalFromPosition, this.arrivalTarget.position, alignment);
        this.baseQuaternion.slerpQuaternions(
          this.arrivalFromQuaternion, this.arrivalTarget.quaternion, alignment,
        );
        this.actor.scale.lerpVectors(this.arrivalFromScale, this.arrivalTarget.scale, alignment);
      }
      const descent = smooth(progress / 0.86);
      const bounce = progress > 0.86 ? Math.sin(Math.PI * (progress - 0.86) / 0.14) * this.worldScale * 0.035 : 0;
      const tuck = 1 - smooth((progress - 0.65) / 0.23);
      const impact = progress > 0.84 ? Math.sin(Math.PI * clamp((progress - 0.84) / 0.16, 0, 1)) * 0.65 : 0;
      this.setPose(this.height * (1 - descent) + bounce, impact * 0.45, tuck, 0, 0,
        1 - smooth((progress - 0.56) / 0.28));
    }
  }

  detach() {
    if (!this.actor) return;
    if (this.source) this.source.visible = this.sourceWasVisible;
    this.mesh.material = this.rigMaterial;
    for (const material of (Array.isArray(this.travelMaterial)
      ? this.travelMaterial : [this.travelMaterial])) material?.dispose();
    this.travelTextures?.forEach((texture) => texture.dispose());
    this.travelTextures = null;
    this.travelMaterial = null;
    this.actor.visible = false;
    this.source = null;
    this.arrivalTarget = null;
    this.phase = 'idle';
    if (import.meta.env.DEV) delete this.stage.dataset.echoTravel;
  }

  dispose() {
    this.detach();
    if (!this.actor) return;
    const textures = new Set();
    this.actor.traverse((object) => {
      object.geometry?.dispose();
      if (!object.isMesh) return;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        material.dispose();
      }
    });
    textures.forEach((texture) => texture.dispose());
    this.actor.removeFromParent();
  }
}

const THREE_Y = new THREE.Vector3(0, 1, 0);
