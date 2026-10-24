const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export const CABLE_EXIT_DURATION = 3.2;
export const CABLE_ECHO_LEAD = 12.5;

export function getCableExitMotion(progress) {
  const t = clamp(progress);
  const rush = smooth(t);
  return {
    cameraBoost: 70 * rush,
    echoLead: CABLE_ECHO_LEAD + 82 * rush,
    echoScale: 1 - .86 * smooth((t - .18) / .82),
    fov: 52 + 8 * rush,
    echoVisible: t < .985,
  };
}
