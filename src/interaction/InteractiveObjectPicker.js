import * as THREE from 'three';

export class InteractiveObjectPicker {
  constructor(canvas, camera, getRegions) {
    this.canvas = canvas;
    this.camera = camera;
    this.getRegions = getRegions;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.coolerPickBounds = new THREE.Box3();
    this.coolerPickPoint = new THREE.Vector3();
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);

    let closest = null;
    let closestDistance = Infinity;
    for (const region of this.getRegions() ?? []) {
      const hit = this.raycaster.intersectObjects(region.meshes ?? [], true)[0];
      let distance = hit?.distance ?? Infinity;
      if (region.name === 'Cooler' && region.bounds) {
        // The thin fins have gaps that are hard to select at orbit distance.
        // Expand the visible module's bounds locally without changing the GLB.
        this.coolerPickBounds.copy(region.bounds).expandByScalar(1.15);
        const point = this.raycaster.ray.intersectBox(this.coolerPickBounds, this.coolerPickPoint);
        if (point) distance = Math.min(distance, this.raycaster.ray.origin.distanceTo(point));
      }
      if (distance < closestDistance) {
        closest = region;
        closestDistance = distance;
      }
    }
    this.lastHitDistance = closestDistance;
    return closest;
  }
}
