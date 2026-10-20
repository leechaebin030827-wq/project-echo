import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CharacterAnimator } from './CharacterAnimator.js';
import { CharacterBehavior, NevadaRoamingBehavior } from './CharacterBehavior.js';
import { FaceMaterialController } from '../face/FaceMaterialController.js';
import { FaceMorphController } from '../face/FaceMorphController.js';

export class CharacterEntity {
  constructor({
    id, baseAsset, navigation, routeIndex, scale = 1, roaming = false, nevadaNpc = roaming,
  }) {
    this.id = id;
    this.baseId = baseAsset.base;
    this.navigation = navigation;
    this.nevadaNpc = nevadaNpc;
    this.focused = false;
    this.danceGroup = null;
    this.conversation = null;
    this.conversationIndex = -1;
    this.speechRemaining = 0;
    this.speechDuration = 0;
    this.speechElapsed = 0;
    this.speechOpen = 0;
    this.speechRitual = false;
    this.ambientPose = null;
    this.ambientAge = 0;
    this.ritualHovered = false;
    this.ritualHoverWeight = 0;
    let seed = [...id].reduce((value, character) => value * 31 + character.charCodeAt(0), 7);
    this.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    this.root = new THREE.Group();
    this.root.name = id;
    this.model = clone(baseAsset.scene);
    this.root.add(this.model);
    this.root.scale.setScalar(scale);
    this.meshes = [];
    this.skinnedMeshes = [];
    this.ritualBoneRest = new Map();
    this.headBone = null;
    this.neckBone = null;
    this.walkSpineBone = null;
    this.faceMeshes = [];
    this.bodyMaterialEntries = [];
    this.distantFillColor = new THREE.Color('#fff1d4');
    this.distanceFillAmount = -1;
    this.root.traverse((object) => {
      object.userData.entityId = id;
      if (object.isBone && /head$/i.test(object.name) && !this.headBone) this.headBone = object;
      if (object.isBone && /^neck$/i.test(object.name) && !this.neckBone) this.neckBone = object;
      if (object.isBone && /^spine$/i.test(object.name) && !this.walkSpineBone) this.walkSpineBone = object;
      if (object.isBone) this.ritualBoneRest.set(object, {
        position: object.position.clone(),
        rotation: object.quaternion.clone(),
        scale: object.scale.clone(),
      });
      if (!object.isMesh) return;
      this.meshes.push(object);
      object.castShadow = false;
      object.receiveShadow = false;
      if (object.isSkinnedMesh) this.skinnedMeshes.push(object);
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const materials = sourceMaterials.map((material) => (
        material.name === 'FACE' ? material : material.clone()
      ));
      object.material = Array.isArray(object.material) ? materials : materials[0];
      object.geometry.computeBoundingBox();
      const meshMinimumY = object.geometry.boundingBox?.min.y ?? 0;
      const meshHeight = Math.max(0.001, object.geometry.boundingBox?.max.y - meshMinimumY);
      if (materials.some((material) => material.name === 'FACE')) this.faceMeshes.push(object);
      for (const material of materials) {
        if (material.name === 'FACE' || !material.emissive?.isColor) continue;
        const baseEmissive = material.emissive.clone();
        const baseColor = material.color.clone();
        // Brighten the lit albedo itself so texture contrast survives at a
        // distance. Emissive is kept deliberately weak; a strong emissive fill
        // makes small walkers look fogged or semi-transparent.
        const distantColor = baseColor.clone().multiplyScalar(1.08);
        const distantEmissive = baseEmissive.clone();
        const visibilityFill = { value: 0 };
        const repairN01Trouser = id === 'N01';
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uCharacterVisibilityFill = visibilityFill;
          shader.uniforms.uCharacterMeshMinimumY = { value: meshMinimumY };
          shader.uniforms.uCharacterMeshHeight = { value: meshHeight };
          shader.uniforms.uRepairN01Trouser = { value: repairN01Trouser ? 1 : 0 };
          shader.uniforms.uN01DenimColor = { value: new THREE.Color('#6089ad') };
          shader.vertexShader = `uniform float uCharacterMeshMinimumY;
            uniform float uCharacterMeshHeight;
            varying float vCharacterBodyHeight;
            varying float vCharacterLegWeight;\n${shader.vertexShader}`;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <skinning_vertex>',
            `vCharacterBodyHeight = clamp(
              (position.y - uCharacterMeshMinimumY) / uCharacterMeshHeight, 0.0, 1.0
            );
            vec4 characterLegJoint = step(vec4(15.5), skinIndex)
              * (vec4(1.0) - step(vec4(23.5), skinIndex));
            vCharacterLegWeight = dot(skinWeight, characterLegJoint);
            #include <skinning_vertex>`,
          );
          shader.fragmentShader = `uniform float uCharacterVisibilityFill;
            uniform float uRepairN01Trouser;
            uniform vec3 uN01DenimColor;
            varying float vCharacterBodyHeight;
            varying float vCharacterLegWeight;\n${shader.fragmentShader}`;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            `float characterLuminance = dot(
              diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)
            );
            float n01LowerLegBand = smoothstep(0.06, 0.11, vCharacterBodyHeight)
              * (1.0 - smoothstep(0.45, 0.52, vCharacterBodyHeight));
            float n01TrouserRepair = uRepairN01Trouser * n01LowerLegBand
              * smoothstep(0.35, 0.75, vCharacterLegWeight);
            vec3 n01Denim = uN01DenimColor
              * mix(0.62, 1.14, smoothstep(0.08, 0.72, characterLuminance));
            outgoingLight = mix(outgoingLight, n01Denim, n01TrouserRepair * 0.92);
            outgoingLight += diffuseColor.rgb * uCharacterVisibilityFill * 0.72;
            #include <opaque_fragment>`,
          );
        };
        material.customProgramCacheKey = () => `echo-character-visibility-fill-n01-trouser-v3-${repairN01Trouser ? 1 : 0}`;
        this.bodyMaterialEntries.push({
          material,
          baseColor,
          distantColor,
          baseEmissive,
          baseIntensity: material.emissiveIntensity ?? 0,
          distantEmissive,
          visibilityFill,
        });
      }
    });

    const sharedSkeletons = new Map();
    for (const mesh of this.skinnedMeshes) {
      const key = mesh.skeleton.bones.map((bone) => bone.uuid).join(',');
      if (sharedSkeletons.has(key)) mesh.skeleton = sharedSkeletons.get(key);
      else sharedSkeletons.set(key, mesh.skeleton);
    }
    this.skeletons = [...sharedSkeletons.values()];
    this.animator = new CharacterAnimator(this.root, baseAsset.animations, this.random);
    this.faceController = new FaceMaterialController(this.root);
    this.faceMorphController = null;
    this.root.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(this.root);
    this.height = baseAsset.renderHeight * scale;
    if (!this.headBone || !this.faceMeshes.length || !this.skeletons.length) {
      throw new Error(`${id}에 얼굴/머리/스켈레톤 semantic 데이터가 없습니다.`);
    }
    this.headOffset = this.headBone.worldToLocal(
      new THREE.Box3().setFromObject(this.faceMeshes[0]).getCenter(new THREE.Vector3()),
    );
    this.faceDirectionMesh = this.faceMeshes[0];
    this.faceSurfaceNormal = this.computeFaceSurfaceNormal(this.faceDirectionMesh);
    this.headForwardLocal = this.faceSurfaceNormal.clone()
      .transformDirection(this.faceDirectionMesh.matrixWorld)
      .applyQuaternion(this.headBone.getWorldQuaternion(new THREE.Quaternion()).invert());
    this.headRestQuaternion = this.headBone.quaternion.clone();
    this.neckRestQuaternion = this.neckBone?.quaternion.clone();
    this.conversationHeadOffset = 0;
    this.idleHeadOffset = 0;
    this.idleHeadRotation = new THREE.Quaternion();
    this.idleHeadAxis = new THREE.Vector3(0, 1, 0);
    this.walkObservationAge = this.random() * Math.PI * 2;
    this.walkSpineOffset = 0;
    this.walkSpineRotation = new THREE.Quaternion();
    this.walkSpineAxis = new THREE.Vector3(0, 0, 1);
    this.echoObserveHeadOffset = 0;
    this.echoObserveHeadRotation = new THREE.Quaternion();
    this.echoObserveHeadAxis = new THREE.Vector3(1, 0, 0);
    this.conversationHeadRotation = new THREE.Quaternion();
    this.conversationHeadAxis = new THREE.Vector3(1, 0, 0);
    this.headLookStartQuaternion = this.headRestQuaternion.clone();
    this.headLookUpQuaternion = this.headRestQuaternion.clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.74));
    this.lookingUp = false;
    this.lookUpElapsed = 0;
    this.lookUpDelay = 0.9;
    this.lookUpDuration = 3.1;
    this.createHitVolume();
    this.createFootGlow();
    this.behavior = roaming
      ? new NevadaRoamingBehavior(this, navigation, routeIndex, this.random)
      : new CharacterBehavior(this, navigation, routeIndex, this.random);
  }

  createHitVolume() {
    const geometry = new THREE.CapsuleGeometry(
      Math.max(0.56, this.height * 0.33),
      Math.max(0.62, this.height * 0.78),
      4,
      8,
    );
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    });
    this.hitVolume = new THREE.Mesh(geometry, material);
    this.hitVolume.name = `${this.id}-hit-volume`;
    this.hitVolume.userData.entityId = this.id;
    this.hitVolume.position.y = this.height * 0.5;
    this.root.add(this.hitVolume);
  }

  computeFaceSurfaceNormal(mesh) {
    const geometry = mesh.geometry;
    const normals = geometry.attributes.normal;
    if (!normals) return new THREE.Vector3(0, 0, 1);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const faceMaterialIndices = new Set();
    materials.forEach((material, index) => {
      if (material.name === 'FACE') faceMaterialIndices.add(index);
    });
    const groups = geometry.groups.length
      ? geometry.groups.filter((group) => faceMaterialIndices.has(group.materialIndex))
      : [{ start: 0, count: geometry.index?.count ?? normals.count }];
    const direction = new THREE.Vector3();
    for (const group of groups) {
      const end = Math.min(group.start + group.count, geometry.index?.count ?? normals.count);
      for (let offset = group.start; offset < end; offset += 1) {
        const vertexIndex = geometry.index ? geometry.index.getX(offset) : offset;
        direction.x += normals.getX(vertexIndex);
        direction.y += normals.getY(vertexIndex);
        direction.z += normals.getZ(vertexIndex);
      }
    }
    return direction.lengthSq() > 1e-6 ? direction.normalize() : new THREE.Vector3(0, 0, 1);
  }

  createFootGlow() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 239, 179, 0.96)');
    gradient.addColorStop(0.32, 'rgba(255, 202, 92, 0.58)');
    gradient.addColorStop(1, 'rgba(255, 166, 54, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.name = `${this.id}-foot-glow-texture`;
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: '#ffd06a',
      opacity: 0.16,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.footGlow = new THREE.Sprite(material);
    this.footGlow.name = `${this.id}-foot-glow`;
    this.footGlow.position.y = this.height * 0.12;
    this.footGlow.scale.set(this.height * 1.08, this.height * 0.38, 1);
    this.footGlow.renderOrder = 2;
    this.root.add(this.footGlow);

    this.glowTime = this.random() * Math.PI * 2;
    this.footGlowBaseOpacity = 0.16;
    this.footGlowFocusedOpacity = 0.075;
  }

  play(name) {
    if (name === 'idle' && this.conversation) {
      // Keep a natural planted walk pose during a stationary conversation;
      // the conversation head gesture continues without walking in place.
      this.animator.hold('walk', 0);
      return;
    }
    this.animator.play(name === 'idle' ? 'walk' : name);
  }
  setAmbientPose(type, position, facing) {
    this.ambientPose = type;
    this.ambientAge = this.random() * Math.PI * 2;
    this.ambientRotation = new THREE.Quaternion();
    this.ambientEuler = new THREE.Euler();
    this.behavior.state = 'walk';
    this.behavior.wait = Infinity;
    this.root.position.copy(position);
    this.root.rotation.y = facing;
    if (type === 'ritual') {
      const number = Number.parseInt(this.id.replace(/\D/g, ''), 10) || 1;
      const seed = number - 1;
      this.ritualStyle = {
        phase: (seed * 2.3999632297) % 9.6,
        variant: seed % 4,
        leadLeft: number % 2 === 0,
        // Different resting angles and reach make each person's silhouette
        // distinct, even while the larger greeting gesture is at rest.
        leftRest: -1.3 + ((seed * 5) % 7) * 0.035,
        rightRest: 1.3 - ((seed * 4) % 7) * 0.035,
        leftReach: 1.42 + ((seed * 7) % 11) * 0.055,
        rightReach: 1.38 + ((seed * 5 + 3) % 11) * 0.055,
        leftPeriod: 7.2 + ((seed * 3) % 5) * 0.4,
        rightPeriod: 7.6 + ((seed * 4 + 2) % 5) * 0.42,
      };
      this.animator.stop();
    } else this.animator.play('walk');
    this.ambientBones = new Map();
    this.root.traverse((object) => {
      if (object.isBone && /^(Head|Neck|Spine|Spine01|Spine02|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)$/.test(object.name)) {
        this.ambientBones.set(object.name, { bone: object, rest: object.quaternion.clone() });
      }
    });
  }

  endRitualPose() {
    this.ritualHovered = false;
    this.animator.stop();
    this.ritualExitPose = new Map([...this.ritualBoneRest.keys()].map((bone) => [bone, {
      position: bone.position.clone(),
      rotation: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    }]));
    this.ritualExitModelY = this.model.position.y;
    this.ritualExitElapsed = 0;
    this.ambientPose = 'dispersing';
  }

  updateAmbientPose(delta) {
    this.ambientAge += delta;
    const t = this.ambientAge;
    const breathe = Math.sin(t * 1.6);
    const turn = Math.sin(t * 0.48);
    // Other ambient states layer on their current animation. The ritual uses
    // the stored bind pose, so its limbs stay planted while the gestures loop.
    for (const entry of this.ambientBones.values()) entry.rest.copy(entry.bone.quaternion);
    const move = (name, x = 0, y = 0, z = 0) => {
      const entry = this.ambientBones.get(name);
      if (entry) entry.bone.quaternion.copy(entry.rest)
        .multiply(this.ambientRotation.setFromEuler(this.ambientEuler.set(x, y, z)));
    };
    if (this.ambientPose === 'dispersing' && this.ritualExitPose) {
      this.ritualExitElapsed += delta;
      const blend = THREE.MathUtils.smootherstep(this.ritualExitElapsed, 0, 0.62);
      for (const [bone, from] of this.ritualExitPose) {
        const rest = this.ritualBoneRest.get(bone);
        bone.position.lerpVectors(from.position, rest.position, blend);
        bone.quaternion.slerpQuaternions(from.rotation, rest.rotation, blend);
        bone.scale.lerpVectors(from.scale, rest.scale, blend);
      }
      this.model.position.y = THREE.MathUtils.lerp(this.ritualExitModelY, 0, blend);
      if (blend >= 1) this.ritualExitPose = null;
    } else if (this.ambientPose === 'ritual') {
      const style = this.ritualStyle;
      this.ritualHoverWeight = THREE.MathUtils.damp(
        this.ritualHoverWeight, this.ritualHovered ? 1 : 0, 2.8, delta,
      );
      const phase = (t + style.phase) % 9.6;
      // Each gesture returns to its resting pose with zero velocity, so the
      // cycle joins cleanly even when people start at different phases.
      const gesture = (start, end) => {
        if (phase <= start || phase >= end) return 0;
        return Math.sin(Math.PI * (phase - start) / (end - start)) ** 2;
      };
      const breath = 0.5 - 0.5 * Math.cos((t + style.phase * 0.55) * Math.PI * 2 / 4.8);
      // Both arms travel through a full, slow gesture without the long idle
      // gap of a one-shot pulse. Their periods and phases differ per person.
      const leftGreeting = Math.min(1, 0.5 - 0.5 * Math.cos(
        (t + style.phase + (style.leadLeft ? 1.1 : 1.8)) * Math.PI * 2 / style.leftPeriod,
      ) + this.ritualHoverWeight * 0.16);
      const rightGreeting = Math.min(1, 0.5 - 0.5 * Math.cos(
        (t + style.phase + (style.leadLeft ? 1.8 : 1.1)) * Math.PI * 2 / style.rightPeriod,
      ) + this.ritualHoverWeight * 0.16);
      const curious = gesture(4.9, 8.8);
      const kneeBend = style.variant === 1 || style.variant === 3
        ? gesture(4.2, 8.7) * (style.variant === 1 ? 0.32 : 0.42) : 0;
      const leftKnee = style.variant === 1 ? kneeBend : style.variant === 3 ? kneeBend * 0.75 : 0;
      const rightKnee = style.variant === 3 ? kneeBend * 0.85 : 0;
      const sway = Math.sin(t * 0.7 + style.phase) * 0.025;
      // These slower, independent motions continue between greetings. Using
      // continuous time also avoids a hitch when the gesture cycle wraps.
      const leftDrift = Math.sin(t * 0.83 + style.phase * 0.7) * 0.055
        + Math.sin(t * 1.31 + style.phase) * 0.018;
      const rightDrift = Math.sin(t * 0.76 + style.phase + 1.4) * 0.052
        + Math.sin(t * 1.17 + style.phase * 0.4) * 0.019;
      const leftHand = Math.sin(t * 1.8 + style.phase) * (0.025 + leftGreeting * 0.035);
      const rightHand = Math.sin(t * 1.65 + style.phase + 0.7) * (0.025 + rightGreeting * 0.035);
      const reach = (leftGreeting + rightGreeting) * 0.5;
      this.model.position.y = -(leftKnee + rightKnee) * 0.075;
      move('Spine', -0.04 - breath * 0.045 - reach * 0.095 + kneeBend * 0.08,
        sway, (leftGreeting - rightGreeting) * 0.055);
      move('Spine01', -0.025 - breath * 0.025 - reach * 0.045, 0, 0);
      move('LeftArm', -0.1 - leftGreeting * 0.1 + leftDrift * 0.35, 0,
        style.leftRest + breath * 0.045 + leftDrift + leftGreeting * style.leftReach);
      move('RightArm', -0.1 - rightGreeting * 0.1 + rightDrift * 0.35, 0,
        style.rightRest - breath * 0.045 - rightDrift - rightGreeting * style.rightReach);
      move('LeftForeArm', -0.1 - leftGreeting * 0.42 - leftDrift * 0.55,
        -leftHand, -leftGreeting * 0.1);
      move('RightForeArm', -0.1 - rightGreeting * 0.42 - rightDrift * 0.55,
        rightHand, rightGreeting * 0.1);
      move('LeftHand', 0, -leftHand * 0.6, -leftHand * 0.4);
      move('RightHand', 0, rightHand * 0.6, rightHand * 0.4);
      move('LeftUpLeg', -leftKnee * 0.72, 0, 0);
      move('LeftLeg', leftKnee * 1.1, 0, 0);
      move('RightUpLeg', -rightKnee * 0.72, 0, 0);
      move('RightLeg', rightKnee * 1.1, 0, 0);
      move('Neck', -0.025, curious * sway,
        (leftGreeting - rightGreeting) * 0.04 + curious * (style.leadLeft ? -0.05 : 0.05));
      move('Head', -0.08 - breath * 0.035,
        curious * Math.sin(t * 0.8 + style.phase) * 0.045,
        curious * (style.leadLeft ? -0.12 : 0.12));
      this.aimRitualHeadAtEcho();
    } else if (this.ambientPose === 'lean') {
      move('Spine', 0.08 + breathe * 0.03, turn * 0.025, -0.11 + Math.sin(t * 0.6) * 0.04);
      move('Spine01', 0, 0, -0.08);
      move('LeftArm', -0.28 + Math.sin(t * 0.7) * 0.07, 0, -0.28);
      move('LeftForeArm', -0.35 + Math.sin(t * 1.1) * 0.08, 0, 0);
      move('RightArm', -0.1 + breathe * 0.05, 0, 0.1);
      move('Head', -0.03, turn * 0.2, 0.05);
    } else if (this.ambientPose === 'sit') {
      this.model.position.y = -0.39 + breathe * 0.012;
      move('Spine', -0.11 + breathe * 0.04, turn * 0.04, Math.sin(t * 0.55) * 0.045);
      move('LeftUpLeg', -1.16, 0, -0.07);
      move('RightUpLeg', -1.16, 0, 0.07);
      move('LeftLeg', 1.28 + Math.sin(t * 1.35) * 0.17, 0, 0);
      move('RightLeg', 1.28 - Math.sin(t * 1.35) * 0.13, 0, 0);
      move('LeftArm', -0.22 + Math.sin(t * 0.9) * 0.1, 0, -0.14);
      move('RightArm', -0.22 - Math.sin(t * 0.9) * 0.08, 0, 0.14);
      move('Head', -0.06 + Math.sin(t * 0.8) * 0.04, turn * 0.25, 0);
    } else if (this.ambientPose === 'observe') {
      move('Spine', 0.015 + breathe * 0.01, turn * 0.025, 0);
      move('Head', 0.04 + Math.sin(t * 0.9) * 0.025, turn * 0.2, 0);
    } else if (this.ambientPose === 'stretch') {
      const reach = 0.5 + 0.5 * Math.sin(t * 0.7);
      move('Spine', -0.04 - reach * 0.08, 0, 0);
      move('LeftArm', -0.12 - reach * 0.28, 0, -0.08);
      move('RightArm', -0.12 - reach * 0.28, 0, 0.08);
      move('Head', -0.06 - reach * 0.09, turn * 0.05, 0);
    }
  }
  setFaceTexture(texture) { this.faceController.set(texture); }
  speakFor(seconds, { ritual = false } = {}) {
    this.speechDuration = Math.max(0, seconds);
    this.speechRemaining = this.speechDuration;
    this.speechElapsed = 0;
    this.speechRitual = ritual;
  }

  stopSpeaking() {
    this.speechRemaining = 0;
    this.speechDuration = 0;
    this.speechOpen = 0;
    this.speechRitual = false;
    this.faceController.setSpeechOpen(0);
  }

  updateSpeech(delta) {
    let target = 0;
    if ((this.focused || this.speechRitual) && this.speechRemaining > 0) {
      this.speechRemaining = Math.max(0, this.speechRemaining - delta);
      this.speechElapsed += delta;
      const time = this.speechElapsed;
      const syllables = Math.max(0, 0.5
        + Math.sin(time * 12.8 + this.id.length) * 0.42
        + Math.sin(time * 19.6 + this.id.charCodeAt(0)) * 0.24);
      const pause = Math.sin(time * 2.8 + this.id.length) > -0.55 ? 1 : 0.15;
      const fadeIn = THREE.MathUtils.smoothstep(time, 0, 0.12);
      const fadeOut = THREE.MathUtils.smoothstep(this.speechRemaining, 0, 0.18);
      target = Math.min(1, syllables) * pause * fadeIn * fadeOut;
    }
    this.speechOpen = THREE.MathUtils.damp(this.speechOpen, target, 18, delta);
    this.faceController.setSpeechOpen(this.speechOpen);
  }
  applyFaceShape(profile, canonical, options = {}) {
    this.faceMorphController ??= new FaceMorphController(
      this.faceMeshes,
      canonical,
      this.baseId,
      { allMeshes: this.meshes, ...options },
    );
    return this.faceMorphController.apply(profile);
  }
  applyFaceShapeQa(canonical, preset = 'wide', options = {}) {
    this.faceMorphController ??= new FaceMorphController(
      this.faceMeshes,
      canonical,
      this.baseId,
      { allMeshes: this.meshes, ...options },
    );
    const baseline = this.faceMorphController.baseline;
    if (!baseline) return { applied: false, reason: 'mapping' };
    const factors = preset === 'long'
      ? { faceAspectRatio: 0.78, jawWidth: 0.88, chinLength: 1.22, cheekWidth: 0.9 }
      : preset === 'narrow'
        ? { faceAspectRatio: 0.8, jawWidth: 0.78, cheekWidth: 0.82, mouthWidth: 0.84 }
        : { faceAspectRatio: 1.22, jawWidth: 1.24, cheekWidth: 1.2, eyeSpacing: 1.18, mouthWidth: 1.2 };
    const profile = { ...baseline, valid: true, quality: 1 };
    for (const [key, factor] of Object.entries(factors)) profile[key] = baseline[key] * factor;
    return this.faceMorphController.apply(profile);
  }
  resetFaceShape() { this.faceMorphController?.reset(); }
  resetFaceIdentity() {
    this.faceController.reset();
    this.resetFaceShape();
  }
  setWorldMode(mode) {
    const hamina = mode === 'hamina';
    this.footGlowBaseOpacity = hamina ? 0.27 : 0.19;
    this.footGlowFocusedOpacity = hamina ? 0.15 : 0.1;
    this.footGlow.material.color.set(hamina ? '#ffd985' : '#ffc65c');
    this.footGlow.material.blending = hamina ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.footGlow.material.needsUpdate = true;
    const width = this.height * (hamina ? 1.28 : 1.08);
    const height = this.height * (hamina ? 0.44 : 0.38);
    this.footGlow.scale.set(width, height, 1);
  }
  setLookingUp(active) {
    this.lookingUp = active;
    this.lookUpElapsed = 0;
    if (active) {
      if (this.ambientPose === 'ritual') this.animator.stop();
      else this.animator.play('walk');
      // Begin every split portrait in a clean, direct gaze. The animation
      // mixer may have left the head looking sideways during the walk cycle.
      this.headBone.quaternion.copy(this.headRestQuaternion);
      this.conversationHeadOffset = 0;
      this.headLookStartQuaternion.copy(this.headRestQuaternion);
      this.headBone.updateMatrixWorld(true);
    } else if (this.ambientPose === 'ritual') this.animator.stop();
    else this.animator.play('walk');
  }

  getHeadWorldPosition(target = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return target.copy(this.headOffset).applyMatrix4(this.headBone.matrixWorld);
  }

  getHeadDirection(target = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return target.copy(this.headForwardLocal)
      .applyQuaternion(this.headBone.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
  }

  aimRitualHeadAtEcho() {
    const echo = this.navigation.world?.echoCenter;
    if (!echo) return;
    const facing = this.getHeadDirection(new THREE.Vector3());
    const desired = echo.clone().sub(this.getHeadWorldPosition(new THREE.Vector3())).normalize();
    const correction = new THREE.Quaternion().setFromUnitVectors(facing, desired);
    const headWorld = this.headBone.getWorldQuaternion(new THREE.Quaternion());
    const parentWorldInverse = this.headBone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.headBone.quaternion.copy(parentWorldInverse.multiply(correction.multiply(headWorld)));
  }

  getFaceSurfaceDirection(target = new THREE.Vector3()) {
    this.faceDirectionMesh.updateMatrixWorld(true);
    return target.copy(this.faceSurfaceNormal)
      .transformDirection(this.faceDirectionMesh.matrixWorld)
      .normalize();
  }

  getLookUpProgress() {
    if (!this.lookingUp) return 0;
    const progress = THREE.MathUtils.clamp(
      (this.lookUpElapsed - this.lookUpDelay) / this.lookUpDuration,
      0,
      1,
    );
    return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
  }

  update(delta, camera, neighbors = []) {
    if (!this.lookingUp && !this.danceGroup && !this.conversation && !this.ambientPose) this.behavior.update(delta, neighbors);
    const distance = this.root.position.distanceTo(camera.position);
    const distantFill = THREE.MathUtils.smoothstep(distance, 9, 42);
    this.updateDistanceFill(distantFill);
    // Remove the previous gesture before the mixer updates; distant mixers can
    // skip frames, so applying an offset repeatedly would otherwise accumulate.
    if (this.conversationHeadOffset) {
      this.headBone.quaternion.multiply(this.conversationHeadRotation.setFromAxisAngle(
        this.conversationHeadAxis, -this.conversationHeadOffset,
      ));
      this.conversationHeadOffset = 0;
    }
    if (this.idleHeadOffset) {
      this.headBone.quaternion.multiply(this.idleHeadRotation.setFromAxisAngle(
        this.idleHeadAxis, -this.idleHeadOffset,
      ));
      this.idleHeadOffset = 0;
    }
    if (this.walkSpineOffset && this.walkSpineBone) {
      this.walkSpineBone.quaternion.multiply(this.walkSpineRotation.setFromAxisAngle(
        this.walkSpineAxis, -this.walkSpineOffset,
      ));
      this.walkSpineOffset = 0;
    }
    if (this.echoObserveHeadOffset) {
      this.headBone.quaternion.multiply(this.echoObserveHeadRotation.setFromAxisAngle(
        this.echoObserveHeadAxis, -this.echoObserveHeadOffset,
      ));
      this.echoObserveHeadOffset = 0;
    }
    if (this.ambientPose) {
      for (const entry of this.ambientBones.values()) entry.bone.quaternion.copy(entry.rest);
    }
    // The focused dance trio must stay on the render cadence. Updating a hero
    // dancer at the distant 30 fps cadence makes close movement look stepped,
    // even when the camera itself is moving smoothly.
    this.animator.update(
      delta,
      distance,
      this.focused || Boolean(this.ambientPose) || Boolean(this.danceGroup?.viewed),
    );
    if (this.ambientPose === 'ritual') {
      for (const [bone, rest] of this.ritualBoneRest) {
        bone.position.copy(rest.position);
        bone.quaternion.copy(rest.rotation);
        bone.scale.copy(rest.scale);
      }
    }
    if (this.danceGroup && !this.lookingUp) {
      // The supplied dance clip twists the neck and head sharply. Keep the
      // body gesture while limiting the face/neck seam in close portraits.
      this.neckBone?.quaternion.slerp(this.neckRestQuaternion, 0.9);
      this.headBone.quaternion.slerp(this.headRestQuaternion, 0.9);
    }
    if (this.ambientPose) this.updateAmbientPose(delta);
    if (!this.ambientPose && !this.conversation && !this.focused && !this.lookingUp
      && !this.danceGroup && this.behavior.state === 'idle' && this.behavior.lookTarget) {
      // Remove every sideways glance authored into the idle clip. The only
      // observation gesture is a smooth upward head lift toward Project ECHO.
      this.neckBone?.quaternion.copy(this.neckRestQuaternion);
      this.headBone.quaternion.copy(this.headRestQuaternion);
      const progress = THREE.MathUtils.smoothstep(
        THREE.MathUtils.clamp(this.behavior.observationElapsed / 0.9, 0, 1), 0, 1,
      );
      this.echoObserveHeadOffset = -0.3 * progress;
      this.headBone.quaternion.multiply(this.echoObserveHeadRotation.setFromAxisAngle(
        this.echoObserveHeadAxis, this.echoObserveHeadOffset,
      ));
    }
    if (this.conversation && !this.focused && !this.lookingUp) {
      const { age } = this.conversation;
      const speaking = Math.floor(age / 1.45) % 2 === this.conversationIndex;
      const amplitude = speaking ? 0.065 : 0.025;
      const frequency = speaking ? 6.5 : 3.2;
      this.conversationHeadOffset = Math.sin(age * frequency + this.conversationIndex) * amplitude;
      this.headBone.quaternion.multiply(this.conversationHeadRotation.setFromAxisAngle(
        this.conversationHeadAxis, this.conversationHeadOffset,
      ));
    }
    if (!this.ambientPose && !this.conversation && !this.focused && !this.lookingUp
      && !this.danceGroup) {
      this.walkObservationAge += delta;
      const age = this.walkObservationAge;
      this.idleHeadOffset = Math.sin(age * 0.58) * 0.065
        + Math.sin(age * 0.23 + this.behavior.pacePhase) * 0.04;
      this.headBone.quaternion.multiply(this.idleHeadRotation.setFromAxisAngle(
        this.idleHeadAxis, this.idleHeadOffset,
      ));
      if (this.walkSpineBone) {
        this.walkSpineOffset = Math.sin(age * 0.87 + this.behavior.pacePhase) * 0.025
          + (this.behavior.turnAmount ?? 0) * 0.04;
        this.walkSpineBone.quaternion.multiply(this.walkSpineRotation.setFromAxisAngle(
          this.walkSpineAxis, this.walkSpineOffset,
        ));
      }
    }
    if (this.lookingUp) {
      this.lookUpElapsed = Math.min(this.lookUpDelay + this.lookUpDuration, this.lookUpElapsed + delta);
      this.headBone.quaternion.copy(this.headLookStartQuaternion)
        .slerp(this.headLookUpQuaternion, this.getLookUpProgress());
      this.headBone.updateMatrixWorld(true);
    }
    this.faceController.update(this.focused, delta, distantFill);
    this.updateSpeech(delta);
    this.glowTime += delta * 1.15;
    const pulse = 0.96 + Math.sin(this.glowTime) * 0.04;
    // The billboard intersects animated ankles from portrait angles and its
    // warm pixels then look like a broken skin or trouser material. Dancing
    // characters are already visually marked by motion, so hide it entirely.
    const glowOpacity = this.danceGroup
      ? 0
      : this.focused ? this.footGlowFocusedOpacity : this.footGlowBaseOpacity;
    const opacity = glowOpacity * pulse;
    this.footGlow.material.opacity = THREE.MathUtils.damp(
      this.footGlow.material.opacity,
      opacity,
      7,
      delta,
    );
  }

  updateDistanceFill(amount) {
    if (Math.abs(amount - this.distanceFillAmount) < 0.008) return;
    this.distanceFillAmount = amount;
    for (const entry of this.bodyMaterialEntries) {
      entry.material.color.copy(entry.baseColor).lerp(entry.distantColor, amount);
      entry.visibilityFill.value = amount;
      entry.material.emissive.copy(entry.baseEmissive).lerp(entry.distantEmissive, amount);
      entry.material.emissiveIntensity = THREE.MathUtils.lerp(
        entry.baseIntensity,
        Math.max(entry.baseIntensity, 0.11),
        amount,
      );
    }
  }

  dispose() {
    this.animator.dispose();
    this.faceController.dispose();
    this.faceMorphController?.dispose();
    this.hitVolume.geometry.dispose();
    this.hitVolume.material.dispose();
    this.footGlow.material.map.dispose();
    this.footGlow.material.dispose();
    for (const { material } of this.bodyMaterialEntries) material.dispose();
    for (const skeleton of this.skeletons) skeleton.dispose();
    this.root.removeFromParent();
  }
}
