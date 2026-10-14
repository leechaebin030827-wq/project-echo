import * as THREE from 'three';
import { FACE_IDENTITY_CONFIG } from '../config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
const gaussian = (x, y, cx, cy, rx, ry) => Math.exp(-1.6 * (
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
));

function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy)
    / Math.max(dx * dx + dy * dy, 1e-8), 0, 1);
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}

const LANDMARKS = Object.freeze({
  forehead: 10, chin: 152, leftTemple: 234, rightTemple: 454,
  leftJaw: 172, rightJaw: 397, leftCheek: 93, rightCheek: 323,
  leftEyeOuter: 33, leftEyeInner: 133, rightEyeInner: 362, rightEyeOuter: 263,
  noseBridge: 168, noseTip: 2, leftNostril: 98, rightNostril: 327,
  leftMouth: 61, rightMouth: 291, lowerLip: 17,
});

export class FaceMorphController {
  constructor(faceMeshes, canonical, baseId, options = {}) {
    this.config = { ...FACE_IDENTITY_CONFIG, ...options };
    this.canonical = canonical;
    this.baseId = baseId;
    this.entries = [];
    this.lastResult = null;
    for (const mesh of faceMeshes) {
      const uv = mesh.geometry.getAttribute('uv1');
      const position = mesh.geometry.getAttribute('position');
      if (!uv || !position || uv.count !== position.count) continue;
      const sourceGeometry = mesh.geometry;
      const geometry = sourceGeometry.clone();
      mesh.geometry = geometry;
      this.entries.push({
        mesh,
        sourceGeometry,
        geometry,
        original: new Float32Array(geometry.getAttribute('position').array),
        originalNormals: geometry.getAttribute('normal')
          ? new Float32Array(geometry.getAttribute('normal').array)
          : null,
      });
    }
    this.contour = canonical.contour.map((index) => canonical.landmarks[index]);
    this.baseline = this.computeBaseline();
  }

  samplePoint(index) {
    const target = this.canonical.landmarks[index];
    let best = null;
    let bestDistance = Infinity;
    for (const entry of this.entries) {
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
    if (!this.entries.length) return null;
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

  ratioDelta(profile, key, limit = 0.18) {
    const baseline = this.baseline?.[key];
    const value = profile?.[key];
    if (!Number.isFinite(baseline) || !Number.isFinite(value) || baseline <= 1e-5) return 0;
    return clamp(value / baseline - 1, -limit, limit) * this.config.geometryStrength;
  }

  seamWeight(u, v) {
    let distance = Infinity;
    for (let index = 0; index < this.contour.length; index += 1) {
      distance = Math.min(distance, pointSegmentDistance(
        [u, v], this.contour[index], this.contour[(index + 1) % this.contour.length],
      ));
    }
    return smoothstep(0.006, this.config.seamFadeUv, distance);
  }

  apply(profile) {
    this.reset();
    if (!this.baseline || !profile?.valid || profile.quality < this.config.minimumProfileQuality) {
      this.lastResult = { applied: false, reason: 'profile-or-mapping-confidence' };
      return this.lastResult;
    }
    const delta = {
      face: this.ratioDelta(profile, 'faceAspectRatio', 0.16),
      jaw: this.ratioDelta(profile, 'jawWidth', 0.2),
      chin: this.ratioDelta(profile, 'chinLength', 0.18),
      cheek: this.ratioDelta(profile, 'cheekWidth', 0.16),
      eyeSpacing: this.ratioDelta(profile, 'eyeSpacing', 0.2),
      eyeWidth: this.ratioDelta(profile, 'eyeWidth', 0.18),
      noseWidth: this.ratioDelta(profile, 'noseWidth', 0.2),
      noseLength: this.ratioDelta(profile, 'noseLength', 0.18),
      mouthWidth: this.ratioDelta(profile, 'mouthWidth', 0.2),
      mouthPosition: this.ratioDelta(profile, 'mouthPosition', 0.12),
    };
    let changedVertices = 0;
    let maximumDisplacement = 0;
    for (const entry of this.entries) {
      const position = entry.geometry.getAttribute('position');
      const uv = entry.geometry.getAttribute('uv1');
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        const offset = vertex * 3;
        const u = uv.getX(vertex);
        const v = uv.getY(vertex);
        const seam = this.seamWeight(u, v);
        if (seam <= 0.001) continue;
        const centeredX = (u - 0.5) * 2;
        const centeredY = (v - 0.52) * 2;
        const jawMask = gaussian(u, v, 0.5, 0.76, 0.38, 0.25);
        const cheekMask = gaussian(u, v, 0.5, 0.51, 0.48, 0.19);
        const leftEyeMask = gaussian(u, v, 0.35, 0.39, 0.17, 0.105);
        const rightEyeMask = gaussian(u, v, 0.65, 0.39, 0.17, 0.105);
        const noseMask = gaussian(u, v, 0.5, 0.55, 0.14, 0.25);
        const mouthMask = gaussian(u, v, 0.5, 0.7, 0.23, 0.12);
        const chinMask = gaussian(u, v, 0.5, 0.82, 0.25, 0.18);
        const eyeMask = Math.max(leftEyeMask, rightEyeMask);
        const eyeSide = u < 0.5 ? -1 : 1;

        let dx = centeredX * this.baseline.width * (delta.face * 0.34
          + delta.jaw * jawMask * 0.42 + delta.cheek * cheekMask * 0.36);
        dx += eyeSide * this.baseline.width * delta.eyeSpacing * eyeMask * 0.12;
        dx += (u - (u < 0.5 ? 0.35 : 0.65)) * this.baseline.width
          * delta.eyeWidth * eyeMask * 0.58;
        dx += (u - 0.5) * this.baseline.width * delta.noseWidth * noseMask * 0.72;
        dx += (u - 0.5) * this.baseline.width * delta.mouthWidth * mouthMask * 0.7;

        let dy = -centeredY * this.baseline.height * delta.face * 0.12;
        dy -= (v - 0.48) * this.baseline.height * delta.noseLength * noseMask * 0.42;
        dy -= this.baseline.height * delta.mouthPosition * mouthMask * 0.12;
        dy -= this.baseline.height * delta.chin * chinMask * 0.18;

        dx = clamp(dx, -this.baseline.width * this.config.maximumHorizontalDisplacement,
          this.baseline.width * this.config.maximumHorizontalDisplacement) * seam;
        dy = clamp(dy, -this.baseline.height * this.config.maximumVerticalDisplacement,
          this.baseline.height * this.config.maximumVerticalDisplacement) * seam;
        const displacement = Math.hypot(dx, dy);
        if (displacement <= 1e-7) continue;
        position.setXYZ(vertex, entry.original[offset] + dx, entry.original[offset + 1] + dy,
          entry.original[offset + 2]);
        changedVertices += 1;
        maximumDisplacement = Math.max(maximumDisplacement, displacement);
      }
      position.needsUpdate = true;
      entry.geometry.computeVertexNormals();
      entry.geometry.computeBoundingBox();
      entry.geometry.computeBoundingSphere();
    }
    this.lastResult = {
      applied: changedVertices > 0,
      baseId: this.baseId,
      changedVertices,
      maximumDisplacement,
      parameters: delta,
      baseline: this.baseline,
      profileQuality: profile.quality,
    };
    return this.lastResult;
  }

  reset() {
    for (const entry of this.entries) {
      const position = entry.geometry.getAttribute('position');
      position.array.set(entry.original);
      position.needsUpdate = true;
      const normal = entry.geometry.getAttribute('normal');
      if (normal && entry.originalNormals) {
        normal.array.set(entry.originalNormals);
        normal.needsUpdate = true;
      } else entry.geometry.computeVertexNormals();
      entry.geometry.computeBoundingBox();
      entry.geometry.computeBoundingSphere();
    }
    this.lastResult = null;
  }

  dispose() {
    for (const entry of this.entries) {
      if (entry.mesh.geometry === entry.geometry) entry.mesh.geometry = entry.sourceGeometry;
      entry.geometry.dispose();
    }
    this.entries = [];
  }
}
