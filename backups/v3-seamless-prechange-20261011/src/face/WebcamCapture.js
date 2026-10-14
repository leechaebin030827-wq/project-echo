export class WebcamCapture {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.generation = 0;
  }

  async start() {
    this.stop();
    const token = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 1200 }, facingMode: 'user' },
      audio: false,
    });
    if (token !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
  }

  capture() {
    if (!this.stream || this.video.readyState < 2) {
      throw new Error('카메라가 준비될 때까지 잠시 기다려 주세요.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    canvas.getContext('2d').drawImage(this.video, 0, 0);
    return canvas;
  }

  stop() {
    this.generation += 1;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
}
