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
    this.markerPickPoint = new THREE.Vector3();
    this.regionPickPoint = new THREE.Vector3();
    this.markerSize = new THREE.Vector3();
    this.nearVisibleBounds = new THREE.Box3();
    this.nearVisiblePoint = new THREE.Vector3();
  }

  pick(clientX, clientY, precise = true) {
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
    const rayOrigin = this.raycaster.ray.origin;
    for (const region of this.getRegions() ?? []) {
      // Exported *_Click cubes define the entire interactive area. Visible
      // meshes may extend outside their cube, but must never receive clicks.
      if (region.pickBounds) {
        // A ray starting inside a click cube exits through some face in every
        // direction, making the entire screen appear to hover that object.
        if (region.pickBounds.containsPoint(rayOrigin)) continue;
        const markerPoint = this.raycaster.ray.intersectBox(region.pickBounds, this.markerPickPoint);
        if (!markerPoint) continue;
        // Large click cubes close to the camera can cover unrelated objects.
        // In that case, also require the pointer to face the visible object.
        const markerNearDistance = Math.max(2,
          region.pickBounds.getSize(this.markerSize).length() * 0.3);
        if (region.pickBounds.distanceToPoint(rayOrigin) < markerNearDistance) {
          if (!region.bounds) continue;
          this.nearVisibleBounds.copy(region.bounds)
            .expandByScalar(region.name === 'Cooler' ? 1.15 : 1.2);
          if (this.nearVisibleBounds.containsPoint(rayOrigin)
            || !this.raycaster.ray.intersectBox(this.nearVisibleBounds, this.nearVisiblePoint)) continue;
        }
        const markerHit = precise && region.pickMarker
          ? this.raycaster.intersectObject(region.pickMarker, true)[0] : null;
        if (precise && region.pickMarker && !markerHit) continue;
        const distance = markerHit?.distance
          ?? this.raycaster.ray.origin.distanceTo(markerPoint);
        if (distance < closestDistance) {
          closest = region;
          closestDistance = distance;
        }
        continue;
      }
      if (region.bounds?.containsPoint(rayOrigin)) continue;
      const coolerBounds = region.name === 'Cooler' && !region.pickBounds && region.bounds
        ? this.coolerPickBounds.copy(region.bounds).expandByScalar(1.15)
        : null;
      if (coolerBounds?.containsPoint(rayOrigin)) continue;
      const broadPoint = region.bounds && this.raycaster.ray.intersectBox(region.bounds, this.regionPickPoint);
      const coolerHit = coolerBounds
        ? this.raycaster.ray.intersectBox(coolerBounds, this.coolerPickPoint) : null;
      if (!broadPoint && !coolerHit) continue;
      // Older Nevada exports have no click marker, so keep their mesh fallback.
      const hit = precise ? this.raycaster.intersectObjects(region.meshes ?? [], true)[0] : null;
      let distance = hit?.distance ?? Infinity;
      if (coolerHit) {
        distance = Math.min(distance, rayOrigin.distanceTo(coolerHit));
      } else if (!precise && broadPoint) {
        distance = this.raycaster.ray.origin.distanceTo(broadPoint);
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
