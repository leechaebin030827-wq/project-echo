const SHOTS = Object.freeze({
  Flag: [
    [0, 1, 0, 0],
    [2.2, 0.78, -0.045, 0],
    [4.8, 0.91, 0.035, 0.015],
    [7.8, 1.08, 0.005, 0],
  ],
  Timer: [
    [0, 1, 0, 0],
    [1.9, 0.73, -0.055, 0.055],
    [4.5, 0.82, 0.075, 0.035],
    [8, 0.98, 0.09, 0.015],
  ],
  default: [
    [0, 1, 0, 0],
    [1.8, 0.78, -0.045, 0.035],
    [4.4, 0.86, 0.06, 0.055],
    [7.5, 1, 0.075, 0.015],
  ],
});

const ease = (amount) => amount * amount * (3 - 2 * amount);

function sampleKeys(shots, elapsed) {
  const time = Math.max(0, elapsed);
  for (let index = 1; index < shots.length; index += 1) {
    const start = shots[index - 1];
    const end = shots[index];
    if (time > end[0]) continue;
    const blend = ease((time - start[0]) / (end[0] - start[0]));
    return start.slice(1).map((value, column) =>
      value + (end[column + 1] - value) * blend);
  }
  return shots.at(-1).slice(1);
}

// Keep velocity through intermediate marks, so the camera does not pause at
// every left/right focus point during a continuous scan.
function sampleSmoothKeys(shots, elapsed) {
  const time = Math.max(0, elapsed);
  for (let index = 1; index < shots.length; index += 1) {
    const start = shots[index - 1];
    const end = shots[index];
    if (time > end[0]) continue;
    const duration = end[0] - start[0];
    const t = (time - start[0]) / duration;
    const t2 = t * t;
    const t3 = t2 * t;
    const before = shots[index - 2];
    const after = shots[index + 1];
    return start.slice(1).map((value, column) => {
      const endValue = end[column + 1];
      const startSlope = before
        ? (endValue - before[column + 1]) / (end[0] - before[0]) : 0;
      const endSlope = after
        ? (after[column + 1] - value) / (after[0] - start[0]) : 0;
      return (2 * t3 - 3 * t2 + 1) * value
        + (t3 - 2 * t2 + t) * duration * startSlope
        + (-2 * t3 + 3 * t2) * endValue
        + (t3 - t2) * duration * endSlope;
    });
  }
  return shots.at(-1).slice(1);
}

export function sampleInteractiveShot(name, elapsed) {
  const [distance, side, height] = sampleKeys(SHOTS[name] ?? SHOTS.default, elapsed);
  return { distance, side, height };
}

// One gentle pass around the building, from its left facade to its right.
const DATA_CENTER_SWEEP = [
  [0, 0, 1, 0],
  [2, -0.25, 0.94, 0.025],
  [5.8, 0.28, 0.91, 0.045],
  [8.6, 0.37, 1.01, 0.02],
  [10.6, 0.2, 1.06, 0],
];

export function sampleDataCenterSweep(elapsed) {
  const [angle, distance, height] = sampleKeys(DATA_CENTER_SWEEP, elapsed);
  return { angle, distance, height };
}

// Aim and camera position cross the billboard on different tracks. Distance,
// elevation and a restrained roll form an arc before the full-sign reveal.
const BILLBOARD_SCAN = [
  [0, -0.3, -0.34, 1, 0, 0],
  [2.5, -0.18, -0.22, 0.81, 0.035, -0.012],
  [6.3, 0.18, 0.22, 0.75, 0.06, 0.012],
  [8.5, 0.34, 0.38, 0.83, 0.03, 0.018],
  [12, 0, 0, 1.16, 0, 0],
];

export function sampleBillboardScan(elapsed) {
  const [across, cameraAcross, distance, height, tilt] = sampleSmoothKeys(BILLBOARD_SCAN, elapsed);
  return { across, cameraAcross, distance, height, tilt };
}

// The first frame matches the focus arrival. Slow periodic motion keeps the
// money and nearby people in view throughout the narration and research card.
export function sampleMoneyOrbit(elapsed) {
  const time = Math.max(0, elapsed);
  const entry = ease(Math.min(1, time / 0.8));
  const angle = entry * -0.32 * Math.sin(time * 0.27);
  const distance = 1 + entry * (-0.22 * Math.sin(time * 0.35)
    + 0.055 * (1 - Math.cos(time * 0.18)));
  const height = entry * 0.035 * (1 - Math.cos(time * 0.28));
  const targetBlend = 0.2 * ease(Math.min(1, time / 8));
  return { angle, distance, height, targetBlend };
}
