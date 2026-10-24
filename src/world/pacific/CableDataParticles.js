import * as THREE from 'three';
import { cablePoint, cableTangent } from './EndlessCablePath.js';

const COUNT = 64;
const NEAR_DISTANCE = 2;
const FAR_DISTANCE = 62;
const MIN_SPEED = 19;
const MAX_SPEED = 31;

function glowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.26, 'rgba(255,255,255,.82)');
  gradient.addColorStop(.58, 'rgba(255,255,255,.24)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class CableDataParticles {
  constructor(root, random = Math.random) {
    this.random = random;
    this.items = Array.from({ length: COUNT }, () => ({
      distance: NEAR_DISTANCE + random() * (FAR_DISTANCE - NEAR_DISTANCE),
      speed: MIN_SPEED + random() * (MAX_SPEED - MIN_SPEED),
      radius: .65 + random() * 1.8,
      angle: random() * Math.PI * 2,
      trail: .55 + random() * 1.15,
    }));
    this.point = new THREE.Vector3();
    this.tail = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.projected = new THREE.Vector3();
    this.positions = new Float32Array(COUNT * 3);
    this.trails = new Float32Array(COUNT * 6);
    const colors = new Float32Array(COUNT * 3);
    for (let index = 0; index < COUNT; index += 1) {
      const color = new THREE.Color().setHSL(.49 + random() * .13, .68, .73);
      color.toArray(colors, index * 3);
    }
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    pointGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trails, 3));
    const headMaterial = new THREE.PointsMaterial({
      size: .18, sizeAttenuation: true, vertexColors: true, map: glowTexture(),
      transparent: true, opacity: .84, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const trailMaterial = new THREE.LineBasicMaterial({
      color: '#73e5f4', transparent: true, opacity: .5,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.heads = new THREE.Points(pointGeometry, headMaterial);
    this.heads.frustumCulled = false;
    this.streaks = new THREE.LineSegments(trailGeometry, trailMaterial);
    this.streaks.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.name = 'CableDataParticles';
    this.group.add(this.heads, this.streaks);
    this.group.visible = false;
    this.hoveredIndex = null;
    root.add(this.group);
  }

  update(delta, travelDistance, originDistance) {
    this.group.visible = true;
    this.items.forEach((item, index) => {
      if (index !== this.hoveredIndex) item.distance += item.speed * delta;
      if (item.distance > travelDistance + FAR_DISTANCE) {
        item.distance = travelDistance + NEAR_DISTANCE + this.random() * 9;
      }
      cablePoint(item.distance, originDistance, this.point);
      cableTangent(item.distance, this.tangent);
      const side = Math.cos(item.angle) * item.radius;
      this.point.x -= this.tangent.z * side;
      this.point.z += this.tangent.x * side;
      this.point.y += Math.sin(item.angle) * item.radius;
      this.point.toArray(this.positions, index * 3);
      this.point.toArray(this.trails, index * 6);
      this.tail.copy(this.point).addScaledVector(this.tangent, -item.trail);
      this.tail.toArray(this.trails, index * 6 + 3);
    });
    this.heads.geometry.attributes.position.needsUpdate = true;
    this.streaks.geometry.attributes.position.needsUpdate = true;
  }

  pick(clientX, clientY, rect, camera) {
    if (!this.group.visible || !rect.width || !rect.height) return null;
    let selected = null;
    let best = Infinity;
    for (let index = 0; index < this.items.length; index += 1) {
      this.projected.fromArray(this.positions, index * 3).project(camera);
      if (this.projected.z <= -1 || this.projected.z >= 1
        || Math.abs(this.projected.x) > 1 || Math.abs(this.projected.y) > 1) continue;
      const x = rect.left + (this.projected.x * .5 + .5) * rect.width;
      const y = rect.top + (-this.projected.y * .5 + .5) * rect.height;
      const distance = Math.hypot(x - clientX, y - clientY);
      if (distance > 20 || distance >= best) continue;
      best = distance;
      selected = { index };
    }
    return selected;
  }

  setHover(index = null) {
    this.hoveredIndex = index;
  }
}
