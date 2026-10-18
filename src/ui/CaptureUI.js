export class CaptureUI {
  constructor(root) {
    this.root = root;
    this.video = root.querySelector('#face-camera');
    this.preview = root.querySelector('#photo-preview');
    this.status = root.querySelector('#face-status');
    this.captureButton = root.querySelector('#capture-button');
    this.previewActions = root.querySelector('#preview-actions');
    this.retakeButton = root.querySelector('#retake-button');
    this.useButton = root.querySelector('#use-button');
    this.loading = root.querySelector('#world-loading');
    this.layer = root.querySelector('#capture-layer');
  }

  bind({ onCapture, onRetake, onUse }) {
    this.onRetake = onRetake;
    this.onUse = onUse;
    this.setCaptureHandler(onCapture);
    this.retakeButton.addEventListener('click', onRetake);
    this.useButton.addEventListener('click', onUse);
  }

  setCaptureHandler(onCapture) {
    if (this.onCapture) this.captureButton.removeEventListener('click', this.onCapture);
    this.onCapture = onCapture;
    this.captureButton.addEventListener('click', onCapture);
  }

  setReady(ready) {
    this.captureButton.disabled = !ready;
  }

  setBusy(busy) {
    this.captureButton.disabled = busy;
    this.retakeButton.disabled = busy;
    this.useButton.disabled = busy;
  }

  showPreview(frame) {
    this.preview.src = frame.toDataURL('image/jpeg', 0.92);
    this.preview.hidden = false;
    this.video.hidden = true;
    this.captureButton.hidden = true;
    this.previewActions.hidden = false;
  }

  showCamera() {
    this.preview.hidden = true;
    this.preview.removeAttribute('src');
    this.video.hidden = false;
    this.captureButton.hidden = false;
    this.previewActions.hidden = true;
  }

  showLoading(show) {
    this.loading.hidden = !show;
  }

  leave() {
    this.layer.classList.add('leaving');
    window.setTimeout(() => { this.layer.hidden = true; }, 1250);
  }

  dispose() {
    this.captureButton.removeEventListener('click', this.onCapture);
    this.retakeButton.removeEventListener('click', this.onRetake);
    this.useButton.removeEventListener('click', this.onUse);
  }
}
