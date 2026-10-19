import * as THREE from 'three';
import { FACE_SETTINGS } from '../config.js';
import { estimateSkinToneTransform, featureToneWeight, matchSkinPixel } from './SkinToneMatcher.js';

const makeCanvas = (width, height = width) => Object.assign(document.createElement('canvas'), { width, height });
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smoothstep = (from, to, value) => {
  const t = clamp((value - from) / Math.max(1e-6, to - from));
  return t * t * (3 - 2 * t);
};

function drawTriangle(context, image, source, destination) {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = destination;
  const x1 = s1[0] - s0[0];
  const y1 = s1[1] - s0[1];
  const x2 = s2[0] - s0[0];
  const y2 = s2[1] - s0[1];
  const determinant = x1 * y2 - x2 * y1;
  if (Math.abs(determinant) < 1e-7) return;
  const a = ((d1[0] - d0[0]) * y2 - (d2[0] - d0[0]) * y1) / determinant;
  const c = ((d2[0] - d0[0]) * x1 - (d1[0] - d0[0]) * x2) / determinant;
  const b = ((d1[1] - d0[1]) * y2 - (d2[1] - d0[1]) * y1) / determinant;
  const d = ((d2[1] - d0[1]) * x1 - (d1[1] - d0[1]) * x2) / determinant;
  const centerX = (d0[0] + d1[0] + d2[0]) / 3;
  const centerY = (d0[1] + d1[1] + d2[1]) / 3;
  const clipTriangle = destination.map(([x, y]) => {
    const dx = x - centerX;
    const dy = y - centerY;
    const length = Math.max(1e-5, Math.hypot(dx, dy));
    return [x + dx / length * 0.8, y + dy / length * 0.8];
  });
  context.save();
  context.beginPath();
  context.moveTo(...clipTriangle[0]);
  context.lineTo(...clipTriangle[1]);
  context.lineTo(...clipTriangle[2]);
  context.closePath();
  context.clip();
  context.setTransform(a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]);
  context.drawImage(image, 0, 0);
  context.restore();
}

function edgeDistance(point, polygon) {
  let best = 1;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy));
    best = Math.min(best, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
  }
  return best;
}

export function createAdaptiveFeatureLandmarks(canonical, settings) {
  const output = canonical.landmarks.map((point) => [...point]);
  const parameters = settings.deformationParameters;
  if (!settings.adaptiveFeatureMappingEnabled) return output;
  const strength = clamp(settings.adaptiveFeatureStrength, 0, 0.8);
  const center = (indices) => {
    const points = indices.map((index) => canonical.landmarks[index]);
    return [
      points.reduce((sum, point) => sum + point[0], 0) / points.length,
      points.reduce((sum, point) => sum + point[1], 0) / points.length,
    ];
  };
  const transform = (indices, operation) => {
    for (const index of indices) output[index] = operation(canonical.landmarks[index], index);
  };

  if (parameters) {
    for (const side of ['left', 'right']) {
      const eyeIndices = canonical.groups[`${side}_eye`];
      const eyebrowIndices = canonical.groups[`${side}_eyebrow`];
      const eyeCenter = center(eyeIndices);
      const spacingScale = 1 + parameters.eyeSpacing * strength * 0.9;
      const widthScale = 1 + parameters.eyeWidth * strength * 0.8;
      const targetCenterX = 0.5 + (eyeCenter[0] - 0.5) * spacingScale;
      transform([...eyeIndices, ...eyebrowIndices], (point) => [
        clamp(targetCenterX + (point[0] - eyeCenter[0]) * widthScale, 0.04, 0.96),
        point[1],
      ]);
    }

    const noseIndices = canonical.groups.nose;
    const noseCenter = center(noseIndices);
    transform(noseIndices, (point) => [
      clamp(0.5 + (point[0] - 0.5) * (1 + parameters.noseWidth * strength * 0.85), 0.08, 0.92),
      clamp(noseCenter[1] + (point[1] - noseCenter[1])
        * (1 + parameters.noseLength * strength * 0.78), 0.08, 0.94),
    ]);

    const lipIndices = canonical.groups.lips;
    const lipCenter = center(lipIndices);
    transform(lipIndices, (point) => [
      clamp(lipCenter[0] + (point[0] - lipCenter[0])
        * (1 + parameters.mouthWidth * strength * 0.9), 0.08, 0.92),
      clamp(point[1] + parameters.mouthPosition * strength * 0.055, 0.08, 0.94),
    ]);
  }

  // Keep the visitor's actual eyelid and brow contours. Aggregate eye width
  // alone cannot retain aperture, corner slant, or left/right asymmetry.
  const visitor = settings.visitorLandmarks;
  const imageWidth = settings.frameWidth;
  const imageHeight = settings.frameHeight;
  if (!Array.isArray(visitor) || visitor.length < output.length
    || !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)
    || imageWidth <= 0 || imageHeight <= 0) return output;
  const pixel = (index) => [visitor[index]?.x * imageWidth, visitor[index]?.y * imageHeight];
  const midpoint = (a, b) => [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
  const sourceEyes = [midpoint(pixel(362), pixel(263)), midpoint(pixel(33), pixel(133))];
  const eyeVector = [sourceEyes[0][0] - sourceEyes[1][0], sourceEyes[0][1] - sourceEyes[1][1]];
  const sourceDistance = Math.hypot(...eyeVector);
  if (!Number.isFinite(sourceDistance) || sourceDistance < 12) return output;
  const cosine = eyeVector[0] / sourceDistance;
  const sine = eyeVector[1] / sourceDistance;
  const targetEyes = ['left', 'right'].map((side) => {
    const indices = canonical.groups[`${side}_eye`];
    return [0, 1].map((axis) => indices.reduce((sum, index) => sum + output[index][axis], 0) / indices.length);
  });
  const targetDistance = Math.hypot(
    targetEyes[1][0] - targetEyes[0][0], targetEyes[1][1] - targetEyes[0][1],
  );
  const scale = targetDistance / sourceDistance;
  const baseline = output.map((point) => [...point]);
  const protectedFeatures = new Set(canonical.contour);
  const featureDeltas = [];
  for (const [sideIndex, side] of ['left', 'right'].entries()) {
    const eyeIndices = canonical.groups[`${side}_eye`];
    const browIndices = canonical.groups[`${side}_eyebrow`];
    const eyeSet = new Set(eyeIndices);
    const sourceCenter = sourceEyes[sideIndex];
    const targetCenter = targetEyes[sideIndex];
    for (const index of [...eyeIndices, ...browIndices]) {
      const sourcePoint = pixel(index);
      if (!sourcePoint.every(Number.isFinite)) continue;
      const dx = sourcePoint[0] - sourceCenter[0];
      const dy = sourcePoint[1] - sourceCenter[1];
      const visitorTarget = [
        targetCenter[0] + (dx * cosine + dy * sine) * scale,
        targetCenter[1] + (-dx * sine + dy * cosine) * scale,
      ];
      const before = output[index];
      const weight = eyeSet.has(index) ? 1 : 0.92;
      output[index] = [
        clamp(before[0] + (visitorTarget[0] - before[0]) * weight, 0.04, 0.96),
        clamp(before[1] + (visitorTarget[1] - before[1]) * weight, 0.04, 0.96),
      ];
      featureDeltas.push({
        origin: before,
        delta: [output[index][0] - before[0], output[index][1] - before[1]],
      });
      protectedFeatures.add(index);
    }
  }
  // Keep the visitor's individual nostril, nose-tip and lip contours. A
  // width/length estimate alone leaves the character's original features in
  // the final texture even when the photographed face is clearly different.
  const sourceEyeMid = midpoint(sourceEyes[0], sourceEyes[1]);
  const targetEyeMid = midpoint(targetEyes[0], targetEyes[1]);
  for (const [name, strength] of [['nose', 0.86], ['lips', 0.9]]) {
    const indices = canonical.groups[name];
    const sourceCenter = [0, 1].map((axis) => indices.reduce((sum, index) =>
      sum + pixel(index)[axis], 0) / indices.length);
    const targetCenter = [0, 1].map((axis) => indices.reduce((sum, index) =>
      sum + output[index][axis], 0) / indices.length);
    const centerDx = sourceCenter[0] - sourceEyeMid[0];
    const centerDy = sourceCenter[1] - sourceEyeMid[1];
    const normalizedCenter = [
      targetEyeMid[0] + (centerDx * cosine + centerDy * sine) * scale,
      targetEyeMid[1] + (-centerDx * sine + centerDy * cosine) * scale,
    ];
    const mappedCenter = [0, 1].map((axis) => targetCenter[axis] + clamp(
      (normalizedCenter[axis] - targetCenter[axis]) * 0.65, -0.025, 0.025,
    ));
    for (const index of indices) {
      const sourcePoint = pixel(index);
      if (!sourcePoint.every(Number.isFinite)) continue;
      const dx = sourcePoint[0] - sourceCenter[0];
      const dy = sourcePoint[1] - sourceCenter[1];
      const visitorTarget = [
        mappedCenter[0] + (dx * cosine + dy * sine) * scale,
        mappedCenter[1] + (-dx * sine + dy * cosine) * scale,
      ];
      const before = output[index];
      output[index] = [
        clamp(before[0] + clamp(visitorTarget[0] - before[0], -0.055, 0.055) * strength, 0.04, 0.96),
        clamp(before[1] + clamp(visitorTarget[1] - before[1], -0.055, 0.055) * strength, 0.04, 0.96),
      ];
      featureDeltas.push({
        origin: before,
        delta: [output[index][0] - before[0], output[index][1] - before[1]],
      });
      protectedFeatures.add(index);
    }
  }
  // Carry feature displacement into adjacent triangles so the texture mesh
  // transitions smoothly instead of folding at the eyelid boundary.
  for (let index = 0; index < output.length; index += 1) {
    if (protectedFeatures.has(index)) continue;
    const point = output[index];
    let nearest = Infinity;
    let total = 0;
    let dx = 0;
    let dy = 0;
    for (const feature of featureDeltas) {
      const distance = Math.hypot(point[0] - feature.origin[0], point[1] - feature.origin[1]);
      nearest = Math.min(nearest, distance);
      const weight = Math.exp(-0.5 * (distance / 0.034) ** 2);
      total += weight;
      dx += feature.delta[0] * weight;
      dy += feature.delta[1] * weight;
    }
    if (total < 1e-5 || nearest > 0.17) continue;
    const fade = Math.exp(-0.5 * (nearest / 0.075) ** 2);
    output[index] = [
      clamp(point[0] + dx / total * fade, 0.04, 0.96),
      clamp(point[1] + dy / total * fade, 0.04, 0.96),
    ];
  }
  const triangleArea = (points, [a, b, c]) => {
    const p = points[a];
    const q = points[b];
    const r = points[c];
    return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  };
  for (const amount of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0]) {
    const candidate = amount === 1 ? output : output.map((point, index) => [
      baseline[index][0] + (point[0] - baseline[index][0]) * amount,
      baseline[index][1] + (point[1] - baseline[index][1]) * amount,
    ]);
    if (canonical.triangles.some((triangle) =>
      triangleArea(canonical.landmarks, triangle) * triangleArea(candidate, triangle) < 0)) continue;
    return candidate;
  }
  return output;
}

export class FaceTextureGenerator {
  constructor(canonical) {
    this.canonical = canonical;
  }

  generate(frame, points, segmentation, baseImage, options = {}) {
    const settings = { ...FACE_SETTINGS, ...options };
    const resolution = settings.resolution;
    const source = makeCanvas(frame.width, frame.height);
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.imageSmoothingEnabled = true;
    sourceContext.filter = `blur(${settings.sourceBlur}px)`;
    sourceContext.drawImage(frame, 0, 0);
    sourceContext.filter = 'none';

    const warped = makeCanvas(resolution);
    const warpedContext = warped.getContext('2d', { willReadFrequently: true });
    const mappedLandmarks = createAdaptiveFeatureLandmarks(this.canonical, {
      ...settings,
      visitorLandmarks: points,
      frameWidth: frame.width,
      frameHeight: frame.height,
    });
    for (const triangle of this.canonical.triangles) {
      drawTriangle(
        warpedContext,
        source,
        triangle.map((index) => [points[index].x * source.width, points[index].y * source.height]),
        triangle.map((index) => mappedLandmarks[index].map((value) => value * resolution)),
      );
    }

    const base = makeCanvas(resolution);
    const baseContext = base.getContext('2d', { willReadFrequently: true });
    baseContext.drawImage(baseImage, 0, 0, resolution, resolution);
    const data = warpedContext.getImageData(0, 0, resolution, resolution);
    const original = baseContext.getImageData(0, 0, resolution, resolution);
    const output = baseContext.createImageData(resolution, resolution);
    const canonical = this.canonical.landmarks;
    const contour = this.canonical.contour.map((index) => canonical[index]);
    const featureGroups = ['left_eye', 'right_eye', 'left_eyebrow', 'right_eyebrow', 'nose', 'lips']
      .map((name) => {
        const group = this.canonical.groups[name].map((index) => mappedLandmarks[index]);
        const xs = group.map((point) => point[0]);
        const ys = group.map((point) => point[1]);
        return {
          x: xs.reduce((sum, value) => sum + value) / xs.length,
          y: ys.reduce((sum, value) => sum + value) / ys.length,
          rx: Math.max(0.032, (Math.max(...xs) - Math.min(...xs)) * 0.95),
          ry: Math.max(0.026, (Math.max(...ys) - Math.min(...ys)) * 0.9),
        };
      });
    const featureAt = (u, v) => {
      let feature = 0;
      for (const group of featureGroups) {
        feature = Math.max(feature, Math.exp(-1.25 * (
          ((u - group.x) / group.rx) ** 2 + ((v - group.y) / group.ry) ** 2
        )));
      }
      return feature;
    };

    // Compare many paired skin pixels in the same UV positions. Eyes, lips,
    // hairline, deep shadows and triangle gaps must not set the skin balance.
    const visitorSkin = [];
    const baseSkin = [];
    for (let y = Math.floor(resolution * 0.28); y < resolution * 0.8; y += 5) {
      for (let x = Math.floor(resolution * 0.2); x < resolution * 0.8; x += 5) {
        const u = (x + 0.5) / resolution;
        const v = (y + 0.5) / resolution;
        if (featureAt(u, v) > 0.26 || edgeDistance([u, v], contour) < 0.075) continue;
        const pixel = (y * resolution + x) * 4;
        if (data.data[pixel + 3] < 220) continue;
        const visitor = [data.data[pixel], data.data[pixel + 1], data.data[pixel + 2]];
        const model = [original.data[pixel], original.data[pixel + 1], original.data[pixel + 2]];
        const sourceLight = visitor[0] * 0.2126 + visitor[1] * 0.7152 + visitor[2] * 0.0722;
        const modelLight = model[0] * 0.2126 + model[1] * 0.7152 + model[2] * 0.0722;
        if (sourceLight < 20 || sourceLight > 245 || modelLight < 20 || modelLight > 248) continue;
        if (Math.max(...visitor) - Math.min(...visitor) > 110) continue;
        visitorSkin.push(visitor);
        baseSkin.push(model);
      }
    }
    const toneTransform = estimateSkinToneTransform(visitorSkin, baseSkin, settings.toneMatch);

    const sampleTone = (array, indices) => {
      const samples = [[], [], []];
      for (const index of indices) {
        const [sampleX, sampleY] = canonical[index].map((value) => Math.floor(value * resolution));
        for (let dy = -4; dy <= 4; dy += 1) {
          for (let dx = -4; dx <= 4; dx += 1) {
            const pixel = (clamp(sampleY + dy, 0, resolution - 1) * resolution
              + clamp(sampleX + dx, 0, resolution - 1)) * 4;
            if (array[pixel + 3] < 128 || array[pixel] + array[pixel + 1] + array[pixel + 2] < 100) continue;
            for (let channel = 0; channel < 3; channel += 1) samples[channel].push(array[pixel + channel]);
          }
        }
      }
      return samples.map((values) => {
        if (!values.length) return 128;
        values.sort((a, b) => a - b);
        const from = Math.floor(values.length * 0.18);
        const to = Math.max(from + 1, Math.ceil(values.length * 0.82));
        const trimmed = values.slice(from, to);
        return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
      });
    };

    const medianRgb = (samples) => [0, 1, 2].map((channel) => {
      const sorted = samples.map((rgb) => rgb[channel]).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    });
    const visitorTone = toneTransform.sampleCount
      ? medianRgb(visitorSkin) : sampleTone(data.data, [50, 280, 101, 330, 151]);
    const baseTone = toneTransform.sampleCount
      ? medianRgb(baseSkin) : sampleTone(original.data, [50, 280, 101, 330, 151]);
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const pixel = (y * resolution + x) * 4;
        const point = [(x + 0.5) / resolution, (y + 0.5) / resolution];
        const feature = featureAt(point[0], point[1]);
        const edge = edgeDistance(point, contour);
        const hairline = 1 - smoothstep(0.17, 0.36, point[1]);
        const jaw = smoothstep(0.72, 0.93, point[1]);
        const feather = smoothstep(0, 0.052 + hairline * 0.026 + jaw * 0.02, edge);
        const alpha = (settings.skinBlend + (settings.featureOpacity - settings.skinBlend) * feature)
          * feather * data.data[pixel + 3] / 255;
        // Keep the color correction across eyes, nose and lips too. Their
        // fine detail survives the luminance/chroma transform; leaving their
        // whole region uncorrected creates a visible darker face-shaped patch.
        const skinWeight = featureToneWeight([
          data.data[pixel], data.data[pixel + 1], data.data[pixel + 2],
        ], visitorTone, feature);
        const matched = matchSkinPixel([
          data.data[pixel], data.data[pixel + 1], data.data[pixel + 2],
        ], toneTransform, skinWeight);
        const luminance = matched[0] * 0.2126 + matched[1] * 0.7152 + matched[2] * 0.0722;
        for (let channel = 0; channel < 3; channel += 1) {
          let value = matched[channel] * (1 - settings.desaturation)
            + luminance * settings.desaturation;
          const detailContrast = settings.featureEnhancementEnabled
            ? settings.featureDetailStrength * feature * 0.16
            : 0;
          value = (value - baseTone[channel]) * (settings.contrast + detailContrast)
            + baseTone[channel];
          value = Math.round(value / (256 / settings.quantization)) * (256 / settings.quantization);
          output.data[pixel + channel] = clamp(original.data[pixel + channel] * (1 - alpha) + value * alpha, 0, 255);
        }
        output.data[pixel + 3] = 255;
      }
    }
    baseContext.putImageData(output, 0, 0);

    const result = makeCanvas(1024);
    const resultContext = result.getContext('2d');
    resultContext.imageSmoothingEnabled = true;
    resultContext.filter = `blur(${settings.blur}px)`;
    resultContext.drawImage(base, 0, 0, 1024, 1024);
    resultContext.filter = 'none';
    if (settings.featureEnhancementEnabled && settings.featureDetailStrength > 0) {
      // Restore only the unblurred eyes/brows/nose/mouth. Skin blending and the
      // canonical warp stay unchanged; this avoids globally sharpening skin.
      resultContext.save();
      resultContext.beginPath();
      for (const group of featureGroups) {
        resultContext.ellipse(
          group.x * 1024,
          group.y * 1024,
          group.rx * 1024 * 1.08,
          group.ry * 1024 * 1.08,
          0,
          0,
          Math.PI * 2,
        );
      }
      resultContext.clip();
      resultContext.globalAlpha = clamp(settings.featureDetailStrength, 0, 0.75);
      resultContext.drawImage(base, 0, 0, 1024, 1024);
      resultContext.restore();
    }
    const texture = new THREE.CanvasTexture(result);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.channel = 1;
    texture.name = 'Session semantic FACE';
    texture.userData = {
      visitorTone,
      baseTone,
      toneTransform,
      settings,
      adaptiveFeatureMapping: settings.adaptiveFeatureMappingEnabled
        ? settings.deformationParameters
        : null,
    };
    return texture;
  }
}
