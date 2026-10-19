import { visitorFaceCrop, visitorFaceCutout } from '../world/BillboardFaceTexture.js';

const POSTER_URL = '/textures/hamina/forest-land-poster.jpg';

// The black facemesh opening in the supplied 1055 x 1491 poster.
// Normalized coordinates keep the mask aligned if the artwork is replaced at a new resolution.
const FACE_SLOT = Object.freeze({ x: 0.338, y: 0.463, width: 0.19, height: 0.19 });
const FACE_OUTLINE = Object.freeze([
  [0.28, 0], [0.66, 0.01], [0.9, 0.16], [1, 0.43],
  [0.91, 0.72], [0.68, 0.94], [0.48, 1], [0.22, 0.88],
  [0.05, 0.64], [0, 0.31], [0.1, 0.1],
]);

let posterPromise;

function loadPoster() {
  if (posterPromise) return posterPromise;
  posterPromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${POSTER_URL}`));
    image.src = POSTER_URL;
  });
  return posterPromise;
}

function traceFaceSlot(context, slot) {
  context.beginPath();
  FACE_OUTLINE.forEach(([x, y], index) => {
    const px = slot.x + x * slot.width;
    const py = slot.y + y * slot.height;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.closePath();
}

function drawFaceCover(context, frame, crop, slot) {
  const sourceAspect = crop.width / crop.height;
  const targetAspect = slot.width / slot.height;
  let sourceX = crop.x;
  let sourceY = crop.y;
  let sourceWidth = crop.width;
  let sourceHeight = crop.height;
  if (sourceAspect > targetAspect) {
    sourceWidth = crop.height * targetAspect;
    sourceX += (crop.width - sourceWidth) * 0.5;
  } else {
    sourceHeight = crop.width / targetAspect;
    sourceY += (crop.height - sourceHeight) * 0.5;
  }
  context.drawImage(
    frame,
    sourceX, sourceY, sourceWidth, sourceHeight,
    slot.x, slot.y, slot.width, slot.height,
  );
}

function makeMeshOverlay(image, slot) {
  const overlay = document.createElement('canvas');
  overlay.width = Math.max(1, Math.round(slot.width));
  overlay.height = Math.max(1, Math.round(slot.height));
  const context = overlay.getContext('2d', { willReadFrequently: true });
  context.drawImage(
    image,
    slot.x, slot.y, slot.width, slot.height,
    0, 0, overlay.width, overlay.height,
  );
  const pixels = context.getImageData(0, 0, overlay.width, overlay.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance = pixels.data[index] * 0.2126
      + pixels.data[index + 1] * 0.7152
      + pixels.data[index + 2] * 0.0722;
    // Preserve only the printed tracking lines and dots. A lower threshold
    // also copied the dark placeholder ink back over the visitor's portrait.
    const alpha = Math.max(0, Math.min(255, (luminance - 118) * 4.6));
    pixels.data[index] = 238;
    pixels.data[index + 1] = 240;
    pixels.data[index + 2] = 236;
    pixels.data[index + 3] = alpha;
  }
  context.putImageData(pixels, 0, 0);
  return overlay;
}

export function preloadHaminaForestPoster() {
  loadPoster().catch((error) => console.warn('[Hamina Forest paper]', error));
}

export async function renderHaminaForestPaper(canvas, session) {
  const poster = await loadPoster();
  canvas.width = poster.naturalWidth || poster.width;
  canvas.height = poster.naturalHeight || poster.height;
  const context = canvas.getContext('2d');
  context.drawImage(poster, 0, 0, canvas.width, canvas.height);

  const crop = visitorFaceCrop(session?.frame, session?.points);
  if (!crop) return false;
  const face = visitorFaceCutout(session.frame, session.points, crop);
  if (!face) return false;
  const slot = {
    x: FACE_SLOT.x * canvas.width,
    y: FACE_SLOT.y * canvas.height,
    width: FACE_SLOT.width * canvas.width,
    height: FACE_SLOT.height * canvas.height,
  };
  const meshOverlay = makeMeshOverlay(poster, slot);

  context.save();
  traceFaceSlot(context, slot);
  context.clip();
  context.fillStyle = '#17252b';
  context.fillRect(slot.x, slot.y, slot.width, slot.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.globalAlpha = 1;
  context.filter = 'grayscale(1) contrast(1.42) brightness(1.08)';
  drawFaceCover(context, face, {
    x: 0, y: 0, width: face.width, height: face.height,
  }, slot);
  context.filter = 'none';
  context.fillStyle = '#0b3654';
  context.globalAlpha = 0.12;
  context.fillRect(slot.x, slot.y, slot.width, slot.height);
  context.globalAlpha = 0.92;
  context.drawImage(meshOverlay, slot.x, slot.y, slot.width, slot.height);
  context.restore();
  return true;
}

export function buildHaminaForestPaperStrips(source, container, stripCount = 12) {
  container.replaceChildren();
  for (let index = 0; index < stripCount; index += 1) {
    const sourceX = Math.floor(source.width * index / stripCount);
    const sourceEnd = Math.ceil(source.width * (index + 1) / stripCount);
    const sourceWidth = Math.max(1, sourceEnd - sourceX);
    const strip = document.createElement('canvas');
    strip.className = 'world-interaction__forest-paper-strip';
    strip.width = sourceWidth;
    strip.height = source.height;
    strip.style.setProperty('--paper-index', index);
    strip.style.setProperty('--paper-wave', Math.sin(index * 1.37 + 0.4).toFixed(3));
    strip.style.left = `${index * 100 / stripCount}%`;
    strip.style.width = `${100 / stripCount + 0.12}%`;
    strip.getContext('2d').drawImage(
      source,
      sourceX, 0, sourceWidth, source.height,
      0, 0, sourceWidth, source.height,
    );
    container.append(strip);
  }
}
