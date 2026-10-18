import * as THREE from 'three';

const BLUE_TINT = new THREE.Color('#a8d8ff');
const HOVER_EMISSION = new THREE.Color('#56b8ff');
const WHITE_EMISSION_MAP = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat,
);
WHITE_EMISSION_MAP.colorSpace = THREE.SRGBColorSpace;
WHITE_EMISSION_MAP.needsUpdate = true;

export function createHoverHighlightMaterial(material) {
  const copy = material.clone();
  if (copy.color?.isColor) copy.color.lerp(BLUE_TINT, 0.28);
  if (copy.emissive?.isColor) {
    copy.emissive.copy(HOVER_EMISSION);
    copy.emissiveIntensity = 1;
    // Baked emission masks vary between Nevada objects. A white map keeps
    // their existing shader variant while giving every surface the same glow.
    if (copy.emissiveMap) copy.emissiveMap = WHITE_EMISSION_MAP;
    copy.toneMapped = true;
  }
  return copy;
}
