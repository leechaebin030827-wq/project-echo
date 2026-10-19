import * as THREE from 'three';

function createWeatherTexture(mode) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
  if (mode === 'snow') {
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.34, 'rgba(245,252,255,0.96)');
    gradient.addColorStop(0.72, 'rgba(218,240,255,0.52)');
  } else {
    gradient.addColorStop(0, 'rgba(255,238,198,0.9)');
    gradient.addColorStop(0.36, 'rgba(232,191,128,0.55)');
    gradient.addColorStop(0.76, 'rgba(196,139,77,0.16)');
  }
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = mode === 'snow' ? 'HaminaSnowParticle' : 'NevadaDustParticle';
  return texture;
}

export class WeatherParticles {
  constructor(scene, world, mode = 'dust') {
    this.scene = scene;
    this.world = world;
    this.mode = mode;
    this.count = mode === 'snow' ? 3600 : 860;
    this.center = world.center.clone();
    this.spanX = Math.max(36, Math.min(110, world.size.x * 0.72));
    this.spanZ = Math.max(36, Math.min(110, world.size.z * 0.72));
    this.height = mode === 'snow'
      ? Math.max(18, Math.min(48, world.size.y + 24))
      : Math.max(8, Math.min(14, world.size.y + 4));
    this.floor = world.bounds.min.y + 0.35;
    this.positions = new Float32Array(this.count * 3);
    this.velocity = new Float32Array(this.count);
    for (let index = 0; index < this.count; index += 1) this.reset(index, true);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.texture = createWeatherTexture(mode);
    this.material = new THREE.PointsMaterial({
      color: mode === 'snow' ? '#e8f7ff' : '#e8c99c',
      map: this.texture,
      alphaMap: this.texture,
      size: mode === 'snow' ? 0.3 : 0.14,
      opacity: mode === 'snow' ? 0.98 : 0.5,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: mode === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = mode === 'snow' ? 'HaminaSnow' : 'NevadaDust';
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  reset(index, initial = false) {
    const offset = index * 3;
    this.positions[offset] = this.center.x + (Math.random() - 0.5) * this.spanX;
    this.positions[offset + 1] = this.floor + (initial ? Math.random() : 1) * this.height;
    this.positions[offset + 2] = this.center.z + (Math.random() - 0.5) * this.spanZ;
    this.velocity[index] = this.mode === 'snow'
      ? 1.15 + Math.random() * 1.55
      : 0.08 + Math.random() * 0.14;
  }

  update(delta, elapsed) {
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 3;
      if (this.mode === 'snow') {
        this.positions[offset + 1] -= this.velocity[index] * delta;
        this.positions[offset] += Math.sin(elapsed * 0.7 + index) * delta * 0.23;
        this.positions[offset + 2] += Math.cos(elapsed * 0.55 + index * 0.37) * delta * 0.14;
        if (this.positions[offset + 1] < this.floor) this.reset(index);
      } else {
        this.positions[offset] += this.velocity[index] * delta;
        this.positions[offset + 1] += Math.sin(elapsed * 0.35 + index * 0.91) * delta * 0.035;
        this.positions[offset + 2] += Math.cos(elapsed * 0.28 + index * 0.47) * delta * 0.055;
        if (this.positions[offset] > this.center.x + this.spanX * 0.5) {
          this.positions[offset] = this.center.x - this.spanX * 0.5;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
