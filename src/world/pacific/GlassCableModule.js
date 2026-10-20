import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CABLE_GAP_METERS } from './EndlessCablePath.js';

// The structural modules retain the spacing of the former 1.92 m cable
// pieces. Clear panes bridge the spaces so the traveler stays inside glass.
export const GLASS_CABLE_FRAME_LENGTH = 1.92;
export const GLASS_CABLE_SPAN = GLASS_CABLE_FRAME_LENGTH + CABLE_GAP_METERS;
export const GLASS_CABLE_WIDTH = 6.2;
export const GLASS_CABLE_HEIGHT = 5.0;

function pane(width, height, rotation, translation) {
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.rotateX(rotation);
  geometry.translate(...translation);
  return geometry;
}

function beam(size, translation) {
  const geometry = new THREE.BoxGeometry(...size);
  geometry.translate(...translation);
  return geometry;
}

function combine(parts) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return geometry;
}

export function createGlassCableModule() {
  const halfWidth = GLASS_CABLE_WIDTH * .5;
  const halfHeight = GLASS_CABLE_HEIGHT * .5;
  const glassGeometry = combine([
    pane(GLASS_CABLE_SPAN, GLASS_CABLE_HEIGHT, 0, [0, 0, -halfWidth]),
    pane(GLASS_CABLE_SPAN, GLASS_CABLE_HEIGHT, 0, [0, 0, halfWidth]),
    pane(GLASS_CABLE_SPAN, GLASS_CABLE_WIDTH, Math.PI / 2, [0, halfHeight, 0]),
    pane(GLASS_CABLE_SPAN, GLASS_CABLE_WIDTH, Math.PI / 2, [0, -halfHeight, 0]),
  ], false);
  const frameGeometries = [];
  for (const y of [-halfHeight, halfHeight]) {
    for (const z of [-halfWidth, halfWidth]) {
      frameGeometries.push(beam([GLASS_CABLE_FRAME_LENGTH, .065, .065], [0, y, z]));
    }
  }
  for (const x of [-GLASS_CABLE_FRAME_LENGTH / 2, GLASS_CABLE_FRAME_LENGTH / 2]) {
    for (const y of [-halfHeight, halfHeight]) {
      frameGeometries.push(beam([.065, .075, GLASS_CABLE_WIDTH], [x, y, 0]));
    }
    for (const z of [-halfWidth, halfWidth]) {
      frameGeometries.push(beam([.065, GLASS_CABLE_HEIGHT, .075], [x, 0, z]));
    }
  }
  const frameGeometry = combine(frameGeometries);
  const edgeGeometry = combine([
    beam([GLASS_CABLE_SPAN, .018, .018], [0, -halfHeight + .035, -halfWidth + .035]),
    beam([GLASS_CABLE_SPAN, .018, .018], [0, -halfHeight + .035, halfWidth - .035]),
  ], false);
  const glass = new THREE.Mesh(glassGeometry, new THREE.MeshPhysicalMaterial({
    name: 'CableClearGlass', color: '#a9ddeb', metalness: 0, roughness: .055,
    clearcoat: 1, clearcoatRoughness: .055, side: THREE.DoubleSide,
    transparent: true, opacity: .115, depthWrite: false,
    emissive: '#1d668a', emissiveIntensity: .055,
  }));
  glass.name = 'CableGlassFourSides';
  glass.userData.glass = true;
  const frame = new THREE.Mesh(frameGeometry, new THREE.MeshStandardMaterial({
    name: 'CableTitaniumFrame', color: '#243b4a', metalness: .75,
    roughness: .38, emissive: '#0c3b54', emissiveIntensity: .13,
  }));
  frame.name = 'CableSpacedFrames';
  const edge = new THREE.Mesh(edgeGeometry, new THREE.MeshBasicMaterial({
    name: 'CableGlassEdge', color: '#51abc5', transparent: true,
    opacity: .37, depthWrite: false,
  }));
  edge.name = 'CableGlassEdges';

  return { parts: [glass, frame, edge], frameLength: GLASS_CABLE_FRAME_LENGTH };
}
