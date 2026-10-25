const SURFACES = Object.freeze({
  concrete: '벽 · 아치 콘크리트',
  floor: '터널 바닥',
  metal: '레일 · 브라켓 금속',
});
const MAPS = Object.freeze({
  color: 'BASE COLOR', normal: 'NORMAL', roughness: 'ROUGHNESS', height: 'HEIGHT',
});

export class KobeMaterialPanel {
  constructor(stage, world) {
    this.world = world;
    this.element = document.createElement('aside');
    this.element.className = 'kobe-material-panel';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', '고베 터널 재질 설정');
    this.element.innerHTML = `
      <button class="kobe-material-toggle" type="button" aria-expanded="false">KOBE / MATERIAL</button>
      <section class="kobe-material-drawer" aria-hidden="true">
        <header><span>WORLD 04</span><strong>PROCEDURAL TUNNEL</strong></header>
        <p>로컬 PBR 이미지는 브라우저 안에서만 적용됩니다.</p>
        <div class="kobe-material-surfaces"></div>
        <label class="kobe-tile-control"><span>반복 단위 <output>2.5 m</output></span>
          <input type="range" min="1" max="6" step="0.5" value="2.5">
        </label>
      </section>`;
    stage.append(this.element);
    const container = this.element.querySelector('.kobe-material-surfaces');
    for (const [surface, label] of Object.entries(SURFACES)) {
      const section = document.createElement('section');
      section.innerHTML = `<strong>${label}</strong><div></div>`;
      const grid = section.querySelector('div');
      for (const [kind, name] of Object.entries(MAPS)) {
        const upload = document.createElement('label');
        const bundled = kind === 'height' || surface === 'metal'
          ? '절차형 기본 재질' : '기본 PBR 적용됨';
        upload.innerHTML = `<span>${name}</span><small>${bundled}</small><input type="file" accept="image/png,image/jpeg,image/webp">`;
        const input = upload.querySelector('input');
        input.addEventListener('change', async () => {
          if (!input.files?.[0]) return;
          const status = upload.querySelector('small');
          status.textContent = '적용 중…';
          try {
            await this.world.updateMaterial(surface, kind, input.files[0]);
            status.textContent = input.files[0].name;
          } catch (error) {
            console.warn('[Kobe material] upload failed', error);
            status.textContent = '파일 오류';
          }
        });
        grid.append(upload);
      }
      container.append(section);
    }
    this.toggle = this.element.querySelector('.kobe-material-toggle');
    this.drawer = this.element.querySelector('.kobe-material-drawer');
    this.toggle.addEventListener('click', () => this.setOpen(!this.element.classList.contains('open')));
    const tile = this.element.querySelector('.kobe-tile-control input');
    const output = this.element.querySelector('.kobe-tile-control output');
    tile.value = String(world.options.tileSize);
    output.textContent = `${tile.value} m`;
    tile.addEventListener('input', () => { output.textContent = `${tile.value} m`; });
    tile.addEventListener('change', () => world.rebuild({ tileSize: Number(tile.value) }));
  }

  setOpen(open) {
    this.element.classList.toggle('open', open);
    this.toggle.setAttribute('aria-expanded', String(open));
    this.drawer.setAttribute('aria-hidden', String(!open));
  }

  setVisible(visible) {
    this.element.hidden = !visible;
    if (!visible) this.setOpen(false);
  }

  dispose() { this.element.remove(); }
}
