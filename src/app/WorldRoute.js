export const WORLD_IDS = Object.freeze(['nevada', 'hamina', 'lightcable']);
export const DEFAULT_WORLD_ROUTE = Object.freeze(['nevada', 'lightcable', 'hamina']);

export function createRandomWorldRoute(random = Math.random) {
  const first = random() < .5 ? 'nevada' : 'hamina';
  const otherLand = first === 'nevada' ? 'hamina' : 'nevada';
  return random() < .5
    ? [first, otherLand, 'lightcable']
    : [first, 'lightcable', otherLand];
}

export function createWorldRoute(search = '', random = Math.random, allowOverride = false) {
  const requestedOrder = new URLSearchParams(search).get('worldOrder');
  const requested = requestedOrder?.split(',');
  if (allowOverride && requested?.length === WORLD_IDS.length
    && new Set(requested).size === WORLD_IDS.length
    && requested.every((id) => WORLD_IDS.includes(id))
    && requested[0] !== 'lightcable') return requested;
  if (allowOverride && requestedOrder === 'random') return createRandomWorldRoute(random);
  return [...DEFAULT_WORLD_ROUTE];
}
