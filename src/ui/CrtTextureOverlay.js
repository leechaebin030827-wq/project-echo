const CRT_TEXTURE_LAB_PRESET = Object.freeze({
  curvature: 0.39,
  scan: 0.56,
  mask: 'slot',
  maskStrength: 0.4,
  glow: 0.51,
  roll: 0.35,
});

export class CrtTextureOverlay {
  constructor(stage, preset = CRT_TEXTURE_LAB_PRESET) {
    this.root = document.createElement('div');
    this.root.className = 'crt-texture-overlay';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.dataset.mask = preset.mask;
    this.root.style.setProperty('--crt-curvature', preset.curvature);
    this.root.style.setProperty('--crt-scan', preset.scan);
    this.root.style.setProperty('--crt-mask-strength', preset.maskStrength);
    this.root.style.setProperty('--crt-glow', preset.glow);
    this.root.style.setProperty('--crt-roll', preset.roll);

    for (const layer of ['glow', 'mask', 'scanlines', 'roll', 'glass']) {
      const element = document.createElement('span');
      element.className = `crt-texture-overlay__${layer}`;
      this.root.append(element);
    }

    stage.append(this.root);
  }

  dispose() {
    this.root.remove();
  }
}

export { CRT_TEXTURE_LAB_PRESET };
