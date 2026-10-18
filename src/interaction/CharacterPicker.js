import * as THREE from 'three';

export class CharacterPicker {
  constructor(canvas, camera, manager) {
    this.canvas = canvas;
    this.camera = camera;
    this.manager = manager;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groupSphere = new THREE.Sphere();
    this.groupCenter = new THREE.Vector3();
    this.groupHitPoint = new THREE.Vector3();
  }

  pick(clientX, clientY, logHit = true) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    // Rendered world matrices are already current for hover. Refresh them only
    // for the click that commits a selection.
    if (logHit) for (const entity of this.manager.entities) entity.root.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.manager.pickTargets, false)[0];
    let distance = hit?.distance ?? Infinity;
    let entity = hit ? this.manager.byId.get(hit.object.userData.entityId) ?? null : null;
    for (const group of this.manager.danceDirector?.groups ?? []) {
      this.groupCenter.copy(group.center);
      this.groupCenter.y += group.height * 0.55;
      this.groupSphere.set(this.groupCenter, group.radius + 0.65);
      const point = this.raycaster.ray.intersectSphere(this.groupSphere, this.groupHitPoint);
      if (!point) continue;
      const groupDistance = this.raycaster.ray.origin.distanceTo(point);
      if (groupDistance >= distance) continue;
      distance = groupDistance;
      entity = group.members[0];
    }
    this.lastHitDistance = distance;
    if (entity && logHit) console.info(`[Picker] hit character: ${entity.id}`);
    return entity;
  }
}
