import * as THREE from 'three';

const MIN_INTENSITY = 90;
const MAX_INTENSITY = 2400;

export class InteractiveFocusLight {
  constructor(scene) {
    this.light = new THREE.SpotLight('#fff5ed', 0, 0, 0.5, 0.9, 2);
    this.light.name = 'CameraInteractiveFocusLight';
    this.light.castShadow = false;
    scene.add(this.light, this.light.target);
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.target = new THREE.Vector3();
  }

  update(camera, region, delta, cameraTarget = null, filmElapsed = 0) {
    if (!region) {
      this.light.intensity = THREE.MathUtils.damp(this.light.intensity, 0, 7, delta);
      return;
    }

    this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.light.position.copy(camera.position)
      .addScaledVector(this.forward, 0.45)
      .addScaledVector(this.right, 0.22)
      .addScaledVector(this.up, 0.14);
    const billboardReveal = region.name === 'Billboard'
      ? THREE.MathUtils.smoothstep(filmElapsed, 8.2, 12) : 0;
    const focusCenter = region.name === 'Cooler' && region.focusTarget
      ? region.focusTarget : region.center;
    const focusSize = region.name === 'Cooler' && region.focusSize
      ? region.focusSize : region.size;
    const focusRadius = region.name === 'Cooler' && region.focusRadius
      ? region.focusRadius : region.radius;
    this.target.copy(region.name === 'Billboard' && cameraTarget
      ? cameraTarget : focusCenter);
    if (region.name === 'Billboard') this.target.lerp(region.center, billboardReveal);
    else this.target.y += focusSize.y * 0.06;
    this.light.target.position.copy(this.target);

    const distance = this.light.position.distanceTo(this.target);
    this.light.angle = THREE.MathUtils.clamp(
      Math.atan2(Math.max(focusRadius * (1.2 + billboardReveal * 0.4), 1.2), distance),
      0.24, region.name === 'Billboard' ? 0.95 : 0.82,
    );
    const intensity = THREE.MathUtils.clamp(
      distance * distance * (1.15 + billboardReveal * 0.34), MIN_INTENSITY, MAX_INTENSITY,
    );
    this.light.intensity = THREE.MathUtils.damp(this.light.intensity, intensity, 5, delta);
  }

  dispose() {
    this.light.target.removeFromParent();
    this.light.removeFromParent();
    this.light.dispose();
  }
}
