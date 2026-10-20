export const WORLD_IDS = Object.freeze(['nevada', 'hamina', 'lightcable']);

export function createWorldRoute(search = '', random = Math.random, allowOverride = false) {
  const requested = new URLSearchParams(search).get('worldOrder')?.split(',');
  if (allowOverride && requested?.length === WORLD_IDS.length
    && new Set(requested).size === WORLD_IDS.length
    && requested.every((id) => WORLD_IDS.includes(id))
    && requested[0] !== 'lightcable') return requested;
  const first = random() < .5 ? 'nevada' : 'hamina';
  const otherLand = first === 'nevada' ? 'hamina' : 'nevada';
  return random() < .5
    ? [first, otherLand, 'lightcable']
    : [first, 'lightcable', otherLand];
}
