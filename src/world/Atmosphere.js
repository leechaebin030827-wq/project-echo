import * as THREE from 'three';

export class Atmosphere {
  constructor(scene, world = null, mode = 'nevada') {
    this.scene = scene;
    this.mode = mode;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 16;
    this.canvas.height = 1024;
    this.context = this.canvas.getContext('2d');
    this.transition = null;
    this.drawGradient(this.getGradient(mode));
    this.background = this.createGradientBackground();
    this.scene.background = this.background;
    this.scene.fog = null;
  }

  getGradient(mode) {
    if (mode === 'hamina') {
      return ['#2d7ed7', '#3e8cdd', '#55a0e6', '#72b7ed', '#91caf2', '#b2ddf6', '#cce9f8', '#dff1fa', '#eff8fc'];
    }
    return ['#315aa9', '#4b70b8', '#788bc2', '#b6a091', '#e8c16d', '#d39447', '#ad7749', '#91663d', '#815834'];
  }

  getGradientStops(mode) {
    if (mode === 'hamina') return [0, 0.08, 0.14, 0.19, 0.24, 0.34, 0.48, 0.7, 1];
    return [0, 0.055, 0.09, 0.12, 0.15, 0.245, 0.4, 0.66, 1];
  }

  drawGradient(colors, stops = this.getGradientStops(this.mode)) {
    const gradient = this.context.createLinearGradient(0, 0, 0, this.canvas.height);
    colors.forEach((color, index) => gradient.addColorStop(stops[index], color));
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.background) this.background.needsUpdate = true;
  }

  createGradientBackground() {
    const texture = new THREE.CanvasTexture(this.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  transitionTo(mode, duration = 3.8, world = null) {
    if (mode === this.mode && !this.transition) return;
    const from = this.currentColors ?? this.getGradient(this.mode);
    const to = this.getGradient(mode);
    this.transition = {
      mode,
      duration,
      elapsed: 0,
      from: from.map((color) => new THREE.Color(color)),
      to: to.map((color) => new THREE.Color(color)),
      world,
    };
  }

  finishTransition(mode, world = null) {
    this.mode = mode;
    this.transition = null;
    this.currentColors = this.getGradient(mode);
    this.drawGradient(this.currentColors);
    this.scene.fog = null;
  }

  update(delta) {
    if (!this.transition) return;
    this.transition.elapsed += delta;
    const progress = Math.min(1, this.transition.elapsed / this.transition.duration);
    const eased = progress * progress * (3 - 2 * progress);
    this.currentColors = this.transition.from.map((color, index) => (
      `#${color.clone().lerp(this.transition.to[index], eased).getHexString()}`
    ));
    const fromStops = this.getGradientStops(this.mode);
    const toStops = this.getGradientStops(this.transition.mode);
    const currentStops = fromStops.map((stop, index) => (
      THREE.MathUtils.lerp(stop, toStops[index], eased)
    ));
    this.drawGradient(this.currentColors, currentStops);
    if (progress >= 1) this.finishTransition(this.transition.mode, this.transition.world);
  }

  dispose() {
    this.background.dispose();
    this.scene.fog = null;
  }
}
