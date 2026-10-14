import * as THREE from 'three';
import { FACE_RECONSTRUCTION_V3_CONFIG } from '../config.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const canvas = (width, height = width) => Object.assign(document.createElement('canvas'), { width, height });

const meanPoint = (points, indices) => {
  const result = indices.reduce((sum, index) => {
    sum[0] += points[index][0];
    sum[1] += points[index][1];
    return sum;
  }, [0, 0]);
  return [result[0] / indices.length, result[1] / indices.length];
};

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function polygonEdgeDistance(point, polygon) {
  let best = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 1e-8
      ? clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared)
      : 0;
    best = Math.min(best, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
  }
  return best;
}

function drawReconstructionTriangle(context, image, source, destination) {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = destination;
  const sx1 = s1[0] - s0[0];
  const sy1 = s1[1] - s0[1];
  const sx2 = s2[0] - s0[0];
  const sy2 = s2[1] - s0[1];
  const determinant = sx1 * sy2 - sx2 * sy1;
  if (Math.abs(determinant) < 1e-7) return false;
  const a = ((d1[0] - d0[0]) * sy2 - (d2[0] - d0[0]) * sy1) / determinant;
  const c = ((d2[0] - d0[0]) * sx1 - (d1[0] - d0[0]) * sx2) / determinant;
  const b = ((d1[1] - d0[1]) * sy2 - (d2[1] - d0[1]) * sy1) / determinant;
  const d = ((d2[1] - d0[1]) * sx1 - (d1[1] - d0[1]) * sx2) / determinant;
  const centerX = (d0[0] + d1[0] + d2[0]) / 3;
  const centerY = (d0[1] + d1[1] + d2[1]) / 3;
  const expanded = destination.map(([x, y]) => {
    const dx = x - centerX;
    const dy = y - centerY;
    const length = Math.max(1e-5, Math.hypot(dx, dy));
    return [x + dx / length * 0.75, y + dy / length * 0.75];
  });
  context.save();
  context.beginPath();
  context.moveTo(...expanded[0]);
  context.lineTo(...expanded[1]);
  context.lineTo(...expanded[2]);
  context.closePath();
  context.clip();
  context.setTransform(a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]);
  context.drawImage(image, 0, 0);
  context.restore();
  return true;
}

export function analyzeReconstructionLandmarks(points, width, height) {
  if (!Array.isArray(points) || points.length < 455 || width <= 0 || height <= 0) {
    return { valid: false, quality: 0, reason: 'landmarks' };
  }
  const pixels = points.map((point) => [point.x * width, point.y * height]);
  const leftEye = meanPoint(pixels, [33, 133]);
  const rightEye = meanPoint(pixels, [362, 263]);
  const eyeDistance = distance(leftEye, rightEye);
  const faceWidth = distance(pixels[234], pixels[454]);
  const faceHeight = distance(pixels[10], pixels[152]);
  if (eyeDistance < 2 || faceWidth < 2 || faceHeight < 2) {
    return { valid: false, quality: 0, reason: 'scale' };
  }
  const roll = Math.atan2(rightEye[1] - leftEye[1], rightEye[0] - leftEye[0]);
  const nose = pixels[1];
  const leftSpan = distance(pixels[234], nose);
  const rightSpan = distance(nose, pixels[454]);
  const yawAsymmetry = Math.abs(leftSpan - rightSpan) / Math.max(1, leftSpan + rightSpan);
  const faceSize = Math.min(faceWidth / width, faceHeight / height);
  const sizeScore = clamp((faceSize - 0.18) / 0.2);
  const rollScore = clamp(1 - Math.abs(roll) / (22 * Math.PI / 180));
  const yawScore = clamp(1 - yawAsymmetry / 0.24);
  const bounds = pixels.reduce((result, point) => ({
    minX: Math.min(result.minX, point[0]),
    minY: Math.min(result.minY, point[1]),
    maxX: Math.max(result.maxX, point[0]),
    maxY: Math.max(result.maxY, point[1]),
  }), { minX: width, minY: height, maxX: 0, maxY: 0 });
  const frameCoverage = clamp(Math.min(
    bounds.minX / Math.max(1, faceWidth * 0.12),
    bounds.minY / Math.max(1, faceHeight * 0.1),
    (width - bounds.maxX) / Math.max(1, faceWidth * 0.12),
    (height - bounds.maxY) / Math.max(1, faceHeight * 0.1),
  ));
  const quality = sizeScore * 0.32 + rollScore * 0.24 + yawScore * 0.3 + frameCoverage * 0.14;
  return {
    valid: quality >= FACE_RECONSTRUCTION_V3_CONFIG.minimumQuality,
    quality,
    roll,
    yawAsymmetry,
    faceSize,
    frameCoverage,
    bounds,
  };
}

export function createReconstructionTargetLandmarks(canonical, points, width, height, options = {}) {
  const preservation = clamp(
    options.landmarkPreservation ?? FACE_RECONSTRUCTION_V3_CONFIG.landmarkPreservation,
    0,
    0.7,
  );
  const contourPreservation = clamp(
    options.contourPreservation ?? FACE_RECONSTRUCTION_V3_CONFIG.contourPreservation,
    0,
    0.25,
  );
  const source = points.map((point) => [point.x * width, point.y * height]);
  const sourceLeftEye = meanPoint(source, [33, 133]);
  const sourceRightEye = meanPoint(source, [362, 263]);
  const targetLeftEye = meanPoint(canonical.landmarks, [33, 133]);
  const targetRightEye = meanPoint(canonical.landmarks, [362, 263]);
  const sourceMid = [(sourceLeftEye[0] + sourceRightEye[0]) / 2, (sourceLeftEye[1] + sourceRightEye[1]) / 2];
  const targetMid = [(targetLeftEye[0] + targetRightEye[0]) / 2, (targetLeftEye[1] + targetRightEye[1]) / 2];
  const sourceAngle = Math.atan2(sourceRightEye[1] - sourceLeftEye[1], sourceRightEye[0] - sourceLeftEye[0]);
  const sourceScale = distance(sourceLeftEye, sourceRightEye);
  const targetScale = distance(targetLeftEye, targetRightEye);
  const cosine = Math.cos(-sourceAngle);
  const sine = Math.sin(-sourceAngle);
  const contour = new Set(canonical.contour);
  return canonical.landmarks.map((target, index) => {
    const dx = source[index][0] - sourceMid[0];
    const dy = source[index][1] - sourceMid[1];
    const normalized = [
      targetMid[0] + (dx * cosine - dy * sine) / sourceScale * targetScale,
      targetMid[1] + (dx * sine + dy * cosine) / sourceScale * targetScale,
    ];
    const strength = contour.has(index) ? contourPreservation : preservation;
    return [
      clamp(target[0] + (normalized[0] - target[0]) * strength, 0.015, 0.985),
      clamp(target[1] + (normalized[1] - target[1]) * strength, 0.015, 0.985),
    ];
  });
}

function featureEllipses(canonical, landmarks) {
  return ['left_eye', 'right_eye', 'left_eyebrow', 'right_eyebrow', 'nose', 'lips']
    .map((name) => {
      const group = canonical.groups[name].map((index) => landmarks[index]);
      const xs = group.map((point) => point[0]);
      const ys = group.map((point) => point[1]);
      return {
        x: xs.reduce((sum, value) => sum + value, 0) / xs.length,
        y: ys.reduce((sum, value) => sum + value, 0) / ys.length,
        rx: Math.max(0.03, (Math.max(...xs) - Math.min(...xs)) * 0.9),
        ry: Math.max(0.024, (Math.max(...ys) - Math.min(...ys)) * 0.86),
      };
    });
}

function sampleMedianTone(data, resolution, landmarks, indices) {
  const channels = [[], [], []];
  for (const index of indices) {
    const x = clamp(Math.round(landmarks[index][0] * resolution), 0, resolution - 1);
    const y = clamp(Math.round(landmarks[index][1] * resolution), 0, resolution - 1);
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const sampleX = clamp(x + dx, 0, resolution - 1);
        const sampleY = clamp(y + dy, 0, resolution - 1);
        const pixel = (sampleY * resolution + sampleX) * 4;
        if (data[pixel + 3] < 128) continue;
        channels.forEach((samples, channel) => samples.push(data[pixel + channel]));
      }
    }
  }
  return channels.map((samples) => {
    if (!samples.length) return 128;
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)];
  });
}

export class VisitorFaceReconstruction {
  constructor(canonical, options = {}) {
    this.canonical = canonical;
    this.options = { ...FACE_RECONSTRUCTION_V3_CONFIG, ...options };
  }

  reconstruct(frame, points, baseImage, options = {}) {
    const settings = { ...this.options, ...options };
    const analysis = analyzeReconstructionLandmarks(points, frame.width, frame.height);
    if (!analysis.valid) return { applied: false, reason: analysis.reason ?? 'quality', diagnostics: analysis };
    const startedAt = performance.now();
    const resolution = settings.resolution;
    const source = canvas(frame.width, frame.height);
    source.getContext('2d').drawImage(frame, 0, 0);
    const targetLandmarks = createReconstructionTargetLandmarks(
      this.canonical,
      points,
      frame.width,
      frame.height,
      settings,
    );
    const warped = canvas(resolution);
    const warpedContext = warped.getContext('2d', { willReadFrequently: true });
    let trianglesDrawn = 0;
    for (const triangle of this.canonical.triangles) {
      const drawn = drawReconstructionTriangle(
        warpedContext,
        source,
        triangle.map((index) => [points[index].x * frame.width, points[index].y * frame.height]),
        triangle.map((index) => targetLandmarks[index].map((value) => value * resolution)),
      );
      if (drawn) trianglesDrawn += 1;
    }
    const reconstructed = warpedContext.getImageData(0, 0, resolution, resolution);
    const base = canvas(resolution);
    const baseContext = base.getContext('2d', { willReadFrequently: true });
    baseContext.drawImage(baseImage, 0, 0, resolution, resolution);
    const original = baseContext.getImageData(0, 0, resolution, resolution);
    const output = baseContext.createImageData(resolution, resolution);
    const features = featureEllipses(this.canonical, targetLandmarks);
    const contour = this.canonical.contour.map((index) => targetLandmarks[index]);
    const toneIndices = [50, 280, 101, 330, 151];
    const visitorTone = sampleMedianTone(reconstructed.data, resolution, targetLandmarks, toneIndices);
    const baseTone = sampleMedianTone(original.data, resolution, this.canonical.landmarks, toneIndices);
    const toneScale = visitorTone.map((value, channel) => clamp(
      (value + (baseTone[channel] - value) * settings.toneMatch) / Math.max(1, value),
      0.7,
      1.42,
    ));
    let coveredPixels = 0;
    let alphaTotal = 0;
    let seamAlphaTotal = 0;
    let seamSamples = 0;
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const pixel = (y * resolution + x) * 4;
        const point = [(x + 0.5) / resolution, (y + 0.5) / resolution];
        const sourceAlpha = reconstructed.data[pixel + 3] / 255;
        let feature = 0;
        for (const ellipse of features) {
          feature = Math.max(feature, Math.exp(-1.35 * (
            ((point[0] - ellipse.x) / ellipse.rx) ** 2
            + ((point[1] - ellipse.y) / ellipse.ry) ** 2
          )));
        }
        const edge = polygonEdgeDistance(point, contour);
        const feather = clamp(edge / settings.contourFeather);
        const opacity = settings.skinOpacity
          + (settings.featureOpacity - settings.skinOpacity) * feature;
        const alpha = opacity * feather * sourceAlpha;
        if (sourceAlpha > 0.5) coveredPixels += 1;
        alphaTotal += alpha;
        if (edge < 2 / resolution && sourceAlpha > 0) {
          seamAlphaTotal += alpha;
          seamSamples += 1;
        }
        for (let channel = 0; channel < 3; channel += 1) {
          const reconstructedValue = reconstructed.data[pixel + channel] * toneScale[channel];
          const detail = 1 + settings.detailStrength * feature * 0.08;
          const value = (reconstructedValue - baseTone[channel]) * detail + baseTone[channel];
          output.data[pixel + channel] = clamp(
            original.data[pixel + channel] * (1 - alpha) + value * alpha,
            0,
            255,
          );
        }
        output.data[pixel + 3] = 255;
      }
    }
    baseContext.putImageData(output, 0, 0);
    const resultCanvas = canvas(1024);
    const resultContext = resultCanvas.getContext('2d');
    resultContext.imageSmoothingEnabled = true;
    resultContext.drawImage(base, 0, 0, 1024, 1024);
    const texture = new THREE.CanvasTexture(resultCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.channel = 1;
    texture.name = 'Visitor Face Reconstruction V3';
    const diagnostics = {
      ...analysis,
      trianglesDrawn,
      triangleCoverage: trianglesDrawn / Math.max(1, this.canonical.triangles.length),
      pixelCoverage: coveredPixels / (resolution * resolution),
      meanCompositeAlpha: alphaTotal / (resolution * resolution),
      meanSeamAlpha: seamAlphaTotal / Math.max(1, seamSamples),
      visitorTone,
      baseTone,
      elapsedMs: performance.now() - startedAt,
    };
    texture.userData = { system: 'visitor-face-reconstruction-v3', diagnostics, settings };
    return { applied: true, texture, diagnostics, targetLandmarks };
  }
}

export function inspectReconstructionGeometry(character) {
  const meshes = character?.faceMeshes ?? [];
  let vertexCount = 0;
  let validUvVertices = 0;
  for (const mesh of meshes) {
    const position = mesh.geometry?.getAttribute('position');
    const uv = mesh.geometry?.getAttribute('uv1') ?? mesh.geometry?.getAttribute('uv');
    vertexCount += position?.count ?? 0;
    if (!position || !uv || uv.count !== position.count) continue;
    for (let index = 0; index < uv.count; index += 1) {
      const u = uv.getX(index);
      const v = uv.getY(index);
      if (Number.isFinite(u) && Number.isFinite(v) && u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        validUvVertices += 1;
      }
    }
  }
  return {
    baseId: character?.baseId ?? null,
    faceMeshCount: meshes.length,
    vertexCount,
    validUvVertices,
    uvCoverage: validUvVertices / Math.max(1, vertexCount),
    compatible: character?.baseId === 'A' && meshes.length > 0 && validUvVertices === vertexCount,
  };
}
