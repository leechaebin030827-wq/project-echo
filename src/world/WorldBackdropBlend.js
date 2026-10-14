import * as THREE from 'three';

const smooth = (value) => {
  const x = THREE.MathUtils.clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

// Hamina is temporarily aligned to Nevada's ECHO. PostProcessing blends the
// two full background frames while rendering the same travel rig in both.
export class WorldBackdropBlend {
  constructor(fromWorld, toWorld, characterRoots, echoTravel, stage) {
    this.fromWorld = fromWorld;
    this.toWorld = toWorld;
    this.characterRoots = characterRoots;
    this.echoTravel = echoTravel;
    this.stage = stage;
    this.offset = fromWorld.echoCenter.clone().sub(toWorld.echoCenter);
    this.lightEntries = [];
    this.progress = 0;
    this.prepared = false;
  }

  prepare(duration) {
    this.duration = Math.max(0.001, duration);
    this.startedAt = performance.now();
    this.toPosition = this.toWorld.root.position.clone();
    this.toEchoVisible = this.toWorld.echo.visible;
    if (!this.toWorld.lights) this.toWorld.addLighting();
    else this.toWorld.lights.forEach((light) => this.toWorld.scene.add(light));
    this.toWorld.root.position.add(this.offset);
    this.toWorld.root.updateMatrixWorld(true);
    this.toWorld.root.visible = true;
    this.toWorld.echo.visible = false;
    for (const light of this.toWorld.lights) light.position.add(this.offset);
    for (const light of this.fromWorld.lights ?? []) {
      if (typeof light.intensity === 'number') {
        this.lightEntries.push({ light, intensity: light.intensity, incoming: false });
      }
    }
    for (const light of this.toWorld.lights) {
      if (typeof light.intensity === 'number') {
        this.lightEntries.push({ light, intensity: light.intensity, incoming: true });
      }
    }
    this.prepared = true;
    this.update();
  }

  update() {
    if (!this.prepared) return;
    this.progress = smooth((performance.now() - this.startedAt) / (this.duration * 1000));
    for (const entry of this.lightEntries) {
      entry.light.intensity = entry.intensity * (entry.incoming ? this.progress : 1 - this.progress);
    }
    if (import.meta.env.DEV) this.stage.dataset.worldBlend = this.progress.toFixed(2);
  }

  finish(cameraController) {
    if (!this.prepared) return;
    this.toWorld.root.position.copy(this.toPosition);
    this.toWorld.root.updateMatrixWorld(true);
    this.toWorld.echo.visible = this.toEchoVisible;
    for (const light of this.toWorld.lights) light.position.sub(this.offset);
    for (const entry of this.lightEntries) entry.light.intensity = entry.intensity;
    // Moving the camera and the same rig with the Hamina root keeps ECHO at
    // exactly the same screen position when authored coordinates take over.
    cameraController.camera.position.sub(this.offset);
    cameraController.target.sub(this.offset);
    this.echoTravel.shiftWorld(this.offset.clone().negate());
    this.prepared = false;
    if (import.meta.env.DEV) delete this.stage.dataset.worldBlend;
  }

  cancel() {
    if (!this.prepared) return;
    this.toWorld.root.position.copy(this.toPosition);
    this.toWorld.root.updateMatrixWorld(true);
    this.toWorld.root.visible = false;
    this.toWorld.echo.visible = this.toEchoVisible;
    for (const light of this.toWorld.lights) {
      light.position.sub(this.offset);
      light.removeFromParent();
    }
    for (const entry of this.lightEntries) entry.light.intensity = entry.intensity;
    this.prepared = false;
    if (import.meta.env.DEV) delete this.stage.dataset.worldBlend;
  }
}
