export class VintageFilmOverlay {
  constructor(stage) {
    this.root = document.createElement('div');
    this.root.className = 'vintage-film-overlay';
    this.root.setAttribute('aria-hidden', 'true');
    const grain = document.createElement('span');
    grain.className = 'vintage-film-overlay__grain';
    this.root.append(grain);
    stage.append(this.root);
  }

  dispose() {
    this.root.remove();
  }
}
