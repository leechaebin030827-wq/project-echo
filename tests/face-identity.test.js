import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { FaceShapeEstimator } from '../src/face/FaceShapeEstimator.js';
import { FaceMorphController } from '../src/face/FaceMorphController.js';
import { createAdaptiveFeatureLandmarks } from '../src/face/FaceTextureGenerator.js';
import {
  analyzeReconstructionLandmarks,
  calculateSeamlessIntegrationWeights,
  createReconstructionTargetLandmarks,
  inspectReconstructionGeometry,
} from '../src/face/VisitorFaceReconstruction.js';
import { resolveFaceQaTarget } from '../src/face/FaceQaTarget.js';
import { CinematicCameraController } from '../src/camera/CinematicCameraController.js';

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

test('eye mapping retains the visitor eyelid aperture, asymmetry, and brow shape', () => {
  const width = 960;
  const height = 720;
  const visitor = makeLandmarks({ width, height, faceWidth: 0.42, faceHeight: 0.42 });
  const eyeCenters = {
    left: [(visitor[362].x + visitor[263].x) / 2, (visitor[362].y + visitor[263].y) / 2],
    right: [(visitor[33].x + visitor[133].x) / 2, (visitor[33].y + visitor[133].y) / 2],
  };
  for (const side of ['left', 'right']) {
    const [cx, cy] = eyeCenters[side];
    const widthScale = side === 'left' ? 1.35 : 0.78;
    const apertureScale = side === 'left' ? 1.55 : 0.68;
    for (const index of canonical.groups[`${side}_eye`]) {
      visitor[index].x = cx + (visitor[index].x - cx) * widthScale;
      visitor[index].y = cy + (visitor[index].y - cy) * apertureScale;
    }
    for (const index of canonical.groups[`${side}_eyebrow`]) {
      visitor[index].y += side === 'left' ? -0.012 : 0.007;
    }
  }
  const mapped = createAdaptiveFeatureLandmarks(canonical, {
    adaptiveFeatureMappingEnabled: true,
    adaptiveFeatureStrength: 0.72,
    deformationParameters: null,
    visitorLandmarks: visitor,
    frameWidth: width,
    frameHeight: height,
  });
  const extent = (landmarks, indices, axis) => Math.max(...indices.map((i) => landmarks[i][axis]))
    - Math.min(...indices.map((i) => landmarks[i][axis]));
  const leftEye = canonical.groups.left_eye;
  const rightEye = canonical.groups.right_eye;
  assert.ok(extent(mapped, leftEye, 0) > extent(canonical.landmarks, leftEye, 0) * 1.25);
  assert.ok(extent(mapped, rightEye, 0) < extent(canonical.landmarks, rightEye, 0) * 0.85);
  assert.ok(extent(mapped, leftEye, 1) > extent(canonical.landmarks, leftEye, 1) * 1.4);
  assert.ok(extent(mapped, rightEye, 1) < extent(canonical.landmarks, rightEye, 1) * 0.8);
  const browY = (landmarks, side) => canonical.groups[`${side}_eyebrow`]
    .reduce((sum, index) => sum + landmarks[index][1], 0) / canonical.groups[`${side}_eyebrow`].length;
  assert.ok(browY(mapped, 'left') < browY(canonical.landmarks, 'left'));
  assert.ok(browY(mapped, 'right') > browY(canonical.landmarks, 'right'));
  const contourIndex = canonical.contour[0];
  assert.deepEqual(mapped[contourIndex], canonical.landmarks[contourIndex]);
  const triangleArea = (landmarks, triangle) => {
    const [a, b, c] = triangle.map((index) => landmarks[index]);
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  };
  assert.equal(canonical.triangles.filter((triangle) =>
    triangleArea(canonical.landmarks, triangle) * triangleArea(mapped, triangle) < 0).length, 0);
});

test('visitor nose and lip contours survive the character face warp', () => {
  const width = 960;
  const height = 720;
  const visitor = makeLandmarks({ width, height, faceWidth: 0.42, faceHeight: 0.42 });
  for (const [name, widthScale, heightScale] of [['nose', 1.22, 1.08], ['lips', 1.28, 1.16]]) {
    const indices = canonical.groups[name];
    const cx = indices.reduce((sum, index) => sum + visitor[index].x, 0) / indices.length;
    const cy = indices.reduce((sum, index) => sum + visitor[index].y, 0) / indices.length;
    for (const index of indices) {
      visitor[index].x = cx + (visitor[index].x - cx) * widthScale;
      visitor[index].y = cy + (visitor[index].y - cy) * heightScale;
    }
  }
  const mapped = createAdaptiveFeatureLandmarks(canonical, {
    adaptiveFeatureMappingEnabled: true,
    adaptiveFeatureStrength: 0.72,
    deformationParameters: null,
    visitorLandmarks: visitor,
    frameWidth: width,
    frameHeight: height,
  });
  const extent = (points, indices, axis) => Math.max(...indices.map((index) => points[index][axis]))
    - Math.min(...indices.map((index) => points[index][axis]));
  for (const name of ['nose', 'lips']) {
    assert.ok(extent(mapped, canonical.groups[name], 0)
      > extent(canonical.landmarks, canonical.groups[name], 0) * 1.08);
  }
  const area = (points, [a, b, c]) => (points[b][0] - points[a][0]) * (points[c][1] - points[a][1])
    - (points[b][1] - points[a][1]) * (points[c][0] - points[a][0]);
  assert.equal(canonical.triangles.filter((triangle) =>
    area(canonical.landmarks, triangle) * area(mapped, triangle) < 0).length, 0);
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

test('A01 face comparison QA is development-only and mode-specific', () => {
  assert.deepEqual(
    resolveFaceQaTarget('?faceIdentity=reconstructionV3&faceQaTarget=A01', true),
    {
      targetId: 'A01',
      identityMode: 'reconstructionV3',
      label: 'A01 | Reconstruction V3',
    },
  );
  assert.equal(
    resolveFaceQaTarget('?faceIdentity=geometry&faceQaTarget=A01', true).label,
    'A01 | Geometry V2',
  );
  assert.equal(resolveFaceQaTarget('?faceIdentity=reconstructionV3&faceQaTarget=B01', true), null);
  assert.equal(resolveFaceQaTarget('?faceIdentity=reconstructionV3&faceQaTarget=A01', false), null);
});

test('face QA framing reuses Character Focus with a closer head-centered pose', () => {
  const camera = new THREE.PerspectiveCamera();
  const controller = new CinematicCameraController(camera, {});
  const entity = {
    id: 'A01',
    height: 1.7,
    getHeadWorldPosition(target) { return target.set(0, 1.65, 0); },
    getHeadDirection(target) { return target.set(0, 0, 1); },
  };
  controller.focusCharacter(entity);
  const normalPose = controller.getFocusPose(entity, new THREE.Vector3(), new THREE.Vector3());
  const normalDistance = normalPose.position.distanceTo(normalPose.target);
  const normalTargetY = normalPose.target.y;
  controller.focusCharacter(entity, { framing: 'face' });
  const facePose = controller.getFocusPose(entity, new THREE.Vector3(), new THREE.Vector3());
  // The QA lens moves closer while keeping the camera outside the face mesh.
  assert.ok(facePose.position.distanceTo(facePose.target) < normalDistance * 0.85);
  assert.ok(facePose.position.distanceTo(facePose.target) > entity.height * 0.8);
  assert.ok(facePose.target.y > normalTargetY);
});

test('V3 seamless weights smooth skin boundaries while preserving feature detail', () => {
  const settings = {
    contourFeather: 0.052,
    hairlineFeatherBoost: 0.42,
    jawFeatherBoost: 0.34,
    surfaceContinuity: 0.28,
    foreheadContinuity: 0.36,
    jawContinuity: 0.34,
    boundaryToneContinuity: 0.46,
    featureHighPassStrength: 0.52,
  };
  const foreheadSkin = calculateSeamlessIntegrationWeights([0.5, 0.22], 0.018, 0, settings);
  const centerSkin = calculateSeamlessIntegrationWeights([0.5, 0.55], 0.018, 0, settings);
  const jawSkin = calculateSeamlessIntegrationWeights([0.5, 0.9], 0.018, 0, settings);
  const eyeDetail = calculateSeamlessIntegrationWeights([0.35, 0.4], 0.08, 1, settings);
  assert.ok(foreheadSkin.surfaceSmoothing > centerSkin.surfaceSmoothing);
  assert.ok(jawSkin.boundaryToneBlend > centerSkin.boundaryToneBlend);
  assert.ok(eyeDetail.surfaceSmoothing < 0.01);
  assert.equal(eyeDetail.featureHighPass, settings.featureHighPassStrength);
});
