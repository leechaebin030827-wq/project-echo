import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const WORLD_TIME_ZONES = Object.freeze({
  nevada: 'America/Los_Angeles',
  hamina: 'Europe/Helsinki',
});
const WORLD_COORDINATES = Object.freeze({
  nevada: { latitude: 39, longitude: -116 },
  hamina: { latitude: 60.57, longitude: 27.2 },
});
const smoothstep = (low, high, value) => {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(x, y, seed) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise(u, v, frequencyX, frequencyY, seed) {
  const x = u * frequencyX;
  const y = v * frequencyY;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(0, 1, x - ix);
  const fy = smoothstep(0, 1, y - iy);
  const sample = (sx, sy) => hash((sx + frequencyX) % frequencyX, sy, seed);
  const upper = THREE.MathUtils.lerp(sample(ix, iy), sample(ix + 1, iy), fx);
  const lower = THREE.MathUtils.lerp(sample(ix, iy + 1), sample(ix + 1, iy + 1), fx);
  return THREE.MathUtils.lerp(upper, lower, fy);
}

function canvasTexture(canvas, name) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function createCloudTexture(mode) {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const hamina = mode === 'hamina';
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const broad = noise(u, v, hamina ? 7 : 7, hamina ? 9 : 13, hamina ? 71 : 23);
      const medium = noise(u, v, hamina ? 19 : 17, hamina ? 23 : 34, hamina ? 83 : 31);
      const detail = noise(u, v, hamina ? 48 : 43, hamina ? 55 : 72, hamina ? 97 : 47);
      const wisps = noise(u, v, hamina ? 83 : 69, hamina ? 87 : 108, hamina ? 109 : 59);
      const shape = broad * 0.46 + medium * 0.35 + detail * 0.19;
      const body = hamina
        ? smoothstep(0.435, 0.655, shape) * 0.83
        : smoothstep(0.58, 0.72, shape) * 0.57;
      const fibers = hamina
        ? smoothstep(0.56, 0.76, medium * 0.58 + wisps * 0.42) * 0.14
        : smoothstep(0.61, 0.78, medium * 0.38 + wisps * 0.62) * 0.18;
      const latitude = 1 - v * 2;
      const horizonWeight = hamina ? 0.75 + 0.25 * (1 - Math.abs(latitude))
        : 0.8 + 0.2 * Math.max(0, latitude);
      const density = clamp((body + fibers) * horizonWeight, 0, 1);
      const offset = (y * width + x) * 4;
      const value = Math.round(density * 255);
      image.data[offset] = value;
      image.data[offset + 1] = Math.round(broad * 255);
      image.data[offset + 2] = Math.round(detail * 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvasTexture(canvas, `SkyClouds-${mode}`);
}

export function createStarTexture() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  let state = 42817;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = 0; index < 750; index += 1) {
    const x = Math.floor(random() * width);
    // Equirectangular sky: the top half is above the horizon.
    const y = Math.floor(random() * (height * 0.51));
    const brightness = Math.round(24 + Math.pow(random(), 6) * 180);
    const temperature = random();
    const radius = brightness > 190 ? 1 : 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const px = (x + dx + width) % width;
        const py = y + dy;
        if (py < 0 || py >= height) continue;
        const offset = (py * width + px) * 4;
        const falloff = dx === 0 && dy === 0 ? 1 : 0.08;
        image.data[offset] = Math.max(image.data[offset], brightness * falloff);
        image.data[offset + 1] = Math.max(image.data[offset + 1], brightness * falloff * (temperature < 0.18 ? 0.86 : 0.95));
        image.data[offset + 2] = Math.max(image.data[offset + 2], brightness * falloff * (temperature > 0.82 ? 0.8 : 1));
        image.data[offset + 3] = 255;
      }
    }
  }
  context.putImageData(image, 0, 0);
  return canvasTexture(canvas, 'SkyStars');
}

export function getSkyVisibility(hour, { sunrise = 6.25, sunset = 19.0 } = {}) {
  const daylight = smoothstep(sunrise - 0.15, sunrise + 1.05, hour)
    * (1 - smoothstep(sunset - 1.05, sunset + 0.15, hour));
  const stars = (1 - smoothstep(sunrise - 1.1, sunrise - 0.1, hour))
    + smoothstep(sunset + 0.2, sunset + 1.25, hour);
  return {
    daylight,
    stars: clamp(stars, 0, 1),
  };
}

export function getSolarTimes(mode, date = new Date()) {
  const { latitude, longitude } = WORLD_COORDINATES[mode];
  const timeZone = WORLD_TIME_ZONES[mode];
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86400000) + 1;
  const declination = 23.44 * Math.PI / 180
    * Math.sin((2 * Math.PI / 365.2422) * (dayOfYear - 81));
  const latitudeRadians = latitude * Math.PI / 180;
  const hourAngle = Math.acos(clamp(-Math.tan(latitudeRadians) * Math.tan(declination), -1, 1));
  const daylightHours = 24 * hourAngle / Math.PI;
  const offsetName = new Intl.DateTimeFormat('en-US', {
    timeZone, timeZoneName: 'shortOffset',
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = offsetName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const zoneOffset = match
    ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) + Number(match[3] ?? 0) / 60)
    : 0;
  const solarNoon = 12 + (zoneOffset * 15 - longitude) / 15;
  return {
    sunrise: clamp(solarNoon - daylightHours / 2, 0, 24),
    sunset: clamp(solarNoon + daylightHours / 2, 0, 24),
  };
}

export function getLocalSkyHour(mode, date = new Date()) {
  const timeZone = WORLD_TIME_ZONES[mode];
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 12);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const requestedHour = typeof window !== 'undefined' && import.meta.env?.DEV
    ? new URLSearchParams(window.location.search).get('skyHour') : null;
  const previewHour = requestedHour === null ? NaN : Number(requestedHour);
  const decimalHour = Number.isFinite(previewHour)
    ? clamp(previewHour, 0, 23.99) : hour + minute / 60;
  return {
    hour: decimalHour,
    timeZone,
    localTime: `${String(Math.floor(decimalHour)).padStart(2, '0')}:${String(Math.floor(decimalHour % 1 * 60)).padStart(2, '0')}`,
    solarTimes: getSolarTimes(mode, date),
  };
}
