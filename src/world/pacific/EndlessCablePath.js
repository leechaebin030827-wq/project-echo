import * as THREE from 'three';

export const CABLE_START_X = -104;
export const CABLE_GAP_METERS = 1.85;
export const CABLE_WINDOW_COUNT = 108;
export const CABLE_BEHIND_COUNT = 12;
const FORWARD = new THREE.Vector3(1, 0, 0);

export function cableSpacing(bounds) {
  return bounds.max.x - bounds.min.x + CABLE_GAP_METERS;
}

// Distance is never clamped: scenery can be recycled while the camera keeps moving.
export function cablePoint(distance, originDistance = 0, target = new THREE.Vector3()) {
  return target.set(
    CABLE_START_X + distance - originDistance,
    -47.8 + .25 * Math.sin(distance * .018) + .12 * Math.sin(distance * .048),
    6 * Math.sin(distance * .024) + 2.6 * Math.sin(distance * .061),
  );
}

export function cableTangent(distance, target = new THREE.Vector3()) {
  return target.set(
    1,
    .25 * .018 * Math.cos(distance * .018) + .12 * .048 * Math.cos(distance * .048),
    6 * .024 * Math.cos(distance * .024) + 2.6 * .061 * Math.cos(distance * .061),
  ).normalize();
}

export function cableWindowStart(distance, spacing) {
  return Math.floor(distance / spacing) - CABLE_BEHIND_COUNT;
}

export function cableSegmentMatrix(index, bounds, originDistance, spacing, dummy, point, tangent) {
  const centerDistance = (index + .5) * spacing;
  cablePoint(centerDistance, originDistance, point);
  cableTangent(centerDistance, tangent);
  const authoredCenter = (bounds.min.x + bounds.max.x) * .5;
  dummy.position.copy(point).addScaledVector(tangent, -authoredCenter);
  dummy.quaternion.setFromUnitVectors(FORWARD, tangent);
  dummy.scale.set(1, 1, 1);
  dummy.updateMatrix();
  return dummy.matrix;
}
