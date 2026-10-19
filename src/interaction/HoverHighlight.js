import * as THREE from 'three';

const BLUE_TINT = new THREE.Color('#a8d8ff');
const HOVER_EMISSION = new THREE.Color('#56b8ff');
const YELLOW_TINT = new THREE.Color('#ffe36b');
const YELLOW_EMISSION = new THREE.Color('#ffc928');
const ECHO_TINT = new THREE.Color('#f0dbff');
const ECHO_EMISSION = new THREE.Color('#b692ff');
const WHITE_EMISSION_MAP = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat,
);
WHITE_EMISSION_MAP.colorSpace = THREE.SRGBColorSpace;
WHITE_EMISSION_MAP.needsUpdate = true;

export function createHoverHighlightMaterial(material, tone = 'blue') {
  const copy = material.clone();
  const isYellow = tone === 'yellow';
  const isCharacter = tone === 'character';
  const isEcho = tone === 'echo';
  const shaderTint = isYellow ? 'vec3(1.0, 0.78, 0.16)' : 'vec3(0.35, 0.76, 1.0)';
  const hoverLighting = isEcho
    ? `float echoRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
      outgoingLight += vec3(0.24, 0.12, 0.38) * (0.12 + echoRim * 0.7);`
    : `outgoingLight = mix(outgoingLight, ${shaderTint}, ${isCharacter ? '0.62' : isYellow ? '0.42' : '0.34'});`;
  // Preserve procedural vertex motion, then apply the hover tint in the final
  // lighting stage. Editing only color/emissive left highly metallic, mapped,
  // or unlit cooler parts almost unchanged even though they were selected.
  const sourceOnBeforeCompile = material.onBeforeCompile;
  copy.onBeforeCompile = (shader, renderer) => {
    sourceOnBeforeCompile?.call(copy, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `${hoverLighting}
      #include <opaque_fragment>`,
    );
  };
  const sourceProgramKey = material.customProgramCacheKey?.bind(material);
  copy.customProgramCacheKey = () => `${sourceProgramKey?.() ?? ''}-echo-hover-v3-${tone}`;
  if (copy.color?.isColor) copy.color.lerp(isEcho ? ECHO_TINT : isYellow ? YELLOW_TINT : BLUE_TINT,
    isCharacter ? 0.58 : isEcho ? 0.08 : isYellow ? 0.5 : 0.38);
  if (copy.emissive?.isColor) {
    copy.emissive.copy(isEcho ? ECHO_EMISSION : isYellow ? YELLOW_EMISSION : HOVER_EMISSION);
    copy.emissiveIntensity = isCharacter ? 1.5 : isEcho ? 0.12 : isYellow ? 1.55 : 1.35;
    // Baked emission masks vary between Nevada objects. A white map keeps
    // their existing shader variant while giving every surface the same glow.
    if (copy.emissiveMap) copy.emissiveMap = WHITE_EMISSION_MAP;
    copy.toneMapped = true;
  }
  return copy;
}
