import * as THREE from 'three';

// Pixel coordinates in the 1774 × 887 ACQUIRED poster. Keep these separate
// from the GLB UVs so one composite texture serves both sides of the sign.
export const BILLBOARD_FACE_SLOTS = Object.freeze([
  { x: 689, y: 224, width: 359, height: 423 },
  { x: 1087, y: 286, width: 147, height: 197 },
  { x: 1230, y: 374, width: 136, height: 169 },
  { x: 1127, y: 493, width: 125, height: 144 },
]);

const FACE_OUTLINE = [
  [0.48, 0], [0.73, 0.04], [0.92, 0.17], [1, 0.44],
  [0.94, 0.71], [0.74, 0.94], [0.5, 1], [0.25, 0.94],
  [0.06, 0.72], [0, 0.43], [0.08, 0.17], [0.27, 0.04],
];

const FACE_OVAL_LANDMARKS = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function visitorFaceCrop(frame, points) {
  if (!frame?.width || !frame?.height || !points || points.length < 455) return null;
  const left = points[234];
  const right = points[454];
  const forehead = points[10];
  const chin = points[152];
  if (![left, right, forehead, chin].every((point) =>
    Number.isFinite(point?.x) && Number.isFinite(point?.y))) return null;

  const centerX = (left.x + right.x) * 0.5 * frame.width;
  const centerY = (forehead.y + chin.y) * 0.5 * frame.height;
  const width = Math.max(1, Math.abs(right.x - left.x) * frame.width * 1.08);
  const height = Math.max(1, Math.abs(chin.y - forehead.y) * frame.height * 1.06);
  const x = clamp(centerX - width * 0.5, 0, frame.width - 1);
  const y = clamp(centerY - height * 0.5, 0, frame.height - 1);
  return {
    x, y,
    width: Math.min(width, frame.width - x),
    height: Math.min(height, frame.height - y),
  };
}

function makeFaceCutout(frame, points, crop) {
  const width = Math.max(1, Math.ceil(crop.width));
  const height = Math.max(1, Math.ceil(crop.height));
  const face = document.createElement('canvas');
  face.width = width;
  face.height = height;
  const faceContext = face.getContext('2d');
  faceContext.drawImage(frame, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);

  const mask = document.createElement('canvas');
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext('2d');
  maskContext.fillStyle = '#ffffff';
  maskContext.beginPath();
  FACE_OVAL_LANDMARKS.forEach((index, position) => {
    const point = points[index];
    const x = (point.x * frame.width - crop.x) * width / crop.width;
    const y = (point.y * frame.height - crop.y) * height / crop.height;
    if (position === 0) maskContext.moveTo(x, y);
    else maskContext.lineTo(x, y);
  });
  maskContext.closePath();
  maskContext.fill();
  faceContext.globalCompositeOperation = 'destination-in';
  faceContext.filter = 'blur(3px)';
  faceContext.drawImage(mask, 0, 0);
  return face;
}

function traceFace(context, slot) {
  context.beginPath();
  FACE_OUTLINE.forEach(([x, y], index) => {
    const px = slot.x + x * slot.width;
    const py = slot.y + y * slot.height;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.closePath();
}

function drawFacetLines(context, slot, index) {
  const columns = 5;
  const rows = 6;
  const vertices = [];
  for (let row = 0; row <= rows; row += 1) {
    const points = [];
    for (let column = 0; column <= columns; column += 1) {
      const offset = row > 0 && row < rows && column > 0 && column < columns
        ? (((row * 13 + column * 7 + index * 3) % 5) - 2) * 0.016 : 0;
      points.push([
        slot.x + (column / columns + offset) * slot.width,
        slot.y + (row / rows - offset * 0.6) * slot.height,
      ]);
    }
    vertices.push(points);
  }

  const facetColors = ['#f7e2b9', '#2e7895', '#d8462b'];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = vertices[row][column];
      const b = vertices[row][column + 1];
      const c = vertices[row + 1][column];
      const d = vertices[row + 1][column + 1];
      for (const [triangleIndex, triangle] of [[a, b, d], [a, d, c]].entries()) {
        context.beginPath();
        context.moveTo(...triangle[0]);
        context.lineTo(...triangle[1]);
        context.lineTo(...triangle[2]);
        context.closePath();
        if ((row + column * 2 + triangleIndex + index) % 4 === 0) {
          context.fillStyle = facetColors[(row + column + index) % facetColors.length];
          context.globalAlpha = 0.13;
          context.fill();
        }
        context.globalAlpha = 0.29;
        context.strokeStyle = '#152932';
        context.lineWidth = slot.width > 200 ? 1.2 : 0.6;
        context.stroke();
      }
    }
  }
  context.globalAlpha = 1;
}

export class BillboardFaceTexture {
  constructor(image) {
    this.image = image;
    this.canvas = document.createElement('canvas');
    this.canvas.width = image.naturalWidth || image.width;
    this.canvas.height = image.naturalHeight || image.height;
    this.context = this.canvas.getContext('2d');
    this.context.drawImage(image, 0, 0);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.anisotropy = 8;
  }

  applyVisitorFace(session) {
    const crop = visitorFaceCrop(session?.frame, session?.points);
    if (!crop) return false;
    const face = makeFaceCutout(session.frame, session.points, crop);
    const { context } = this;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.drawImage(this.image, 0, 0);

    BILLBOARD_FACE_SLOTS.forEach((slot, index) => {
      context.save();
      traceFace(context, slot);
      context.clip();
      context.filter = 'sepia(0.28) saturate(0.78) contrast(1.12)';
      context.drawImage(face, slot.x, slot.y, slot.width, slot.height);
      context.filter = 'none';
      context.fillStyle = '#e9ae76';
      context.globalAlpha = 0.1;
      context.fillRect(slot.x, slot.y, slot.width, slot.height);
      context.globalAlpha = 1;
      drawFacetLines(context, slot, index);
      context.restore();
    });
    this.texture.needsUpdate = true;
    return true;
  }
}
