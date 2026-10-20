const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export const CABLE_EXIT_DURATION = 3.2;

export function getCableExitMotion(progress) {
  const t = clamp(progress);
  const rush = smooth(t);
  return {
    cameraBoost: 18 * rush,
    echoLead: 6.4 + 88 * rush,
    echoScale: 1 - .86 * smooth((t - .18) / .82),
    fov: 52 + 8 * rush,
    echoVisible: t < .985,
  };
}
