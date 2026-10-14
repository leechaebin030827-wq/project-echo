import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CharacterAnimator } from './CharacterAnimator.js';
import { CharacterBehavior, NevadaRoamingBehavior } from './CharacterBehavior.js';
import { FaceMaterialController } from '../face/FaceMaterialController.js';
import { FaceMorphController } from '../face/FaceMorphController.js';

export class CharacterEntity {
  constructor({ id, baseAsset, navigation, routeIndex, scale = 1, roaming = false }) {
    this.id = id;
    this.baseId = baseAsset.base;
    this.nevadaNpc = roaming;
    this.focused = false;
    this.danceGroup = null;
    this.conversation = null;
    this.conversationIndex = -1;
    this.ambientPose = null;
    this.ambientAge = 0;
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
    this.headBone = null;
    this.neckBone = null;
    this.faceMeshes = [];
    this.bodyMaterialEntries = [];
    this.distantFillColor = new THREE.Color('#fff1d4');
    this.distanceFillAmount = -1;
    this.root.traverse((object) => {
      object.userData.entityId = id;
      if (object.isBone && /head$/i.test(object.name) && !this.headBone) this.headBone = object;
      if (object.isBone && /^neck$/i.test(object.name) && !this.neckBone) this.neckBone = object;
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
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uCharacterVisibilityFill = visibilityFill;
          shader.fragmentShader = `uniform float uCharacterVisibilityFill;\n${shader.fragmentShader}`;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            `outgoingLight += diffuseColor.rgb * uCharacterVisibilityFill * 0.72;
            #include <opaque_fragment>`,
          );
        };
        material.customProgramCacheKey = () => 'echo-character-visibility-fill-v1';
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
    this.height = baseAsset.height * scale;
    if (!this.headBone || !this.faceMeshes.length || !this.skeletons.length) {
      throw new Error(`${id}에 얼굴/머리/스켈레톤 semantic 데이터가 없습니다.`);
    }
    this.headOffset = this.headBone.worldToLocal(
      new THREE.Box3().setFromObject(this.faceMeshes[0]).getCenter(new THREE.Vector3()),
    );
    this.headForwardLocal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.headBone.getWorldQuaternion(new THREE.Quaternion()).invert());
    this.faceDirectionMesh = this.faceMeshes[0];
    this.faceSurfaceNormal = this.computeFaceSurfaceNormal(this.faceDirectionMesh);
    this.headRestQuaternion = this.headBone.quaternion.clone();
    this.neckRestQuaternion = this.neckBone?.quaternion.clone();
    this.conversationHeadOffset = 0;
    this.idleHeadOffset = 0;
    this.idleHeadRotation = new THREE.Quaternion();
    this.idleHeadAxis = new THREE.Vector3(0, 1, 0);
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

  play(name) { this.animator.play(name); }
  setAmbientPose(type, position, facing) {
    this.ambientPose = type;
    this.ambientAge = this.random() * Math.PI * 2;
    this.ambientRotation = new THREE.Quaternion();
    this.ambientEuler = new THREE.Euler();
    this.behavior.state = 'idle';
    this.behavior.wait = Infinity;
    this.root.position.copy(position);
    this.root.rotation.y = facing;
    this.animator.play('idle');
    this.ambientBones = new Map();
    this.root.traverse((object) => {
      if (object.isBone && /^(Head|Spine|Spine01|Spine02|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg)$/.test(object.name)) {
        this.ambientBones.set(object.name, { bone: object, rest: object.quaternion.clone() });
      }
    });
  }

  updateAmbientPose(delta) {
    this.ambientAge += delta;
    const t = this.ambientAge;
    const breathe = Math.sin(t * 1.6);
    const turn = Math.sin(t * 0.48);
    // The idle clip is sampled each frame before these offsets. Keep that
    // animated base pose, instead of freezing a single frame of the rig.
    for (const entry of this.ambientBones.values()) entry.rest.copy(entry.bone.quaternion);
    const move = (name, x = 0, y = 0, z = 0) => {
      const entry = this.ambientBones.get(name);
      if (entry) entry.bone.quaternion.copy(entry.rest)
        .multiply(this.ambientRotation.setFromEuler(this.ambientEuler.set(x, y, z)));
    };
    if (this.ambientPose === 'lean') {
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
      // Freeze a neutral body pose first; only the head bone is animated below.
      this.animator.hold('idle', 0);
      // Begin every split portrait in a clean, direct gaze. The animation
      // mixer may have left the head looking sideways during the walk cycle.
      this.headBone.quaternion.copy(this.headRestQuaternion);
      this.conversationHeadOffset = 0;
      this.headLookStartQuaternion.copy(this.headRestQuaternion);
      this.headBone.updateMatrixWorld(true);
    } else if (this.ambientPose) this.animator.play('idle');
    else this.play('walk');
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
    if (this.ambientPose && !this.lookingUp) {
      for (const entry of this.ambientBones.values()) entry.bone.quaternion.copy(entry.rest);
    }
    if (!this.lookingUp) this.animator.update(delta, distance, this.focused || Boolean(this.ambientPose));
    if (this.danceGroup && !this.lookingUp) {
      // The supplied dance clip twists the neck and head sharply. Keep the
      // body gesture while limiting the face/neck seam in close portraits.
      this.neckBone?.quaternion.slerp(this.neckRestQuaternion, 0.9);
      this.headBone.quaternion.slerp(this.headRestQuaternion, 0.9);
    }
    if (this.ambientPose && !this.lookingUp) this.updateAmbientPose(delta);
    if (!this.ambientPose && !this.conversation && !this.focused && !this.lookingUp
      && !this.danceGroup && this.behavior.state === 'idle') {
      this.idleHeadOffset = Math.sin(this.glowTime * 0.75 + this.height * 4) * 0.085;
      this.headBone.quaternion.multiply(this.idleHeadRotation.setFromAxisAngle(
        this.idleHeadAxis, this.idleHeadOffset,
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
    if (this.lookingUp) {
      this.lookUpElapsed = Math.min(this.lookUpDelay + this.lookUpDuration, this.lookUpElapsed + delta);
      this.headBone.quaternion.copy(this.headLookStartQuaternion)
        .slerp(this.headLookUpQuaternion, this.getLookUpProgress());
      this.headBone.updateMatrixWorld(true);
    }
    this.faceController.update(this.focused, delta, distantFill);
    this.glowTime += delta * 1.15;
    const pulse = 0.96 + Math.sin(this.glowTime) * 0.04;
    const opacity = (this.focused ? this.footGlowFocusedOpacity : this.footGlowBaseOpacity) * pulse;
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
