import * as THREE from 'three';
import { NEVADA_INTERACTIONS } from './NevadaInteractionContent.js';

const smooth = (value) => {
  const x = THREE.MathUtils.clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};

export class WorldInteractionExperience {
  constructor({ stage, camera, caption, postProcessing, getOriginalPhoto,
    isFocusSettled = () => true, onClose, voice }) {
    this.stage = stage;
    this.camera = camera;
    this.caption = caption;
    this.voice = voice;
    this.postProcessing = postProcessing;
    this.getOriginalPhoto = getOriginalPhoto;
    this.isFocusSettled = isFocusSettled;
    this.onClose = onClose;
    this.active = null;
    this.audio = new Audio('/audio/water_cooler.mp3');
    this.audio.preload = 'none';
    this.audio.volume = 0;
    this.coolerBasePosition = new THREE.Vector3();
    this.coolerRight = new THREE.Vector3();
    this.coolerUp = new THREE.Vector3();
    this.coolerForward = new THREE.Vector3();
    this.coolerLookTarget = new THREE.Vector3();
    this.root = document.createElement('section');
    this.root.className = 'world-interaction';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = `
      <div class="world-interaction__visual" aria-hidden="true"></div>
      <div class="world-interaction__actions">
        <button type="button" class="world-interaction__research-button" aria-label="자료 보기" title="자료 보기" hidden>↗</button>
        <button type="button" class="world-interaction__close" aria-label="월드로 돌아가기" title="월드로 돌아가기">×</button>
      </div>
      <section class="world-interaction__card" hidden aria-label="Research record">
        <div class="world-interaction__card-index"></div>
        <h2 class="world-interaction__card-title"></h2>
        <p class="world-interaction__card-fact"></p>
        <p class="world-interaction__card-interpretation"></p>
        <a class="world-interaction__source" target="_blank" rel="noopener noreferrer">VIEW SOURCE ↗</a>
        <button type="button" class="world-interaction__card-close" aria-label="자료 닫기" title="자료 닫기">×</button>
      </section>`;
    stage.append(this.root);
    this.visual = this.root.querySelector('.world-interaction__visual');
    this.researchButton = this.root.querySelector('.world-interaction__research-button');
    this.card = this.root.querySelector('.world-interaction__card');
    this.root.querySelector('.world-interaction__close').addEventListener('click', () => this.close());
    this.researchButton.addEventListener('click', () => this.openResearch());
    this.root.querySelector('.world-interaction__card-close').addEventListener('click', () => this.closeResearch());
    this.onKeyDown = (event) => {
      if (event.key !== 'Escape' || !this.active) return;
      if (!this.card.hidden) this.closeResearch();
      else this.close();
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  start(region) {
    const content = NEVADA_INTERACTIONS[region?.name];
    if (!content || this.active) return false;
    const clipPrefix = region.name === 'Data Center' ? 'datacenter' : region.name.toLowerCase();
    const phraseTimes = content.phrases.map((_, index) =>
      this.voice.duration(`${clipPrefix}_click_${String(index + 1).padStart(2, '0')}`) + 0.12);
    const narrationDuration = phraseTimes.reduce((sum, value) => sum + value, 0);
    this.active = {
      region, content, elapsed: 0, phraseIndex: -1, phraseTimes,
      narrationDuration, effectDuration: Math.max(content.effectDuration, narrationDuration + 0.45),
      visualStarted: false, visualEnded: false,
      materialRestore: [], photoUrl: null, idleAfterNarration: 0,
      copyElapsed: 0, copyCount: 0,
    };
    this.root.dataset.interaction = region.name;
    if (import.meta.env.DEV) this.stage.dataset.interactionQa = region.name;
    this.root.classList.add('visible');
    this.root.setAttribute('aria-hidden', 'false');
    this.stage.classList.add('interaction-caption-active');
    this.caption.hideOverride();
    this.researchButton.hidden = true;
    this.card.hidden = true;
    this.visual.replaceChildren();
    return true;
  }

  buildVisual(active) {
    const { name, meshes } = active.region;
    for (const mesh of meshes) {
      const original = mesh.material;
      const bright = (material) => {
        const copy = material.clone();
        if (copy.emissive?.isColor) {
          copy.emissive.set('#f7d7a1');
          copy.emissiveIntensity = 0.18;
        }
        return copy;
      };
      mesh.material = Array.isArray(original) ? original.map(bright) : bright(original);
      active.materialRestore.push({ mesh, original });
    }
    if (name === 'Data Center') {
      const frame = this.getOriginalPhoto();
      if (!frame?.width || !frame?.height) {
        if (import.meta.env.DEV) this.visual.textContent = 'ORIGINAL PHOTO UNAVAILABLE';
        return;
      }
      active.photoUrl = frame.toDataURL('image/png');
      const grid = document.createElement('div');
      grid.className = 'world-interaction__copy-grid';
      active.copyGrid = grid;
      this.visual.append(grid);
    } else if (name === 'Billboard') {
      this.visual.innerHTML = '<div class="world-interaction__fact-flip"><strong>SOLD!</strong><span>$11,000,000,000</span></div>';
    } else if (name === 'Money') {
      const burst = document.createElement('div');
      burst.className = 'world-interaction__money-burst';
      for (let index = 0; index < 12; index += 1) {
        const bill = document.createElement('span');
        bill.textContent = '$';
        bill.style.setProperty('--bill-index', index);
        burst.append(bill);
      }
      const amount = document.createElement('strong');
      amount.className = 'world-interaction__amount';
      amount.textContent = '$27,000,000';
      this.visual.append(burst, amount);
    } else if (name === 'Cable') {
      this.visual.innerHTML = '<div class="world-interaction__network"><span>LAS VEGAS<br>THE CORE</span><div class="world-interaction__network-line"></div><span>TAHOE RENO<br>THE CITADEL</span><small>500+ MILES / CONCEPTUAL CONNECTION</small></div>';
    } else if (name === 'Cooler') {
      this.coolerBasePosition.copy(this.camera.position);
      active.coolerBaseZoom = this.camera.zoom;
      this.audio.currentTime = 0;
      this.audio.volume = 0;
      this.audio.play().catch(() => {});
    }
    this.visual.classList.remove('is-ending');
  }

  update(delta) {
    const active = this.active;
    if (!active) return;
    if (!this.isFocusSettled(active.region)) return;
    active.elapsed += delta;
    if (!active.visualStarted) {
      active.visualStarted = true;
      this.buildVisual(active);
      this.visual.classList.add('is-running');
    }
    const { content, elapsed } = active;
    if (active.region.name === 'Data Center' && active.copyGrid && !active.visualEnded) {
      active.copyElapsed += delta;
      while (active.copyElapsed >= 0.22) {
        active.copyElapsed -= 0.22;
        const index = active.copyCount++;
        const tile = document.createElement('div');
        tile.className = 'world-interaction__copy-tile';
        tile.style.setProperty('--column', index % 5);
        tile.style.setProperty('--hue', `${(index * 47) % 170 - 85}deg`);
        tile.style.setProperty('--contrast', `${0.78 + (index % 7) * 0.12}`);
        tile.style.setProperty('--scale-x', `${0.86 + (index % 4) * 0.11}`);
        tile.style.setProperty('--skew', `${(index % 5 - 2) * 2}deg`);
        const image = document.createElement('img');
        image.src = active.photoUrl;
        image.alt = '';
        image.style.objectPosition = `${20 + (index * 31) % 61}% ${15 + (index * 23) % 71}%`;
        tile.append(image);
        active.copyGrid.append(tile);
        tile.addEventListener('animationend', () => tile.remove(), { once: true });
      }
    }
    const effectProgress = THREE.MathUtils.clamp(elapsed / active.effectDuration, 0, 1);
    const envelope = smooth(effectProgress / 0.35) * (1 - smooth((effectProgress - 0.62) / 0.38));
    if (active.region.name === 'Cooler') {
      active.coolerEnvelope = envelope;
      const inversion = envelope * 0.94;
      this.postProcessing.setCoolerInversion(inversion);
      const soundEnvelope = smooth(effectProgress / 0.12)
        * (1 - smooth((effectProgress - 0.82) / 0.18));
      this.audio.volume = soundEnvelope * 0.8;
    }
    if (import.meta.env.DEV) this.stage.dataset.interactionEffect = JSON.stringify({
      name: active.region.name,
      elapsed: Number(elapsed.toFixed(2)),
      phrase: active.phraseIndex,
      invert: Number(this.postProcessing.gradePass.uniforms.coolerInvert.value.toFixed(3)),
      audioVolume: Number(this.audio.volume.toFixed(3)),
      audioPaused: this.audio.paused,
    });
    if (active.region.name === 'Money') this.visual.style.setProperty('--money-offset', `${Math.sin(elapsed * 15) * envelope * 4}px`);
    if (elapsed >= active.effectDuration && !active.visualEnded) {
      active.visualEnded = true;
      this.visual.classList.add('is-ending');
      this.postProcessing.setCoolerInversion(0);
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.volume = 0;
    }

    const narrationTime = elapsed - 0.15;
    if (narrationTime < 0) return;
    let boundary = 0;
    let nextIndex = content.phrases.length;
    for (let index = 0; index < active.phraseTimes.length; index += 1) {
      boundary += active.phraseTimes[index];
      if (narrationTime < boundary) { nextIndex = index; break; }
    }
    if (nextIndex !== active.phraseIndex) {
      active.phraseIndex = nextIndex;
      if (nextIndex < content.phrases.length) {
        const [korean, local] = content.phrases[nextIndex];
        const clipPrefix = active.region.name === 'Data Center' ? 'datacenter' : active.region.name.toLowerCase();
        this.caption.showOverride(korean, local, `${clipPrefix}_click_${String(nextIndex + 1).padStart(2, '0')}`);
      } else {
        this.caption.hideOverride();
        this.researchButton.hidden = active.region.name === 'Cooler';
      }
    }
    if (nextIndex === content.phrases.length && this.card.hidden) {
      active.idleAfterNarration += delta;
      if (active.region.name === 'Cooler' && active.visualEnded
        && active.idleAfterNarration > 0.5) {
        this.close();
        return;
      }
      if (active.idleAfterNarration > 12) this.close();
    }
  }

  applyCoolerCameraMotion(target) {
    const active = this.active;
    if (active?.region.name !== 'Cooler' || !active.visualStarted) return;
    const envelope = active.visualEnded ? 0 : active.coolerEnvelope ?? 0;
    const time = active.elapsed;
    const distance = this.coolerBasePosition.distanceTo(target);
    this.camera.position.copy(this.coolerBasePosition);
    this.camera.lookAt(target);
    this.coolerRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.coolerUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.coolerForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.camera.position
      .addScaledVector(this.coolerRight, Math.sin(time * 5.1) * distance * 0.055 * envelope)
      .addScaledVector(this.coolerUp, Math.sin(time * 3.8 + 0.8) * distance * 0.035 * envelope)
      .addScaledVector(this.coolerForward, Math.sin(time * 8.4) * distance * 0.045 * envelope);
    this.coolerLookTarget.copy(target)
      .addScaledVector(this.coolerRight, Math.sin(time * 4.3 + 1.1) * distance * 0.018 * envelope)
      .addScaledVector(this.coolerUp, Math.sin(time * 5.7) * distance * 0.012 * envelope);
    this.camera.lookAt(this.coolerLookTarget);
    this.camera.rotateZ((Math.sin(time * 3.5) * 0.105 + Math.sin(time * 7.1) * 0.035) * envelope);
    const zoom = active.coolerBaseZoom * (1 + envelope * (
      Math.sin(time * 6.8) * 0.17 + Math.sin(time * 2.6 + 1.2) * 0.09
    ));
    if (Math.abs(this.camera.zoom - zoom) > 0.0001) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
  }

  openResearch() {
    const active = this.active;
    if (!active || this.researchButton.hidden) return;
    const research = active.content.research;
    this.card.querySelector('.world-interaction__card-index').textContent = `RESEARCH ${research.number} / ${research.topic}`;
    this.card.querySelector('.world-interaction__card-title').textContent = research.title;
    this.card.querySelector('.world-interaction__card-fact').textContent = `FACT / ${research.fact}`;
    this.card.querySelector('.world-interaction__card-interpretation').textContent = `SIMULATION / ${research.interpretation}`;
    const source = this.card.querySelector('.world-interaction__source');
    source.href = research.sourceUrl;
    source.textContent = `${research.sourceLabel} ↗`;
    this.card.hidden = false;
  }

  closeResearch() {
    this.card.hidden = true;
    if (this.active) this.active.idleAfterNarration = 0;
  }

  close() {
    if (!this.active) return;
    this.cancel();
    this.onClose();
  }

  cancel() {
    const active = this.active;
    if (!active) return;
    for (const { mesh, original } of active.materialRestore) {
      const copies = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = original;
      for (const material of copies) material.dispose();
    }
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio.volume = 0;
    if (active.region.name === 'Cooler' && active.coolerBaseZoom) {
      this.camera.zoom = active.coolerBaseZoom;
      this.camera.updateProjectionMatrix();
    }
    this.postProcessing.setCoolerInversion(0);
    this.stage.classList.remove('interaction-caption-active');
    this.visual.replaceChildren();
    this.visual.classList.remove('is-running', 'is-ending');
    this.visual.style.removeProperty('--money-offset');
    this.caption.clearOverride();
    this.card.hidden = true;
    this.researchButton.hidden = true;
    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');
    this.active = null;
    if (import.meta.env.DEV) {
      delete this.stage.dataset.interactionQa;
      delete this.stage.dataset.interactionEffect;
    }
  }

  dispose() {
    this.cancel();
    window.removeEventListener('keydown', this.onKeyDown);
    this.audio.removeAttribute('src');
    this.audio.load();
    this.root.remove();
  }
}
