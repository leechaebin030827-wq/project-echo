const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function toSkinColor(rgb) {
  const y = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return [y, rgb[2] - y, rgb[0] - y];
}

function quantile(sorted, fraction) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function estimateSkinToneTransform(sourceSamples, targetSamples, strength = 0.85) {
  if (sourceSamples.length < 24 || sourceSamples.length !== targetSamples.length) {
    return { luminanceGain: 1, contrastGain: 1, sourceLuminance: 128,
      targetLuminance: 128, blueShift: 0, redShift: 0, sampleCount: 0 };
  }
  const source = [[], [], []];
  const target = [[], [], []];
  for (let index = 0; index < sourceSamples.length; index += 1) {
    const from = toSkinColor(sourceSamples[index]);
    const to = toSkinColor(targetSamples[index]);
    for (let channel = 0; channel < 3; channel += 1) {
      source[channel].push(from[channel]);
      target[channel].push(to[channel]);
    }
  }
  source.forEach((values) => values.sort((a, b) => a - b));
  target.forEach((values) => values.sort((a, b) => a - b));
  const sourceLuminance = quantile(source[0], 0.5);
  const targetLuminance = quantile(target[0], 0.5);
  const fullGain = clamp(targetLuminance / Math.max(8, sourceLuminance), 0.55, 2);
  const luminanceGain = Math.exp(Math.log(fullGain) * clamp(strength, 0, 1));
  const sourceRange = quantile(source[0], 0.8) - quantile(source[0], 0.2);
  const targetRange = quantile(target[0], 0.8) - quantile(target[0], 0.2);
  const contrastGain = clamp(targetRange / Math.max(8, sourceRange * luminanceGain), 0.86, 1.14);
  return {
    luminanceGain,
    contrastGain: 1 + (contrastGain - 1) * strength * 0.55,
    sourceLuminance,
    targetLuminance,
    blueShift: clamp((quantile(target[1], 0.5) - quantile(source[1], 0.5)) * strength, -24, 24),
    redShift: clamp((quantile(target[2], 0.5) - quantile(source[2], 0.5)) * strength, -24, 24),
    sampleCount: sourceSamples.length,
  };
}

export function matchSkinPixel(rgb, transform, skinWeight = 1) {
  const weight = clamp(skinWeight, 0, 1);
  if (weight <= 0 || !transform.sampleCount) return rgb;
  const [luminance, blue, red] = toSkinColor(rgb);
  const y = transform.targetLuminance
    + (luminance * transform.luminanceGain - transform.targetLuminance)
      * transform.contrastGain;
  const adjustedY = luminance + (y - luminance) * weight;
  const adjustedBlue = blue + transform.blueShift * weight;
  const adjustedRed = red + transform.redShift * weight;
  const r = adjustedY + adjustedRed;
  const b = adjustedY + adjustedBlue;
  const g = (adjustedY - r * 0.2126 - b * 0.0722) / 0.7152;
  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}

export function featureToneWeight(rgb, skinRgb, feature) {
  if (feature <= 0) return 1;
  const [luminance, blue, red] = toSkinColor(rgb);
  const [skinLuminance, skinBlue, skinRed] = toSkinColor(skinRgb);
  const difference = Math.max(
    Math.abs(luminance - skinLuminance) / Math.max(48, skinLuminance),
    Math.abs(blue - skinBlue) / 58,
    Math.abs(red - skinRed) / 58,
  );
  const amount = clamp((difference - 0.16) / 0.38, 0, 1);
  const ink = amount * amount * (3 - 2 * amount);
  return 1 - 0.55 * clamp(feature, 0, 1) * ink;
}
