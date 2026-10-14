const SUPPORTED_MODES = Object.freeze({
  geometry: 'Geometry V2',
  reconstructionV3: 'Reconstruction V3',
});

export function resolveFaceQaTarget(search, developerMode) {
  if (!developerMode) return null;
  const params = new URLSearchParams(search);
  const targetId = params.get('faceQaTarget');
  const identityMode = params.get('faceIdentity');
  if (targetId !== 'A01' || !SUPPORTED_MODES[identityMode]) return null;
  return {
    targetId,
    identityMode,
    label: `${targetId} | ${SUPPORTED_MODES[identityMode]}`,
  };
}
