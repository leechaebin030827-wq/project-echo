import { FaceDetector } from './FaceDetector.js';
import { FaceTextureGenerator } from './FaceTextureGenerator.js';
import { FaceShapeEstimator } from './FaceShapeEstimator.js';
import { WebcamCapture } from './WebcamCapture.js';
import { FACE_IDENTITY_CONFIG } from '../config.js';

export class FaceCaptureController {
  constructor({ video, status }) {
    this.video = video;
    this.statusElement = status;
    this.detector = new FaceDetector();
    this.webcam = new WebcamCapture(video);
    this.generator = null;
    this.estimator = new FaceShapeEstimator();
    this.canonical = null;
    this.session = null;
    this.appliedCharacters = new Set();
    this.busy = false;
  }

  status(message) {
    if (this.statusElement) this.statusElement.textContent = message;
  }

  async initialize() {
    this.status('얼굴 인식 모델을 준비하고 있습니다');
    await this.detector.initialize();
    if (!this.generator) {
      this.canonical = await fetch('/face/canonical.json').then((response) => response.json());
      this.generator = new FaceTextureGenerator(this.canonical);
    }
  }

  async start() {
    await Promise.all([this.initialize(), this.webcam.start()]);
    this.video.hidden = false;
    this.status('정면을 바라보고 촬영해 주세요');
  }

  async capture() {
    if (this.busy) return null;
    const frame = this.webcam.capture();
    return this.processFrame(frame);
  }

  async processFrame(frame) {
    if (this.busy) return null;
    this.busy = true;
    try {
      this.status('얼굴을 확인하고 있습니다');
      await this.initialize();
      const detection = this.detector.detect(frame);
      if (detection.state !== 'FACE_DETECTION_VALID') {
        frame.width = 0;
        frame.height = 0;
        throw new Error('정면 얼굴이 선명하게 보이도록 다시 촬영해 주세요');
      }
      this.clearSession();
      const shapeProfile = this.estimator.estimate(detection.points, frame.width, frame.height);
      this.session = { frame, points: detection.points, segmentation: null, shapeProfile };
      console.info('[Face] capture valid', {
        shapeQuality: Number(shapeProfile.quality.toFixed(3)),
        shapeValid: shapeProfile.valid,
      });
      this.status('이 사진을 사용할까요?');
      return this.session;
    } finally {
      this.busy = false;
    }
  }

  async applyToCharacters(characters) {
    if (!this.session) throw new Error('촬영된 사진이 없습니다.');
    let applied = 0;
    let morphed = 0;
    const generatedByBaseImage = new Map();
    const identityOptions = this.resolveIdentityOptions();
    for (const character of characters.filter(Boolean)) {
      const baseImage = character.faceController?.baseImage;
      if (!baseImage) continue;
      let template = generatedByBaseImage.get(baseImage);
      if (!template) {
        template = this.generator.generate(
          this.session.frame,
          this.session.points,
          this.session.segmentation,
          baseImage,
          {
            featureEnhancementEnabled: identityOptions.featureEnhancementEnabled,
            featureDetailStrength: FACE_IDENTITY_CONFIG.featureDetailStrength,
          },
        );
        generatedByBaseImage.set(baseImage, template);
      }
      const texture = template.clone();
      texture.image = template.image;
      texture.needsUpdate = true;
      character.setFaceTexture(texture);
      if (identityOptions.geometryMorphEnabled) {
        const result = character.applyFaceShape(this.session.shapeProfile, this.canonical);
        if (result.applied) morphed += 1;
      } else character.resetFaceShape();
      this.appliedCharacters.add(character);
      applied += 1;
      if (applied % 3 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    for (const template of generatedByBaseImage.values()) template.dispose();
    console.info(`[Face] applied to ${applied} characters; geometry morphed: ${morphed}`, {
      mode: identityOptions.mode,
      profile: this.session.shapeProfile,
    });
    this.status(`${applied}명의 얼굴이 연결되었습니다`);
    return applied;
  }

  resolveIdentityOptions() {
    const requested = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('faceIdentity')
      : null;
    if (requested === 'baseline') {
      return { mode: requested, featureEnhancementEnabled: false, geometryMorphEnabled: false };
    }
    if (requested === 'feature') {
      return { mode: requested, featureEnhancementEnabled: true, geometryMorphEnabled: false };
    }
    return {
      mode: requested === 'geometry' ? requested : 'default',
      featureEnhancementEnabled: FACE_IDENTITY_CONFIG.featureEnhancementEnabled,
      geometryMorphEnabled: FACE_IDENTITY_CONFIG.geometryMorphEnabled,
    };
  }

  clearSession() {
    if (this.session) {
      this.session.frame.width = 0;
      this.session.frame.height = 0;
    }
    this.session = null;
    for (const character of this.appliedCharacters) character.resetFaceIdentity();
    this.appliedCharacters.clear();
  }

  stop() {
    this.webcam.stop();
    this.video.hidden = true;
  }

  dispose() {
    this.stop();
    this.clearSession();
    this.detector.dispose();
    this.generator = null;
    this.canonical = null;
  }
}
