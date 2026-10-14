import * as THREE from 'three';
import { FACE_SETTINGS } from '../config.js';

const makeCanvas = (width, height = width) => Object.assign(document.createElement('canvas'), { width, height });
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

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
    for (const triangle of this.canonical.triangles) {
      drawTriangle(
        warpedContext,
        source,
        triangle.map((index) => [points[index].x * source.width, points[index].y * source.height]),
        triangle.map((index) => this.canonical.landmarks[index].map((value) => value * resolution)),
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
        const group = this.canonical.groups[name].map((index) => canonical[index]);
        const xs = group.map((point) => point[0]);
        const ys = group.map((point) => point[1]);
        return {
          x: xs.reduce((sum, value) => sum + value) / xs.length,
          y: ys.reduce((sum, value) => sum + value) / ys.length,
          rx: Math.max(0.032, (Math.max(...xs) - Math.min(...xs)) * 0.95),
          ry: Math.max(0.026, (Math.max(...ys) - Math.min(...ys)) * 0.9),
        };
      });

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

    const visitorTone = sampleTone(data.data, [50, 280, 101, 330, 151]);
    const baseTone = sampleTone(original.data, [50, 280, 101, 330, 151]);
    const targetTone = visitorTone.map((value, channel) => (
      value + (baseTone[channel] - value) * settings.toneMatch
    ));
    const toneScale = visitorTone.map((value, channel) => (
      clamp(targetTone[channel] / Math.max(1, value), 0.68, 1.48)
    ));

    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const pixel = (y * resolution + x) * 4;
        const point = [(x + 0.5) / resolution, (y + 0.5) / resolution];
        let feature = 0;
        for (const group of featureGroups) {
          feature = Math.max(feature, Math.exp(-1.25 * (
            ((point[0] - group.x) / group.rx) ** 2 + ((point[1] - group.y) / group.ry) ** 2
          )));
        }
        const feather = clamp(edgeDistance(point, contour) / 0.045);
        const alpha = (settings.skinBlend + (settings.featureOpacity - settings.skinBlend) * feature)
          * feather * data.data[pixel + 3] / 255;
        const luminance = (data.data[pixel] + data.data[pixel + 1] + data.data[pixel + 2]) / 3;
        for (let channel = 0; channel < 3; channel += 1) {
          let value = data.data[pixel + channel] * (1 - settings.desaturation)
            + luminance * settings.desaturation;
          value *= toneScale[channel];
          const detailContrast = settings.featureEnhancementEnabled
            ? settings.featureDetailStrength * feature * 0.16
            : 0;
          value = (value - targetTone[channel]) * (settings.contrast + detailContrast)
            + targetTone[channel];
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
    texture.userData = { visitorTone, baseTone, settings };
    return texture;
  }
}
