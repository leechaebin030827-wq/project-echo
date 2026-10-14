import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { FaceShapeEstimator } from '../src/face/FaceShapeEstimator.js';
import { FaceMorphController } from '../src/face/FaceMorphController.js';
import { createAdaptiveFeatureLandmarks } from '../src/face/FaceTextureGenerator.js';
import {
  analyzeReconstructionLandmarks,
  createReconstructionTargetLandmarks,
  inspectReconstructionGeometry,
} from '../src/face/VisitorFaceReconstruction.js';

const canonical = JSON.parse(fs.readFileSync(
  new URL('../public/face/canonical.json', import.meta.url),
  'utf8',
));

function makeLandmarks({ width = 640, height = 480, faceWidth = 0.42, faceHeight = 0.62, roll = 0 } = {}) {
  const center = { x: width * 0.5, y: height * 0.5 };
  const referenceSize = Math.min(width, height);
  const cosine = Math.cos(roll);
  const sine = Math.sin(roll);
  return canonical.landmarks.map(([u, v]) => {
    const x = (u - 0.5) * referenceSize * faceWidth;
    const y = (v - 0.5) * referenceSize * faceHeight;
    return {
      x: (center.x + x * cosine - y * sine) / width,
      y: (center.y + x * sine + y * cosine) / height,
      z: 0,
    };
  });
}

test('shape estimation is stable across image resolution and moderate roll', () => {
  const estimator = new FaceShapeEstimator();
  const reference = estimator.estimate(makeLandmarks(), 640, 480);
  const rotated = estimator.estimate(
    makeLandmarks({ width: 1280, height: 720, roll: 9 * Math.PI / 180 }),
    1280,
    720,
  );
  assert.equal(reference.valid, true);
  assert.equal(rotated.valid, true);
  for (const key of ['faceAspectRatio', 'jawWidth', 'eyeSpacing', 'noseWidth', 'mouthWidth']) {
    assert.ok(Math.abs(reference[key] - rotated[key]) < 1e-6, `${key} should be roll invariant`);
  }
});

test('shape estimation distinguishes width and rejects incomplete landmarks', () => {
  const estimator = new FaceShapeEstimator();
  const narrow = estimator.estimate(makeLandmarks({ faceWidth: 0.34 }), 640, 480);
  const wide = estimator.estimate(makeLandmarks({ faceWidth: 0.5 }), 640, 480);
  assert.ok(wide.faceAspectRatio > narrow.faceAspectRatio * 1.4);
  assert.equal(estimator.estimate([], 640, 480).valid, false);
});

function makeCanonicalMesh() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(canonical.landmarks.length * 3);
  const uv = new Float32Array(canonical.landmarks.length * 2);
  canonical.landmarks.forEach(([u, v], index) => {
    positions[index * 3] = (u - 0.5) * 0.14;
    positions[index * 3 + 1] = (0.5 - v) * 0.17;
    positions[index * 3 + 2] = Math.max(0, 0.04 - Math.hypot(u - 0.5, v - 0.53) * 0.035);
    uv[index * 2] = u;
    uv[index * 2 + 1] = v;
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(canonical.triangles.flat());
  geometry.computeVertexNormals();
  return geometry;
}

test('morphing clones geometry, changes local regions, preserves seam, and resets', () => {
  const source = makeCanonicalMesh();
  const sourceSnapshot = new Float32Array(source.getAttribute('position').array);
  const mesh = new THREE.Mesh(source, new THREE.MeshStandardMaterial({ name: 'FACE' }));
  const controller = new FaceMorphController([mesh], canonical, 'TEST', {
    minimumProfileQuality: 0.5,
  });
  const profile = Object.fromEntries(Object.entries(controller.baseline)
    .filter(([, value]) => Number.isFinite(value)));
  Object.assign(profile, {
    valid: true,
    quality: 1,
    jawWidth: controller.baseline.jawWidth * 1.16,
    cheekWidth: controller.baseline.cheekWidth * 0.88,
    eyeSpacing: controller.baseline.eyeSpacing * 1.15,
    noseWidth: controller.baseline.noseWidth * 0.86,
    mouthWidth: controller.baseline.mouthWidth * 1.18,
  });
  const result = controller.apply(profile);
  assert.equal(result.applied, true);
  assert.ok(result.changedVertices > 20);
  assert.notEqual(mesh.geometry, source);
  assert.deepEqual(source.getAttribute('position').array, sourceSnapshot);

  const morphed = mesh.geometry.getAttribute('position').array;
  const contourVertex = canonical.contour[0];
  assert.ok(Math.abs(morphed[contourVertex * 3] - sourceSnapshot[contourVertex * 3]) < 1e-7);
  controller.reset();
  assert.deepEqual(mesh.geometry.getAttribute('position').array, sourceSnapshot);
  controller.dispose();
  assert.equal(mesh.geometry, source);
  source.dispose();
  mesh.material.dispose();
});

test('silhouette morph transfers exact seam displacement into adjacent skinned head geometry', () => {
  const faceGeometry = makeCanonicalMesh();
  const faceMesh = new THREE.Mesh(faceGeometry, new THREE.MeshStandardMaterial({ name: 'FACE' }));
  const seamIndex = canonical.contour[0];
  const seam = new THREE.Vector3().fromBufferAttribute(faceGeometry.getAttribute('position'), seamIndex);
  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    seam.x, seam.y, seam.z,
    seam.x + 0.004, seam.y - 0.002, seam.z,
    seam.x + 0.009, seam.y - 0.004, seam.z,
  ], 3));
  bodyGeometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ], 3));
  bodyGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ], 4));
  bodyGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
  ], 4));
  bodyGeometry.setIndex([0, 1, 2]);
  const head = new THREE.Bone();
  head.name = 'Head';
  const bodyMesh = new THREE.SkinnedMesh(bodyGeometry, new THREE.MeshStandardMaterial());
  bodyMesh.add(head);
  bodyMesh.bind(new THREE.Skeleton([head]));
  const controller = new FaceMorphController([faceMesh], canonical, 'TEST', {
    allMeshes: [faceMesh, bodyMesh],
    silhouetteMorphEnabled: true,
  });
  const profile = { ...controller.baseline, valid: true, quality: 1 };
  profile.faceAspectRatio *= 1.2;
  const result = controller.apply(profile);
  assert.equal(result.diagnostics.silhouetteExtended, true);
  assert.ok(result.diagnostics.adjacent.changed > 0);
  const exact = controller.adjacentEntries[0].mappings.find((mapping) => mapping.exact);
  assert.ok(exact, 'an exact FACE/BODY seam mapping should exist');
  const bodyOffset = exact.vertex * 3;
  assert.ok(Math.hypot(
    controller.adjacentEntries[0].displacement[bodyOffset],
    controller.adjacentEntries[0].displacement[bodyOffset + 1],
  ) > 0);
  controller.reset();
  assert.equal(bodyMesh.geometry.getAttribute('position').getY(0), seam.y);
  controller.dispose();
  faceGeometry.dispose();
  bodyGeometry.dispose();
  faceMesh.material.dispose();
  bodyMesh.material.dispose();
});

test('adaptive feature mapping preserves visitor-relative eye and mouth proportions', () => {
  const settings = {
    adaptiveFeatureMappingEnabled: true,
    adaptiveFeatureStrength: 0.62,
    deformationParameters: {
      eyeSpacing: 0.18,
      eyeWidth: 0.16,
      noseWidth: 0.12,
      noseLength: 0.14,
      mouthWidth: 0.2,
      mouthPosition: 0.1,
    },
  };
  const mapped = createAdaptiveFeatureLandmarks(canonical, settings);
  const width = (points, indices) => Math.max(...indices.map((i) => points[i][0]))
    - Math.min(...indices.map((i) => points[i][0]));
  const leftEye = canonical.groups.left_eye;
  const lips = canonical.groups.lips;
  assert.ok(width(mapped, leftEye) > width(canonical.landmarks, leftEye));
  assert.ok(width(mapped, lips) > width(canonical.landmarks, lips));
  const lipY = (points) => lips.reduce((sum, index) => sum + points[index][1], 0) / lips.length;
  assert.ok(lipY(mapped) > lipY(canonical.landmarks));
});

test('V3 reconstruction quality is pose-aware and preserves visitor feature placement', () => {
  const points = makeLandmarks({ width: 960, height: 720, roll: 7 * Math.PI / 180 });
  const analysis = analyzeReconstructionLandmarks(points, 960, 720);
  assert.equal(analysis.valid, true);
  assert.ok(analysis.quality >= 0.62);
  const altered = points.map((point) => ({ ...point }));
  for (const index of canonical.groups.lips) {
    altered[index].x += altered[index].x < 0.5 ? -0.018 : 0.018;
  }
  const target = createReconstructionTargetLandmarks(canonical, altered, 960, 720);
  const width = (landmarks, indices) => Math.max(...indices.map((index) => landmarks[index][0]))
    - Math.min(...indices.map((index) => landmarks[index][0]));
  assert.ok(width(target, canonical.groups.lips) > width(canonical.landmarks, canonical.groups.lips));
  const contourIndex = canonical.contour[0];
  assert.ok(Math.abs(target[contourIndex][0] - canonical.landmarks[contourIndex][0]) < 0.03);
  assert.equal(analyzeReconstructionLandmarks([], 960, 720).valid, false);
});

test('V3 geometry inspection accepts only complete A-base face UV coverage', () => {
  const geometry = makeCanonicalMesh();
  const character = {
    baseId: 'A',
    faceMeshes: [{ geometry }],
  };
  const compatible = inspectReconstructionGeometry(character);
  assert.equal(compatible.compatible, true);
  assert.equal(compatible.uvCoverage, 1);
  character.baseId = 'B';
  assert.equal(inspectReconstructionGeometry(character).compatible, false);
  geometry.dispose();
});
