import * as THREE from 'three';

export const SEABED_RECENTER_DISTANCE = 400;

// All X waves repeat at the recenter distance, so moving the large surface
// under the camera does not change the height at any visible world point.
export function seabedHeight(x, z) {
  return -52.5
    + .39 * Math.sin(x * Math.PI / 40) * Math.sin(z * .067)
    + .23 * Math.sin(x * Math.PI * 2 / 25 + z * .115)
    + .13 * Math.cos(x * Math.PI / 10) * Math.sin(z * .18);
}

export function createSeabedGeometry() {
  const geometry = new THREE.PlaneGeometry(1200, 400, 160, 56);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    position.setY(index, seabedHeight(position.getX(index), position.getZ(index)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
