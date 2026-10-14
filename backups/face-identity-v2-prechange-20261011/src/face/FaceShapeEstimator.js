const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

// MediaPipe Face Mesh indices used by the estimator. Measurements are made in
// roll-corrected image space and normalized by face width/height, never pixels.
export const FACE_SHAPE_LANDMARKS = Object.freeze({
  forehead: 10,
  chin: 152,
  leftTemple: 234,
  rightTemple: 454,
  leftJaw: 172,
  rightJaw: 397,
  leftCheek: 93,
  rightCheek: 323,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  noseBridge: 168,
  noseTip: 2,
  leftNostril: 98,
  rightNostril: 327,
  leftMouth: 61,
  rightMouth: 291,
  lowerLip: 17,
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });

export class FaceShapeEstimator {
  estimate(points, imageWidth, imageHeight) {
    if (!Array.isArray(points) || points.length < 468 || imageWidth <= 0 || imageHeight <= 0) {
      return this.invalid('missing-landmarks');
    }
    const required = Object.values(FACE_SHAPE_LANDMARKS);
    if (required.some((index) => !Number.isFinite(points[index]?.x + points[index]?.y))) {
      return this.invalid('invalid-landmarks');
    }

    // Convert normalized MediaPipe coordinates to square-pixel image space.
    const pixel = points.map((point) => ({ x: point.x * imageWidth, y: point.y * imageHeight }));
    const leftEye = midpoint(pixel[33], pixel[133]);
    const rightEye = midpoint(pixel[362], pixel[263]);
    const eyeCenter = midpoint(leftEye, rightEye);
    const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
    const cosine = Math.cos(-roll);
    const sine = Math.sin(-roll);
    const aligned = pixel.map((point) => {
      const x = point.x - eyeCenter.x;
      const y = point.y - eyeCenter.y;
      return { x: x * cosine - y * sine, y: x * sine + y * cosine };
    });

    const p = (name) => aligned[FACE_SHAPE_LANDMARKS[name]];
    const faceWidth = distance(p('leftTemple'), p('rightTemple'));
    const faceHeight = distance(p('forehead'), p('chin'));
    if (faceWidth < 24 || faceHeight < 32) return this.invalid('face-too-small');

    const noseCenter = p('noseTip');
    const leftHalf = distance(p('leftTemple'), noseCenter);
    const rightHalf = distance(noseCenter, p('rightTemple'));
    const yawAsymmetry = Math.abs(leftHalf - rightHalf) / Math.max(leftHalf + rightHalf, 1);
    const eyeLineY = (p('leftEyeOuter').y + p('leftEyeInner').y
      + p('rightEyeInner').y + p('rightEyeOuter').y) * 0.25;
    const noseToEye = (p('noseTip').y - eyeLineY) / faceHeight;
    const pitchPenalty = clamp(Math.abs(noseToEye - 0.28) / 0.2);
    const rollDegrees = Math.abs(roll * 180 / Math.PI);
    const rollPenalty = clamp((rollDegrees - 4) / 18);
    const yawPenalty = clamp((yawAsymmetry - 0.035) / 0.19);
    const sizeQuality = clamp(Math.min(faceWidth / 180, faceHeight / 230), 0.35, 1);
    const quality = clamp(sizeQuality * (1 - rollPenalty * 0.45)
      * (1 - yawPenalty * 0.72) * (1 - pitchPenalty * 0.28));

    const leftEyeWidth = distance(p('leftEyeOuter'), p('leftEyeInner'));
    const rightEyeWidth = distance(p('rightEyeInner'), p('rightEyeOuter'));
    const mouthCenter = midpoint(p('leftMouth'), p('rightMouth'));
    const measurements = {
      faceAspectRatio: faceWidth / faceHeight,
      jawWidth: distance(p('leftJaw'), p('rightJaw')) / faceWidth,
      chinLength: distance(p('lowerLip'), p('chin')) / faceHeight,
      cheekWidth: distance(p('leftCheek'), p('rightCheek')) / faceWidth,
      eyeSpacing: distance(p('leftEyeInner'), p('rightEyeInner')) / faceWidth,
      eyeWidth: (leftEyeWidth + rightEyeWidth) * 0.5 / faceWidth,
      leftEyeWidth: leftEyeWidth / faceWidth,
      rightEyeWidth: rightEyeWidth / faceWidth,
      noseWidth: distance(p('leftNostril'), p('rightNostril')) / faceWidth,
      noseLength: distance(p('noseBridge'), p('noseTip')) / faceHeight,
      mouthWidth: distance(p('leftMouth'), p('rightMouth')) / faceWidth,
      mouthPosition: (mouthCenter.y - eyeLineY) / faceHeight,
    };
    const finite = Object.values(measurements).every(Number.isFinite);
    const plausible = measurements.faceAspectRatio > 0.45 && measurements.faceAspectRatio < 1.25
      && measurements.jawWidth > 0.35 && measurements.jawWidth < 1.05
      && measurements.eyeSpacing > 0.08 && measurements.eyeSpacing < 0.42
      && measurements.noseWidth > 0.08 && measurements.noseWidth < 0.42
      && measurements.mouthWidth > 0.15 && measurements.mouthWidth < 0.7;
    const valid = finite && plausible && quality >= 0.5 && rollDegrees <= 24 && yawAsymmetry <= 0.24;

    return {
      ...measurements,
      quality,
      valid,
      diagnostics: {
        reason: valid ? null : 'low-pose-or-measurement-confidence',
        rollDegrees,
        yawAsymmetry,
        pitchProxy: noseToEye,
        imageWidth,
        imageHeight,
      },
    };
  }

  invalid(reason) {
    return { valid: false, quality: 0, diagnostics: { reason } };
  }
}
