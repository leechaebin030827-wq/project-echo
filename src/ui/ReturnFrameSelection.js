const FACE_DISTANCE = 13;
const SCENE_DISTANCE = 9;

export function differenceHash(imageData) {
  const { data, width, height } = imageData;
  if (width !== 9 || height !== 8) throw new Error('Difference hash needs a 9 × 8 image.');
  let bits = '';
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = (y * width + x) * 4;
      const right = left + 4;
      const luminance = (index) => data[index] * .299 + data[index + 1] * .587
        + data[index + 2] * .114;
      bits += luminance(left) > luminance(right) ? '1' : '0';
    }
  }
  return bits;
}

export function hashDistance(first, second) {
  if (!first || !second || first.length !== second.length) return Infinity;
  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) distance += 1;
  }
  return distance;
}

function isSimilar(first, second) {
  if (first.world && second.world && first.world !== second.world) return false;
  return first.id === second.id || first.source === second.source
    || hashDistance(first.faceHash, second.faceHash) <= FACE_DISTANCE
    || hashDistance(first.sceneHash, second.sceneHash) <= SCENE_DISTANCE;
}

export function selectReturnFrames(candidates, limit = 10) {
  const remaining = candidates.filter((frame) => frame.source);
  const selected = [];
  const worlds = [...new Set(remaining.map((frame) => frame.world).filter(Boolean))];
  const perWorldLimit = worlds.length > 1 ? Math.ceil(limit / worlds.length) + 1 : limit;
  while (remaining.length && selected.length < limit) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    remaining.forEach((candidate, index) => {
      if (selected.some((frame) => isSimilar(frame, candidate))) return;
      const worldCount = candidate.world
        ? selected.filter((frame) => frame.world === candidate.world).length : 0;
      if (worldCount >= perWorldLimit) return;
      const kindCount = candidate.kind
        ? selected.filter((frame) => frame.kind === candidate.kind).length : 0;
      const nearestTime = selected.length
        ? Math.min(...selected.map((frame) => Math.abs(frame.time - candidate.time))) : Infinity;
      const missingWorld = candidate.world && !selected.some((frame) =>
        frame.world === candidate.world);
      const missingKind = candidate.kind && !kindCount;
      const value = candidate.score + Math.min(nearestTime / 1000, 5) * 7
        + (missingWorld ? 1000 : 0) + (missingKind ? 90 : 0) - worldCount * 12;
      if (value > bestValue) { bestValue = value; bestIndex = index; }
    });
    if (bestIndex < 0) break;
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected.sort((a, b) => a.time - b.time);
}
