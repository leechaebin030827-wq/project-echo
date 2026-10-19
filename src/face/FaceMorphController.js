import * as THREE from 'three';
import { FACE_IDENTITY_CONFIG } from '../config.js';
import { smoothFaceNormals } from './FaceSurfaceSmoothing.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
const gaussian = (x, y, cx, cy, rx, ry) => Math.exp(-1.6 * (
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
));
const vertexKey = (x, y, z) => `${Math.round(x * 1e5)}:${Math.round(y * 1e5)}:${Math.round(z * 1e5)}`;

function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy)
    / Math.max(dx * dx + dy * dy, 1e-8), 0, 1);
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

function cloneDeformableGeometry(source) {
  const geometry = new THREE.BufferGeometry();
  geometry.name = `${source.name || 'geometry'}-face-morph`;
  if (source.index) geometry.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (name === 'position' || name === 'normal') {
      const values = new Float32Array(attribute.count * attribute.itemSize);
      for (let vertex = 0; vertex < attribute.count; vertex += 1) {
        for (let component = 0; component < attribute.itemSize; component += 1) {
          values[vertex * attribute.itemSize + component] = attribute.getComponent(vertex, component);
        }
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    } else geometry.setAttribute(name, attribute);
  }
  geometry.morphAttributes = source.morphAttributes;
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  geometry.userData = { ...source.userData };
  return geometry;
}

const LANDMARKS = Object.freeze({
  forehead: 10, chin: 152, leftTemple: 234, rightTemple: 454,
  leftJaw: 172, rightJaw: 397, leftCheek: 93, rightCheek: 323,
  leftEyeOuter: 33, leftEyeInner: 133, rightEyeInner: 362, rightEyeOuter: 263,
  noseBridge: 168, noseTip: 2, leftNostril: 98, rightNostril: 327,
  leftMouth: 61, rightMouth: 291, lowerLip: 17,
});

const REGION_NAMES = ['jaw', 'cheek', 'eye', 'nose', 'mouth', 'chin'];

export class FaceMorphController {
  constructor(faceMeshes, canonical, baseId, options = {}) {
    this.config = { ...FACE_IDENTITY_CONFIG, ...options };
    this.canonical = canonical;
    this.baseId = baseId;
    this.allMeshes = options.allMeshes ?? faceMeshes;
    this.faceEntries = [];
    this.adjacentEntries = [];
    this.entries = this.faceEntries;
    this.lastResult = null;
    this.debugOverlays = [];
    this.contour = canonical.contour.map((index) => canonical.landmarks[index]);

    for (const mesh of faceMeshes) {
      const uv = mesh.geometry.getAttribute('uv1');
      const position = mesh.geometry.getAttribute('position');
      if (!uv || !position || uv.count !== position.count) continue;
      const sourceGeometry = mesh.geometry;
      const geometry = sourceGeometry.clone();
      mesh.geometry = geometry;
      this.faceEntries.push(this.makeEntry(mesh, sourceGeometry, geometry, 'face'));
    }
    this.baseline = this.computeBaseline();
    this.faceWeldGroups = this.buildFaceWeldGroups();
  }

  makeEntry(mesh, sourceGeometry, geometry, type) {
    const position = geometry.getAttribute('position');
    return {
      type,
      mesh,
      sourceGeometry,
      geometry,
      original: geometry.getAttribute('position').array.slice(),
      originalNormals: geometry.getAttribute('normal')?.array.slice() ?? null,
      displacement: new Float32Array(position.count * 3),
      magnitudes: new Float32Array(position.count),
      regions: type === 'face' ? new Array(position.count).fill('face') : null,
      affectedVertices: new Set(),
    };
  }

  contourDistance(u, v) {
    let distance = Infinity;
    for (let index = 0; index < this.contour.length; index += 1) {
      distance = Math.min(distance, pointSegmentDistance(
        [u, v], this.contour[index], this.contour[(index + 1) % this.contour.length],
      ));
    }
    return distance;
  }

  buildFaceWeldGroups() {
    const groups = new Map();
    for (const entry of this.faceEntries) {
      const uv = entry.geometry.getAttribute('uv1');
      for (let vertex = 0; vertex < uv.count; vertex += 1) {
        const offset = vertex * 3;
        const key = vertexKey(entry.original[offset], entry.original[offset + 1], entry.original[offset + 2]);
        if (!groups.has(key)) groups.set(key, { refs: [], contour: false });
        const group = groups.get(key);
        group.refs.push({ entry, vertex });
        if (this.contourDistance(uv.getX(vertex), uv.getY(vertex)) < this.config.contourPropagationBandUv) {
          group.contour = true;
        }
      }
    }
    return [...groups.values()];
  }

  samplePoint(index) {
    const target = this.canonical.landmarks[index];
    let best = null;
    let bestDistance = Infinity;
    for (const entry of this.faceEntries) {
      const uv = entry.geometry.getAttribute('uv1');
      const position = entry.geometry.getAttribute('position');
      for (let vertex = 0; vertex < uv.count; vertex += 1) {
        const distance = Math.hypot(uv.getX(vertex) - target[0], uv.getY(vertex) - target[1]);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        best = new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      }
    }
    return best;
  }

  computeBaseline() {
    if (!this.faceEntries.length) return null;
    const points = Object.fromEntries(Object.entries(LANDMARKS).map(([name, index]) => [name, this.samplePoint(index)]));
    if (Object.values(points).some((point) => !point)) return null;
    const width = Math.abs(points.rightTemple.x - points.leftTemple.x);
    const height = Math.abs(points.forehead.y - points.chin.y);
    if (width < 1e-5 || height < 1e-5) return null;
    const horizontal = (left, right) => Math.abs(points[right].x - points[left].x);
    const vertical = (top, bottom) => Math.abs(points[top].y - points[bottom].y);
    const eyeLine = (points.leftEyeOuter.y + points.leftEyeInner.y
      + points.rightEyeInner.y + points.rightEyeOuter.y) * 0.25;
    const mouthY = (points.leftMouth.y + points.rightMouth.y) * 0.5;
    return {
      faceAspectRatio: width / height,
      jawWidth: horizontal('leftJaw', 'rightJaw') / width,
      chinLength: vertical('lowerLip', 'chin') / height,
      cheekWidth: horizontal('leftCheek', 'rightCheek') / width,
      eyeSpacing: horizontal('leftEyeInner', 'rightEyeInner') / width,
      eyeWidth: (horizontal('leftEyeOuter', 'leftEyeInner')
        + horizontal('rightEyeInner', 'rightEyeOuter')) * 0.5 / width,
      noseWidth: horizontal('leftNostril', 'rightNostril') / width,
      noseLength: vertical('noseBridge', 'noseTip') / height,
      mouthWidth: horizontal('leftMouth', 'rightMouth') / width,
      mouthPosition: Math.abs(mouthY - eyeLine) / height,
      width,
      height,
    };
  }

  ratioDelta(profile, key, limit = 0.22) {
    const baseline = this.baseline?.[key];
    const value = profile?.[key];
    if (!Number.isFinite(baseline) || !Number.isFinite(value) || baseline <= 1e-5) return 0;
    return clamp(value / baseline - 1, -limit, limit) * this.config.geometryStrength;
  }

  seamWeight(u, v) {
    return smoothstep(0.006, this.config.seamFadeUv, this.contourDistance(u, v));
  }

  ensureAdjacentGeometry() {
    if (this.adjacentEntries.length || !this.config.silhouetteMorphEnabled || !this.baseline) return;
    const faceSet = new Set(this.faceEntries.map((entry) => entry.mesh));
    const anchors = this.faceWeldGroups.filter((group) => group.contour).map((group) => {
      const { entry, vertex } = group.refs[0];
      const offset = vertex * 3;
      const point = new THREE.Vector3(
        entry.original[offset], entry.original[offset + 1], entry.original[offset + 2],
      );
      entry.mesh.updateMatrixWorld(true);
      return { group, worldPoint: point.applyMatrix4(entry.mesh.matrixWorld) };
    });
    if (!anchors.length) return;
    const radius = this.baseline.width * this.config.headPropagationRadiusScale;
    const innerRadius = radius * 0.08;
    const localPoint = new THREE.Vector3();

    for (const mesh of this.allMeshes) {
      if (faceSet.has(mesh) || !mesh.isSkinnedMesh) continue;
      const sourceGeometry = mesh.geometry;
      const position = sourceGeometry.getAttribute('position');
      const skinIndex = sourceGeometry.getAttribute('skinIndex');
      const skinWeight = sourceGeometry.getAttribute('skinWeight');
      if (!position || !skinIndex || !skinWeight) continue;
      mesh.updateMatrixWorld(true);
      const inverseWorld = mesh.matrixWorld.clone().invert();
      const localAnchors = anchors.map((anchor) => ({
        group: anchor.group,
        point: anchor.worldPoint.clone().applyMatrix4(inverseWorld),
      }));
      const bounds = new THREE.Box3();
      for (const anchor of localAnchors) bounds.expandByPoint(anchor.point);
      bounds.expandByScalar(radius);
      const headBoneIndices = new Set();
      mesh.skeleton.bones.forEach((bone, index) => {
        if (/^head$/i.test(bone.name)) headBoneIndices.add(index);
      });
      if (!headBoneIndices.size) continue;
      const mappings = [];
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        localPoint.fromBufferAttribute(position, vertex);
        if (!bounds.containsPoint(localPoint)) continue;
        let nearest = null;
        let nearestDistance = Infinity;
        for (const anchor of localAnchors) {
          const distance = localPoint.distanceTo(anchor.point);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = anchor;
          }
        }
        if (!nearest || nearestDistance > radius) continue;
        let headWeight = 0;
        for (let component = 0; component < 4; component += 1) {
          if (headBoneIndices.has(skinIndex.getComponent(vertex, component))) {
            headWeight += skinWeight.getComponent(vertex, component);
          }
        }
        const exact = nearestDistance <= this.config.seamMatchTolerance;
        if (!exact && headWeight < this.config.minimumHeadWeight) continue;
        const radial = 1 - smoothstep(innerRadius, radius, nearestDistance);
        const influence = exact ? 1 : radial * smoothstep(
          this.config.minimumHeadWeight,
          1,
          headWeight,
        );
        if (influence <= 0.001) continue;
        mappings.push({ vertex, group: nearest.group, influence, exact, distance: nearestDistance });
      }
      if (!mappings.length) continue;
      const geometry = cloneDeformableGeometry(sourceGeometry);
      mesh.geometry = geometry;
      const entry = this.makeEntry(mesh, sourceGeometry, geometry, 'adjacent');
      entry.mappings = mappings;
      entry.radius = radius;
      this.adjacentEntries.push(entry);
    }
  }

  computeFaceDisplacements(delta) {
    const useSilhouette = this.config.silhouetteMorphEnabled;
    const legacy = this.config.legacyMode;
    for (const entry of this.faceEntries) {
      entry.displacement.fill(0);
      entry.magnitudes.fill(0);
      entry.affectedVertices.clear();
      const uv = entry.geometry.getAttribute('uv1');
      for (let vertex = 0; vertex < uv.count; vertex += 1) {
        const offset = vertex * 3;
        const u = uv.getX(vertex);
        const v = uv.getY(vertex);
        const boundaryWeight = useSilhouette ? 1 : this.seamWeight(u, v);
        if (boundaryWeight <= 0.001) continue;
        const centeredX = (u - 0.5) * 2;
        const centeredY = (v - 0.52) * 2;
        const masks = {
          jaw: gaussian(u, v, 0.5, 0.76, 0.38, 0.25),
          cheek: gaussian(u, v, 0.5, 0.51, 0.48, 0.19),
          eye: Math.max(
            gaussian(u, v, 0.35, 0.39, 0.17, 0.105),
            gaussian(u, v, 0.65, 0.39, 0.17, 0.105),
          ),
          nose: gaussian(u, v, 0.5, 0.55, 0.14, 0.25),
          mouth: gaussian(u, v, 0.5, 0.7, 0.23, 0.12),
          chin: gaussian(u, v, 0.5, 0.82, 0.25, 0.18),
        };
        const eyeSide = u < 0.5 ? -1 : 1;
        let dx = centeredX * this.baseline.width * (delta.face * (legacy ? 0.34 : 0.4)
          + delta.jaw * masks.jaw * (legacy ? 0.42 : 0.48)
          + delta.cheek * masks.cheek * (legacy ? 0.36 : 0.42));
        dx += eyeSide * this.baseline.width * delta.eyeSpacing * masks.eye * (legacy ? 0.12 : 0.1);
        dx += (u - (u < 0.5 ? 0.35 : 0.65)) * this.baseline.width
          * delta.eyeWidth * masks.eye * (legacy ? 0.58 : 0.48);
        dx += (u - 0.5) * this.baseline.width * delta.noseWidth * masks.nose
          * (legacy ? 0.72 : 0.68);
        dx += (u - 0.5) * this.baseline.width * delta.mouthWidth * masks.mouth
          * (legacy ? 0.7 : 0.68);

        let dy = -centeredY * this.baseline.height * delta.face * (legacy ? 0.12 : 0.15);
        dy -= (v - 0.48) * this.baseline.height * delta.noseLength * masks.nose
          * (legacy ? 0.42 : 0.38);
        dy -= this.baseline.height * delta.mouthPosition * masks.mouth * (legacy ? 0.12 : 0.11);
        dy -= this.baseline.height * delta.chin * masks.chin * (legacy ? 0.18 : 0.24);
        dx = clamp(dx, -this.baseline.width * this.config.maximumHorizontalDisplacement,
          this.baseline.width * this.config.maximumHorizontalDisplacement) * boundaryWeight;
        dy = clamp(dy, -this.baseline.height * this.config.maximumVerticalDisplacement,
          this.baseline.height * this.config.maximumVerticalDisplacement) * boundaryWeight;
        entry.displacement[offset] = dx;
        entry.displacement[offset + 1] = dy;
        entry.regions[vertex] = REGION_NAMES.reduce((best, name) => (
          masks[name] > masks[best] ? name : best
        ), 'jaw');
      }
    }

    for (const group of this.faceWeldGroups) {
      let dx = 0;
      let dy = 0;
      let dz = 0;
      for (const { entry, vertex } of group.refs) {
        const offset = vertex * 3;
        dx += entry.displacement[offset];
        dy += entry.displacement[offset + 1];
        dz += entry.displacement[offset + 2];
      }
      dx /= group.refs.length;
      dy /= group.refs.length;
      dz /= group.refs.length;
      group.displacement = [dx, dy, dz];
      for (const { entry, vertex } of group.refs) {
        const offset = vertex * 3;
        entry.displacement[offset] = dx;
        entry.displacement[offset + 1] = dy;
        entry.displacement[offset + 2] = dz;
      }
    }
  }

  writeFaceGeometry() {
    for (const entry of this.faceEntries) {
      const position = entry.geometry.getAttribute('position');
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const offset = vertex * 3;
        const dx = entry.displacement[offset];
        const dy = entry.displacement[offset + 1];
        const dz = entry.displacement[offset + 2];
        const magnitude = Math.hypot(dx, dy, dz);
        entry.magnitudes[vertex] = magnitude;
        if (magnitude <= 1e-7) continue;
        position.setXYZ(vertex, entry.original[offset] + dx, entry.original[offset + 1] + dy,
          entry.original[offset + 2] + dz);
        entry.affectedVertices.add(vertex);
      }
      position.needsUpdate = true;
      smoothFaceNormals(entry.geometry);
      entry.geometry.computeBoundingBox();
      entry.geometry.computeBoundingSphere();
    }
  }

  writeAdjacentGeometry() {
    for (const entry of this.adjacentEntries) {
      entry.displacement.fill(0);
      entry.magnitudes.fill(0);
      entry.affectedVertices.clear();
      const position = entry.geometry.getAttribute('position');
      for (const mapping of entry.mappings) {
        const offset = mapping.vertex * 3;
        const [dx, dy, dz] = mapping.group.displacement ?? [0, 0, 0];
        const strength = mapping.exact ? 1 : this.config.silhouettePropagationStrength;
        entry.displacement[offset] = dx * mapping.influence * strength;
        entry.displacement[offset + 1] = dy * mapping.influence * strength;
        entry.displacement[offset + 2] = dz * mapping.influence * strength;
        const magnitude = Math.hypot(
          entry.displacement[offset], entry.displacement[offset + 1], entry.displacement[offset + 2],
        );
        entry.magnitudes[mapping.vertex] = magnitude;
        if (magnitude <= 1e-7) continue;
        position.setXYZ(
          mapping.vertex,
          entry.original[offset] + entry.displacement[offset],
          entry.original[offset + 1] + entry.displacement[offset + 1],
          entry.original[offset + 2] + entry.displacement[offset + 2],
        );
        entry.affectedVertices.add(mapping.vertex);
      }
      position.needsUpdate = true;
      this.recomputeAffectedNormals(entry);
      entry.geometry.computeBoundingBox();
      entry.geometry.computeBoundingSphere();
    }
  }

  recomputeAffectedNormals(entry) {
    const normal = entry.geometry.getAttribute('normal');
    const position = entry.geometry.getAttribute('position');
    const index = entry.geometry.index;
    if (!normal || !index || !entry.affectedVertices.size) return;
    const sums = new Map([...entry.affectedVertices].map((vertex) => [vertex, new THREE.Vector3()]));
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    for (let offset = 0; offset < index.count; offset += 3) {
      const ia = index.getX(offset);
      const ib = index.getX(offset + 1);
      const ic = index.getX(offset + 2);
      if (!sums.has(ia) && !sums.has(ib) && !sums.has(ic)) continue;
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);
      edgeA.subVectors(c, b);
      edgeB.subVectors(a, b);
      const faceNormal = edgeA.cross(edgeB);
      sums.get(ia)?.add(faceNormal);
      sums.get(ib)?.add(faceNormal);
      sums.get(ic)?.add(faceNormal);
    }
    for (const [vertex, sum] of sums) {
      if (sum.lengthSq() > 1e-12) sum.normalize();
      normal.setXYZ(vertex, sum.x, sum.y, sum.z);
    }
    normal.needsUpdate = true;
  }

  collectDiagnostics(elapsedMs, delta) {
    const regionBuckets = Object.fromEntries(REGION_NAMES.map((name) => [name, []]));
    const faceMagnitudes = [];
    const boundaryMagnitudes = [];
    for (const entry of this.faceEntries) {
      const uv = entry.geometry.getAttribute('uv1');
      for (let vertex = 0; vertex < entry.magnitudes.length; vertex += 1) {
        const magnitude = entry.magnitudes[vertex];
        faceMagnitudes.push(magnitude);
        regionBuckets[entry.regions[vertex]]?.push(magnitude);
        if (this.contourDistance(uv.getX(vertex), uv.getY(vertex)) < 0.025) {
          boundaryMagnitudes.push(magnitude);
        }
      }
    }
    const adjacentMagnitudes = this.adjacentEntries.flatMap((entry) => [...entry.magnitudes]);
    const stats = (values) => ({
      targeted: values.length,
      changed: values.filter((value) => value > 1e-7).length,
      mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      max: values.length ? Math.max(...values) : 0,
    });
    const face = stats(faceMagnitudes);
    const adjacent = stats(adjacentMagnitudes);
    const boundary = stats(boundaryMagnitudes);
    const memoryBytes = [...this.faceEntries, ...this.adjacentEntries].reduce((sum, entry) => (
      sum + entry.geometry.getAttribute('position').array.byteLength
      + (entry.geometry.getAttribute('normal')?.array.byteLength ?? 0)
      + entry.displacement.byteLength + entry.magnitudes.byteLength
    ), 0);
    return {
      elapsedMs,
      face,
      adjacent,
      boundary,
      regions: Object.fromEntries(Object.entries(regionBuckets).map(([name, values]) => [name, stats(values)])),
      relativeToFaceWidth: {
        mean: face.mean / this.baseline.width,
        max: face.max / this.baseline.width,
        boundaryMean: boundary.mean / this.baseline.width,
      },
      memoryBytes,
      silhouetteExtended: this.adjacentEntries.length > 0,
      parameters: delta,
    };
  }

  apply(profile) {
    const started = performance.now();
    if (this.config.silhouetteMorphEnabled) this.ensureAdjacentGeometry();
    this.reset();
    if (!this.baseline || !profile?.valid || profile.quality < this.config.minimumProfileQuality) {
      this.lastResult = {
        applied: false,
        reason: !profile?.valid ? 'invalid-profile'
          : profile.quality < this.config.minimumProfileQuality ? 'profile-quality' : 'mapping',
        profileQuality: profile?.quality ?? 0,
      };
      return this.lastResult;
    }
    const legacy = this.config.legacyMode;
    const delta = {
      face: this.ratioDelta(profile, 'faceAspectRatio', legacy ? 0.16 : 0.24),
      jaw: this.ratioDelta(profile, 'jawWidth', legacy ? 0.2 : 0.28),
      chin: this.ratioDelta(profile, 'chinLength', legacy ? 0.18 : 0.24),
      cheek: this.ratioDelta(profile, 'cheekWidth', legacy ? 0.16 : 0.22),
      eyeSpacing: this.ratioDelta(profile, 'eyeSpacing', legacy ? 0.2 : 0.24),
      eyeWidth: this.ratioDelta(profile, 'eyeWidth', legacy ? 0.18 : 0.22),
      noseWidth: this.ratioDelta(profile, 'noseWidth', legacy ? 0.2 : 0.24),
      noseLength: this.ratioDelta(profile, 'noseLength', legacy ? 0.18 : 0.22),
      mouthWidth: this.ratioDelta(profile, 'mouthWidth', legacy ? 0.2 : 0.24),
      mouthPosition: this.ratioDelta(profile, 'mouthPosition', legacy ? 0.12 : 0.16),
    };
    this.computeFaceDisplacements(delta);
    this.writeFaceGeometry();
    if (this.config.silhouetteMorphEnabled) this.writeAdjacentGeometry();
    const diagnostics = this.collectDiagnostics(performance.now() - started, delta);
    this.lastResult = {
      applied: diagnostics.face.changed > 0,
      baseId: this.baseId,
      changedVertices: diagnostics.face.changed + diagnostics.adjacent.changed,
      maximumDisplacement: Math.max(diagnostics.face.max, diagnostics.adjacent.max),
      parameters: delta,
      baseline: this.baseline,
      profileQuality: profile.quality,
      diagnostics,
    };
    if (this.config.debugMode) this.updateDebugVisualization(this.config.debugMode);
    return this.lastResult;
  }

  updateDebugVisualization(mode) {
    this.clearDebugVisualization();
    const entries = [...this.faceEntries, ...this.adjacentEntries];
    const maximum = Math.max(...entries.flatMap((entry) => [...entry.magnitudes]), 1e-6);
    for (const entry of entries) {
      const colors = new Float32Array(entry.magnitudes.length * 3);
      const color = new THREE.Color();
      for (let vertex = 0; vertex < entry.magnitudes.length; vertex += 1) {
        const amount = clamp(entry.magnitudes[vertex] / maximum, 0, 1);
        color.setHSL((1 - amount) * 0.66, 0.9, 0.48);
        colors[vertex * 3] = color.r;
        colors[vertex * 3 + 1] = color.g;
        colors[vertex * 3 + 2] = color.b;
      }
      entry.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        wireframe: mode === 'wireframe',
        transparent: true,
        opacity: mode === 'wireframe' ? 0.72 : 0.82,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const overlay = entry.mesh.clone(false);
      overlay.name = `${entry.mesh.name}-face-morph-${mode}`;
      overlay.geometry = entry.geometry;
      overlay.material = material;
      overlay.renderOrder = 999;
      entry.mesh.parent?.add(overlay);
      this.debugOverlays.push({ overlay, material });
    }
  }

  clearDebugVisualization() {
    for (const { overlay, material } of this.debugOverlays) {
      overlay.removeFromParent();
      material.dispose();
    }
    this.debugOverlays = [];
  }

  resetEntry(entry) {
    const position = entry.geometry.getAttribute('position');
    position.array.set(entry.original);
    position.needsUpdate = true;
    const normal = entry.geometry.getAttribute('normal');
    if (normal && entry.originalNormals) {
      normal.array.set(entry.originalNormals);
      normal.needsUpdate = true;
    } else entry.geometry.computeVertexNormals();
    entry.displacement.fill(0);
    entry.magnitudes.fill(0);
    entry.affectedVertices.clear();
    entry.geometry.computeBoundingBox();
    entry.geometry.computeBoundingSphere();
  }

  reset() {
    this.clearDebugVisualization();
    for (const entry of [...this.faceEntries, ...this.adjacentEntries]) this.resetEntry(entry);
    this.lastResult = null;
  }

  dispose() {
    this.clearDebugVisualization();
    for (const entry of [...this.faceEntries, ...this.adjacentEntries]) {
      if (entry.mesh.geometry === entry.geometry) entry.mesh.geometry = entry.sourceGeometry;
      entry.geometry.dispose();
    }
    this.faceEntries = [];
    this.adjacentEntries = [];
    this.entries = this.faceEntries;
  }
}
