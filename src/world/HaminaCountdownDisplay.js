import * as THREE from 'three';

const WIDTH = 2048;
const HEIGHT = 710;
const TARGET_DATE = new Date(2050, 0, 1, 0, 0, 0, 0);
const ORANGE = '#ff7a22';
const PALE_ORANGE = '#ffc078';

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawCondensedText(context, text, x, y, maxWidth, fontSize) {
  context.save();
  context.translate(x, y);
  context.scale(0.76, 1);
  context.font = `900 ${fontSize}px Impact, "Arial Narrow", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 0, 0, maxWidth / 0.76);
  context.restore();
}

export class HaminaCountdownDisplay {
  constructor(timerRoot) {
    this.timerRoot = timerRoot;
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.context = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.name = 'Hamina 2050 live countdown';
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = 4;
    this.materials = [];
    this.lastSecond = -1;
    this.randomMarks = this.createWeatheringMarks();
    this.installMaterial();
    this.update(true);
  }

  createWeatheringMarks() {
    let seed = 2050;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 92 }, () => ({
      x: random() * WIDTH,
      y: 54 + random() * (HEIGHT - 108),
      length: 2 + random() * 15,
      alpha: 0.025 + random() * 0.07,
    }));
  }

  installMaterial() {
    this.timerRoot.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const replacements = sources.map((source) => {
        if (source?.name !== 'Timer') return source;
        const material = source.clone();
        material.name = 'Timer_Live_2050';
        material.map = this.texture;
        material.emissiveMap = this.texture;
        material.emissive.set('#ff9a48');
        material.emissiveIntensity = 1.85;
        material.metalness = 0;
        material.roughness = 0.58;
        material.toneMapped = true;
        material.needsUpdate = true;
        this.materials.push(material);
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? replacements : replacements[0];
    });
    if (!this.materials.length) throw new Error('Hamina Timer material is missing.');
  }

  getTimeParts(now = Date.now()) {
    const secondsRemaining = Math.max(0, Math.floor((TARGET_DATE.getTime() - now) / 1000));
    return {
      days: Math.floor(secondsRemaining / 86400),
      hours: Math.floor(secondsRemaining / 3600) % 24,
      minutes: Math.floor(secondsRemaining / 60) % 60,
      seconds: secondsRemaining % 60,
    };
  }

  drawFrame() {
    const context = this.context;
    const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, '#151719');
    gradient.addColorStop(0.5, '#090b0c');
    gradient.addColorStop(1, '#111315');
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.strokeStyle = 'rgba(255, 121, 32, .72)';
    context.lineWidth = 3;
    context.strokeRect(34, 32, WIDTH - 68, HEIGHT - 64);
    context.strokeStyle = 'rgba(255, 172, 94, .18)';
    context.lineWidth = 1;
    context.strokeRect(46, 44, WIDTH - 92, HEIGHT - 88);

    context.fillStyle = ORANGE;
    const corners = [[34, 32, 1, 1], [WIDTH - 34, 32, -1, 1],
      [34, HEIGHT - 32, 1, -1], [WIDTH - 34, HEIGHT - 32, -1, -1]];
    for (const [x, y, sx, sy] of corners) {
      context.fillRect(x, y, sx * 72, sy * 5);
      context.fillRect(x, y, sx * 5, sy * 52);
    }

    context.font = '600 23px "SFMono-Regular", Menlo, monospace';
    context.textAlign = 'left';
    context.fillStyle = 'rgba(255, 154, 66, .76)';
    context.fillText('PROJECT ECHO / HAMINA', 72, 85);
    context.textAlign = 'right';
    context.fillText('COUNTDOWN // 2050', WIDTH - 72, 85);

    context.fillStyle = 'rgba(255, 122, 34, .72)';
    const cells = 32;
    const cellWidth = 42;
    const startX = (WIDTH - cells * cellWidth) / 2;
    for (let index = 0; index < cells; index += 1) {
      const active = index < 23;
      context.globalAlpha = active ? 0.82 : 0.14;
      roundedRect(context, startX + index * cellWidth, 112, 28, 10, 3);
      context.fill();
    }
    context.globalAlpha = 1;

    context.strokeStyle = 'rgba(255, 166, 83, .16)';
    context.lineWidth = 1;
    for (let y = 150; y < 580; y += 44) {
      context.beginPath();
      context.moveTo(55, y + 0.5);
      context.lineTo(WIDTH - 55, y + 0.5);
      context.stroke();
    }
    context.fillStyle = '#d6d0c9';
    for (const mark of this.randomMarks) {
      context.globalAlpha = mark.alpha;
      context.fillRect(mark.x, mark.y, mark.length, 1);
    }
    context.globalAlpha = 1;
  }

  drawCountdown(parts) {
    const context = this.context;
    const values = [String(parts.days), String(parts.hours).padStart(2, '0'),
      String(parts.minutes).padStart(2, '0'), String(parts.seconds).padStart(2, '0')];
    const labels = ['DAYS', 'HOURS', 'MINUTES', 'SECONDS'];
    const centers = [288, 815, 1280, 1745];
    const widths = [450, 290, 330, 300];

    context.save();
    context.shadowColor = '#ff6819';
    context.shadowBlur = 34;
    context.fillStyle = PALE_ORANGE;
    for (let index = 0; index < values.length; index += 1) {
      drawCondensedText(context, values[index], centers[index], 342, widths[index], 250);
    }
    context.restore();

    context.fillStyle = ORANGE;
    context.font = '900 112px Impact, "Arial Narrow", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const x of [548, 1065, 1532]) context.fillText(':', x, 335);

    context.fillStyle = 'rgba(225, 218, 211, .82)';
    context.font = '700 40px "Arial Narrow", "Helvetica Neue", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    labels.forEach((label, index) => context.fillText(label, centers[index], 535));

    context.fillStyle = 'rgba(255, 122, 34, .72)';
    for (let index = 0; index < 25; index += 1) {
      context.globalAlpha = index < 18 ? 0.88 : 0.13;
      roundedRect(context, 100 + index * 58, 594, 42, 13, 3);
      context.fill();
    }
    context.globalAlpha = 1;
    context.fillStyle = 'rgba(255, 185, 116, .68)';
    context.font = '500 20px "SFMono-Regular", Menlo, monospace';
    context.textAlign = 'right';
    context.fillText('LIVE / LOCAL TIME', WIDTH - 78, 628);
  }

  update(force = false) {
    const second = Math.floor(Date.now() / 1000);
    if (!force && second === this.lastSecond) return;
    this.lastSecond = second;
    this.drawFrame();
    this.drawCountdown(this.getTimeParts(second * 1000));
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.materials.forEach((material) => material.dispose());
    this.materials = [];
  }
}
