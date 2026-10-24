import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CABLE_GAP_METERS } from './EndlessCablePath.js';

// The structural modules retain their spacing. A continuous round glass wall
// bridges the gaps between circular frames so the traveler stays in a tunnel.
export const GLASS_CABLE_FRAME_LENGTH = 1.92;
export const GLASS_CABLE_SPAN = GLASS_CABLE_FRAME_LENGTH + CABLE_GAP_METERS;
export const GLASS_CABLE_WIDTH = 6.2;
export const GLASS_CABLE_HEIGHT = GLASS_CABLE_WIDTH;
const RADIUS = GLASS_CABLE_WIDTH / 2;

function longitudinalTube(length, radius, y, z) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 6);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(0, y, z);
  return geometry;
}

function combine(parts) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return geometry;
}

export function createGlassCableModule() {
  const glassGeometry = new THREE.CylinderGeometry(
    RADIUS, RADIUS, GLASS_CABLE_SPAN, 48, 1, true,
  );
  glassGeometry.rotateZ(Math.PI / 2);
  const frameGeometries = [];
  for (const x of [-GLASS_CABLE_FRAME_LENGTH / 2, GLASS_CABLE_FRAME_LENGTH / 2]) {
    const ring = new THREE.TorusGeometry(RADIUS - .055, .055, 6, 48);
    ring.rotateY(Math.PI / 2);
    ring.translate(x, 0, 0);
    frameGeometries.push(ring);
  }
  const edgeGeometries = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const y = Math.cos(angle) * (RADIUS - .07);
    const z = Math.sin(angle) * (RADIUS - .07);
    frameGeometries.push(longitudinalTube(GLASS_CABLE_FRAME_LENGTH, .035, y, z));
    edgeGeometries.push(longitudinalTube(GLASS_CABLE_SPAN, .012, y, z));
  }
  const frameGeometry = combine(frameGeometries);
  const edgeGeometry = combine(edgeGeometries);
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    name: 'CableClearGlass', color: '#b9e9f2', metalness: .08, roughness: .07,
    clearcoat: 1, clearcoatRoughness: .045, ior: 1.46, side: THREE.DoubleSide,
    transparent: true, opacity: .27, depthWrite: false,
    emissive: '#4faac4', emissiveIntensity: .18,
  });
  // More reflection at glancing angles gives the curved wall a readable glass rim.
  glassMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      float glassRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
      diffuseColor.a *= 0.5 + glassRim * 2.1;`,
    );
  };
  const glass = new THREE.Mesh(glassGeometry, glassMaterial);
  glass.name = 'CableGlassCylinder';
  glass.userData.glass = true;
  const frame = new THREE.Mesh(frameGeometry, new THREE.MeshStandardMaterial({
    name: 'CableTitaniumFrame', color: '#6e99a7', metalness: .55,
    roughness: .22, emissive: '#24647b', emissiveIntensity: .23,
  }));
  frame.name = 'CableSpacedFrames';
  const edge = new THREE.Mesh(edgeGeometry, new THREE.MeshBasicMaterial({
    name: 'CableGlassEdge', color: '#8bd5e5', transparent: true,
    opacity: .55, depthWrite: false,
  }));
  edge.name = 'CableGlassEdges';

  return { parts: [glass, frame, edge], frameLength: GLASS_CABLE_FRAME_LENGTH };
}
