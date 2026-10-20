import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ECHO_RIG_URL } from '../config.js';
import { tuneEchoMaterial } from '../world/shared/EchoMaterial.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const smoothStep = (value) => value * value * (3 - 2 * value);

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

class EchoSpiderGait {
  constructor(scene) {
    this.options = {
      groundY: 0,
      modelFloorY: -0.80582,
      crouch: 0.038,
      stepHeight: 0.026,
      stepThreshold: 0.041,
      swingDuration: 0.135,
      landingLeadTime: 0.064,
      bodyBob: 0.003,
      maxExtraCrouch: 0.022,
      teleportDistance: 0.42,
    };
    this.root = new THREE.Group();
    this.root.name = 'ECHO_OpeningActor';
    this.root.add(scene);
    this.scene = scene;
    this.root.updateMatrixWorld(true);
    this.legs = [];

    for (let index = 1; index <= 4; index += 1) {
      const id = String(index).padStart(2, '0');
      const upper = scene.getObjectByName(`Leg_${id}_Upper`);
      const lower = scene.getObjectByName(`Leg_${id}_Lower`);
      const foot = scene.getObjectByName(`Leg_${id}_Foot`);
      if (!upper?.isBone || !lower?.isBone || !foot?.isBone) {
        throw new Error(`ECHO opening rig is missing leg ${id}.`);
      }
      const hip = upper.getWorldPosition(new THREE.Vector3());
      const knee = lower.getWorldPosition(new THREE.Vector3());
      const ankle = foot.getWorldPosition(new THREE.Vector3());
      const restUpperDirection = knee.clone().sub(hip).normalize();
      const restLowerDirection = ankle.clone().sub(knee).normalize();
      const legDirection = ankle.clone().sub(hip).normalize();
      const pole = knee.clone().sub(hip);
      pole.addScaledVector(legDirection, -pole.dot(legDirection));
      if (pole.lengthSq() < 1e-8) {
        pole.set(-hip.x, 0, -hip.z);
        pole.addScaledVector(legDirection, -pole.dot(legDirection));
      }
      pole.normalize();
      this.legs.push({
        upper,
        lower,
        foot,
        upperLength: hip.distanceTo(knee),
        lowerLength: knee.distanceTo(ankle),
        restFoot: ankle,
        restUpperDirection,
        restLowerDirection,
        restPole: pole,
        restUpperWorldQ: upper.getWorldQuaternion(new THREE.Quaternion()),
        restLowerWorldQ: lower.getWorldQuaternion(new THREE.Quaternion()),
        restFootWorldQ: foot.getWorldQuaternion(new THREE.Quaternion()),
        restLocalQ: [upper.quaternion.clone(), lower.quaternion.clone(), foot.quaternion.clone()],
        ankleHeight: ankle.y - this.options.modelFloorY,
        target: new THREE.Vector3(),
        ideal: new THREE.Vector3(),
        swingStart: new THREE.Vector3(),
        swingEnd: new THREE.Vector3(),
        swinging: false,
        elapsed: 0,
        duration: this.options.swingDuration,
        footYaw: 0,
        startYaw: 0,
        endYaw: 0,
        maximumReach: hip.distanceTo(knee) + knee.distanceTo(ankle) - 0.0006,
      });
    }

    this.pairs = [[0, 1], [2, 3]];
    this.activePair = -1;
    this.lastPair = 1;
    this.heading = 0;
    this.speed = 0;
    this.angularSpeed = 0;
    this.extraCrouch = 0;
    this.motionBlend = 0;
    this.bobPhase = 0;
    this.lastPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.instantVelocity = new THREE.Vector3();
    this.frameStart = new THREE.Vector3();
    this.frameGoal = new THREE.Vector3();
    this.framePosition = new THREE.Vector3();
    this.actorQ = new THREE.Quaternion();
    this.footQ = new THREE.Quaternion();
    this.parentQ = new THREE.Quaternion();
    this.desiredQ = new THREE.Quaternion();
    this.referenceQ = new THREE.Quaternion();
    this.deltaQ = new THREE.Quaternion();
    this.hip = new THREE.Vector3();
    this.knee = new THREE.Vector3();
    this.actual = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.referenceDirection = new THREE.Vector3();
    this.pole = new THREE.Vector3();
    this.ikTarget = new THREE.Vector3();
    this.futurePosition = new THREE.Vector3();
    this.reset(new THREE.Vector3(), 0);
  }

  reset(position = new THREE.Vector3(), heading = 0) {
    this.lastPosition.set(position.x, 0, position.z);
    this.heading = Number.isFinite(heading) ? heading : 0;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.angularSpeed = 0;
    this.motionBlend = 0;
    this.extraCrouch = 0;
    this.activePair = -1;
    this.lastPair = 1;
    this.bobPhase = 0;
    this.placeRoot(position, this.heading, 0);
    for (const leg of this.legs) {
      leg.upper.quaternion.copy(leg.restLocalQ[0]);
      leg.lower.quaternion.copy(leg.restLocalQ[1]);
      leg.foot.quaternion.copy(leg.restLocalQ[2]);
      this.neutralFoot(leg, this.lastPosition, this.heading, leg.target);
      leg.ideal.copy(leg.target);
      leg.swingStart.copy(leg.target);
      leg.swingEnd.copy(leg.target);
      leg.swinging = false;
      leg.elapsed = 0;
      leg.footYaw = this.heading;
      leg.startYaw = this.heading;
      leg.endYaw = this.heading;
    }
    this.root.updateMatrixWorld(true);
    for (const leg of this.legs) this.solveLeg(leg);
    this.root.updateMatrixWorld(true);
  }

  update(delta, { position, heading = this.heading } = {}) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.frameGoal.set(position.x, 0, position.z);
    const headingChange = angleDelta(this.heading, heading);
    if (this.frameGoal.distanceTo(this.lastPosition) > this.options.teleportDistance
      || Math.abs(headingChange) > Math.PI / 2 || delta > 0.5) {
      this.reset(position, heading);
      return;
    }
    const elapsed = Math.min(delta, 0.25);
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 40)));
    const step = elapsed / steps;
    this.frameStart.copy(this.lastPosition);
    const startHeading = this.heading;
    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      this.framePosition.lerpVectors(this.frameStart, this.frameGoal, progress);
      this.tick(step, this.framePosition, startHeading + headingChange * progress);
    }
  }

  placeRoot(position, heading, bob) {
    this.root.position.set(
      position.x,
      this.options.groundY - this.options.modelFloorY - this.options.crouch - this.extraCrouch + bob,
      position.z,
    );
    this.actorQ.setFromAxisAngle(UP, heading);
    this.root.quaternion.copy(this.actorQ);
  }

  neutralFoot(leg, position, heading, target) {
    const cosine = Math.cos(heading);
    const sine = Math.sin(heading);
    return target.set(
      position.x + cosine * leg.restFoot.x + sine * leg.restFoot.z,
      this.options.groundY + leg.ankleHeight,
      position.z - sine * leg.restFoot.x + cosine * leg.restFoot.z,
    );
  }

  tick(delta, position, heading) {
    this.instantVelocity.copy(position).sub(this.lastPosition).divideScalar(delta);
    const smoothing = 1 - Math.exp(-delta / 0.055);
    this.velocity.lerp(this.instantVelocity, smoothing);
    const angularVelocity = angleDelta(this.heading, heading) / delta;
    this.angularSpeed += (angularVelocity - this.angularSpeed) * smoothing;
    this.speed = this.velocity.length();
    const activity = this.speed + Math.abs(this.angularSpeed) * 0.51;
    const moving = activity > 0.018;
    this.motionBlend += ((moving ? 1 : 0) - this.motionBlend) * (1 - Math.exp(-delta * 10));
    this.bobPhase += delta * TAU * clamp(activity / 0.13, 1.7, 4.6);
    const bob = Math.sin(this.bobPhase * 2) * this.options.bodyBob * this.motionBlend;
    this.heading = heading;
    this.placeRoot(position, heading, bob);

    let swinging = false;
    for (const leg of this.legs) {
      this.neutralFoot(leg, position, heading, leg.ideal);
      if (!leg.swinging) continue;
      leg.elapsed += delta;
      const phase = Math.min(1, leg.elapsed / leg.duration);
      const eased = smoothStep(phase);
      leg.target.lerpVectors(leg.swingStart, leg.swingEnd, eased);
      const lift = Math.sin(Math.PI * phase);
      leg.target.y += lift * lift * this.options.stepHeight;
      leg.footYaw = leg.startYaw + angleDelta(leg.startYaw, leg.endYaw) * eased;
      if (phase >= 1) {
        leg.swinging = false;
        leg.target.copy(leg.swingEnd);
        leg.footYaw = leg.endYaw;
      } else swinging = true;
    }
    if (swinging) this.activePair = Math.max(0, this.activePair);
    else this.activePair = -1;

    if (this.activePair === -1) {
      const pairDistances = this.pairs.map((pair) => Math.max(...pair.map((index) => {
        const leg = this.legs[index];
        return Math.hypot(leg.target.x - leg.ideal.x, leg.target.z - leg.ideal.z);
      })));
      const alternate = 1 - this.lastPair;
      let nextPair = pairDistances[alternate] >= this.options.stepThreshold ? alternate : -1;
      if (nextPair === -1 && pairDistances[this.lastPair] >= this.options.stepThreshold * 1.18) {
        nextPair = this.lastPair;
      }
      if (nextPair !== -1) this.beginPair(nextPair, position, heading, activity);
    }

    this.root.updateMatrixWorld(true);
    let requiredCrouch = 0;
    for (const leg of this.legs) {
      leg.upper.getWorldPosition(this.hip);
      const planarDistance = Math.hypot(this.hip.x - leg.target.x, this.hip.z - leg.target.z);
      const verticalReach = Math.sqrt(Math.max(0, leg.maximumReach ** 2 - planarDistance ** 2));
      requiredCrouch = Math.max(
        requiredCrouch,
        this.hip.y - leg.target.y - verticalReach + this.extraCrouch + 0.001,
      );
    }
    const nextCrouch = clamp(
      Math.max(requiredCrouch, this.extraCrouch * Math.exp(-delta * 8)),
      0,
      this.options.maxExtraCrouch,
    );
    if (Math.abs(nextCrouch - this.extraCrouch) > 1e-7) {
      this.extraCrouch = nextCrouch;
      this.placeRoot(position, heading, bob);
      this.root.updateMatrixWorld(true);
    }
    for (const leg of this.legs) this.solveLeg(leg);
    this.root.updateMatrixWorld(true);
    this.lastPosition.copy(position);
  }

  beginPair(pairIndex, position, heading, activity) {
    this.activePair = pairIndex;
    this.lastPair = pairIndex;
    const duration = clamp(this.options.swingDuration + (0.35 - activity) * 0.06, 0.1, 0.155);
    const lead = duration + this.options.landingLeadTime;
    this.futurePosition.copy(position).addScaledVector(this.velocity, lead);
    const futureHeading = heading + clamp(this.angularSpeed * lead, -0.27, 0.27);
    for (const index of this.pairs[pairIndex]) {
      const leg = this.legs[index];
      leg.swingStart.copy(leg.target);
      this.neutralFoot(leg, this.futurePosition, futureHeading, leg.swingEnd);
      leg.swinging = true;
      leg.elapsed = 0;
      leg.duration = duration;
      leg.startYaw = leg.footYaw;
      leg.endYaw = futureHeading;
    }
  }

  solveLeg(leg) {
    leg.upper.getWorldPosition(this.hip);
    this.direction.copy(leg.target).sub(this.hip);
    const requestedReach = this.direction.length();
    this.direction.divideScalar(Math.max(requestedReach, 1e-9));
    const minimumReach = Math.abs(leg.lowerLength - leg.upperLength) + 0.0006;
    const reach = clamp(requestedReach, minimumReach, leg.maximumReach);
    this.ikTarget.copy(this.hip).addScaledVector(this.direction, reach);
    this.pole.copy(leg.restPole).applyQuaternion(this.actorQ);
    this.pole.addScaledVector(this.direction, -this.pole.dot(this.direction));
    if (this.pole.lengthSq() < 1e-8) {
      this.pole.set(1, 0, 0).applyQuaternion(this.actorQ);
      this.pole.addScaledVector(this.direction, -this.pole.dot(this.direction));
    }
    this.pole.normalize();
    const along = (leg.upperLength ** 2 - leg.lowerLength ** 2 + reach ** 2) / (2 * reach);
    const away = Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2));
    this.knee.copy(this.hip).addScaledVector(this.direction, along).addScaledVector(this.pole, away);

    this.direction.copy(this.knee).sub(this.hip).normalize();
    this.referenceDirection.copy(leg.restUpperDirection).applyQuaternion(this.actorQ);
    this.deltaQ.setFromUnitVectors(this.referenceDirection, this.direction);
    this.referenceQ.multiplyQuaternions(this.actorQ, leg.restUpperWorldQ);
    this.desiredQ.multiplyQuaternions(this.deltaQ, this.referenceQ);
    leg.upper.parent.getWorldQuaternion(this.parentQ).invert();
    leg.upper.quaternion.multiplyQuaternions(this.parentQ, this.desiredQ).normalize();
    leg.upper.updateWorldMatrix(false, true);

    leg.lower.getWorldPosition(this.knee);
    this.direction.copy(this.ikTarget).sub(this.knee).normalize();
    this.referenceDirection.copy(leg.restLowerDirection).applyQuaternion(this.actorQ);
    this.deltaQ.setFromUnitVectors(this.referenceDirection, this.direction);
    this.referenceQ.multiplyQuaternions(this.actorQ, leg.restLowerWorldQ);
    this.desiredQ.multiplyQuaternions(this.deltaQ, this.referenceQ);
    leg.upper.getWorldQuaternion(this.parentQ).invert();
    leg.lower.quaternion.multiplyQuaternions(this.parentQ, this.desiredQ).normalize();
    leg.lower.updateWorldMatrix(false, true);

    this.footQ.setFromAxisAngle(UP, leg.footYaw).multiply(leg.restFootWorldQ);
    leg.lower.getWorldQuaternion(this.parentQ).invert();
    leg.foot.quaternion.multiplyQuaternions(this.parentQ, this.footQ).normalize();
    leg.foot.updateWorldMatrix(false, true);
  }
}

export function createOpeningEchoLayer(host) {
  const layer = document.createElement('div');
  layer.className = 'opening-echo-layer';
  const backgroundVideo = document.createElement('video');
  backgroundVideo.className = 'opening-echo-background';
  backgroundVideo.src = '/intro/assets/opening/opening-background-pingpong.mp4';
  backgroundVideo.autoplay = true;
  backgroundVideo.loop = true;
  backgroundVideo.muted = true;
  backgroundVideo.defaultPlaybackRate = 0.5;
  backgroundVideo.playbackRate = 0.5;
  backgroundVideo.playsInline = true;
  backgroundVideo.preload = 'auto';
  layer.append(backgroundVideo);
  host.append(layer);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.domElement.className = 'opening-echo-canvas';
  layer.append(renderer.domElement);
  backgroundVideo.play().catch(() => {});

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 9.5, 22);
  camera.lookAt(0, 0.76, 0);
  camera.updateMatrixWorld(true);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x26384d, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(3, 8, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb6d5ff, 1.1);
  fill.position.set(-4, 4, -5);
  scene.add(fill);

  const raycaster = new THREE.Raycaster();
  const walkingPlane = new THREE.Plane(UP, -0.76);
  const pointer = new THREE.Vector2();
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const random = seededRandom(803);
  let gait = null;
  let width = 1;
  let height = 1;
  let heading = 0;
  let speed = 0;
  let pause = 0;
  let previousTime = 0;
  let frame = 0;
  let disposed = false;

  const screenToGround = (u, v, output) => {
    pointer.set(u * 2 - 1, 1 - v * 2);
    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(walkingPlane, output);
    return output;
  };

  const groundToScreen = (world) => {
    projected.copy(world);
    projected.y = 0.76;
    projected.project(camera);
    return { u: (projected.x + 1) / 2, v: (1 - projected.y) / 2 };
  };

  const pickTarget = () => {
    const current = groundToScreen(position);
    let u = 0.5;
    let v = 0.6;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      u = THREE.MathUtils.lerp(0.215, 0.785, random());
      v = THREE.MathUtils.lerp(0.16, 0.845, random());
      const distance = Math.hypot((u - current.u) * 0.65, v - current.v);
      const blocksCopy = u > 0.035 && u < 0.965 && v > 0.39 && v < 0.53;
      if (distance > 0.13 && distance < 0.47 && !blocksCopy) break;
    }
    screenToGround(u, v, target);
  };

  const resize = () => {
    if (disposed) return;
    const current = gait ? groundToScreen(position) : null;
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const viewHeight = 9.4;
    const aspect = width / height;
    camera.left = -viewHeight * aspect / 2;
    camera.right = -camera.left;
    camera.top = viewHeight / 2;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      1.5,
      Math.sqrt(2073600 / (width * height)),
    );
    renderer.setPixelRatio(Math.max(0.35, pixelRatio));
    renderer.setSize(width, height, false);
    if (current && gait) {
      screenToGround(clamp(current.u, 0.215, 0.785), clamp(current.v, 0.16, 0.845), position);
      gait.reset(position, heading);
      pickTarget();
    }
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const animate = (time) => {
    frame = 0;
    if (disposed) return;
    const delta = clamp(previousTime ? (time - previousTime) / 1000 : 0, 0, 0.05);
    previousTime = time;
    if (gait) {
      if (pause > 0) {
        pause = Math.max(0, pause - delta);
        speed = Math.max(0, speed - delta);
        if (pause === 0) pickTarget();
      } else {
        direction.subVectors(target, position);
        direction.y = 0;
        const distance = direction.length();
        if (distance < 0.06) {
          pause = 0.45 + random() * 0.65;
          speed = 0;
        } else {
          const wantedHeading = Math.atan2(direction.x, direction.z);
          const turn = angleDelta(heading, wantedHeading);
          heading += clamp(turn, -1.8 * delta, 1.8 * delta);
          const alignment = clamp(1 - Math.abs(turn) / 0.7, 0, 1);
          const wantedSpeed = Math.min(0.5 * alignment, Math.sqrt(1.9 * Math.max(0, distance - 0.04)));
          speed += clamp(wantedSpeed - speed, -delta * 1.2, delta * 0.85);
          if (speed > 0) position.addScaledVector(direction.normalize(), Math.min(speed * delta, distance));
        }
      }
      gait.update(delta, { position, heading, speed });
    }
    renderer.render(scene, camera);
    frame = window.requestAnimationFrame(animate);
  };
  frame = window.requestAnimationFrame(animate);

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
    ECHO_RIG_URL,
    (gltf) => {
      if (disposed) return;
      gltf.scene.traverse((object) => {
        if (object.isSkinnedMesh) {
          object.frustumCulled = false;
          for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
            tuneEchoMaterial(material);
          }
        }
      });
      gait = new EchoSpiderGait(gltf.scene);
      scene.add(gait.root);
      screenToGround(0.28, 0.71, position);
      screenToGround(0.66, 0.66, target);
      heading = Math.atan2(target.x - position.x, target.z - position.z);
      gait.reset(position, heading);
      gait.update(1 / 60, { position, heading, speed: 0 });
      layer.classList.add('is-ready');
    },
    undefined,
    (error) => {
      console.error('[Opening ECHO] load failed', error);
    },
  );

  return {
    fadeOut() { layer.classList.add('is-leaving'); },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      backgroundVideo.pause();
      backgroundVideo.removeAttribute('src');
      backgroundVideo.load();
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      gait?.root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of entries) if (material) materials.add(material);
      });
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
        material.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      layer.remove();
    },
  };
}
