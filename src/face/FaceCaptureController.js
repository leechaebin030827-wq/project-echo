import { FaceDetector } from './FaceDetector.js';
import { FaceTextureGenerator } from './FaceTextureGenerator.js';
import { FaceShapeEstimator } from './FaceShapeEstimator.js';
import {
  VisitorFaceReconstruction,
  inspectReconstructionGeometry,
} from './VisitorFaceReconstruction.js';
import { WebcamCapture } from './WebcamCapture.js';
import { FACE_IDENTITY_CONFIG, FACE_RECONSTRUCTION_V3_CONFIG } from '../config.js';

export class FaceCaptureController {
  constructor({ video, status }) {
    this.video = video;
    this.statusElement = status;
    this.detector = new FaceDetector();
    this.webcam = new WebcamCapture(video);
    this.generator = null;
    this.reconstructor = null;
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
      this.reconstructor = new VisitorFaceReconstruction(this.canonical);
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
    const diagnosticsByBase = new Map();
    const identityOptions = this.resolveIdentityOptions();
    if (identityOptions.reconstructionV3Enabled) {
      return this.applyReconstructionV3(characters, identityOptions);
    }
    for (const character of characters.filter(Boolean)) {
      const baseImage = character.faceController?.baseImage;
      if (!baseImage) continue;
      let morphResult = null;
      // The Nevada N-series face/head meshes do not share the seam topology
      // required by the A/B/C geometry morph. Keep their visitor identity in
      // the face texture without pulling the mesh apart at the jaw and ears.
      if (identityOptions.geometryMorphEnabled && !character.nevadaNpc) {
        morphResult = character.applyFaceShape(this.session.shapeProfile, this.canonical, {
          silhouetteMorphEnabled: identityOptions.silhouetteMorphEnabled,
          debugMode: identityOptions.debugMode,
          legacyMode: identityOptions.legacyMode,
          geometryStrength: identityOptions.legacyMode ? 0.72 : FACE_IDENTITY_CONFIG.geometryStrength,
          maximumHorizontalDisplacement: identityOptions.legacyMode
            ? 0.075
            : FACE_IDENTITY_CONFIG.maximumHorizontalDisplacement,
          maximumVerticalDisplacement: identityOptions.legacyMode
            ? 0.055
            : FACE_IDENTITY_CONFIG.maximumVerticalDisplacement,
        });
        if (morphResult.applied) morphed += 1;
        if (!diagnosticsByBase.has(character.baseId)) {
          diagnosticsByBase.set(character.baseId, morphResult);
        }
      } else character.resetFaceShape();
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
            adaptiveFeatureMappingEnabled: identityOptions.adaptiveFeatureMappingEnabled,
            adaptiveFeatureStrength: FACE_IDENTITY_CONFIG.adaptiveFeatureStrength,
            deformationParameters: morphResult?.parameters ?? null,
          },
        );
        generatedByBaseImage.set(baseImage, template);
      }
      const texture = template.clone();
      texture.image = template.image;
      texture.needsUpdate = true;
      character.setFaceTexture(texture);
      this.appliedCharacters.add(character);
      applied += 1;
      if (applied % 3 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    for (const template of generatedByBaseImage.values()) template.dispose();
    console.info(`[Face] applied to ${applied} characters; geometry morphed: ${morphed}`, {
      mode: identityOptions.mode,
      profile: this.session.shapeProfile,
      diagnostics: Object.fromEntries(diagnosticsByBase),
    });
    if (import.meta.env.DEV) {
      window.__ECHO_FACE_IDENTITY__ = {
        mode: identityOptions.mode,
        profile: this.session.shapeProfile,
        diagnostics: Object.fromEntries(diagnosticsByBase),
      };
    }
    this.status(`${applied}명의 얼굴이 연결되었습니다`);
    return applied;
  }

  applyReconstructionV3(characters, identityOptions) {
    const target = characters.find((character) => (
      character?.id === FACE_RECONSTRUCTION_V3_CONFIG.targetCharacterId
      && character.baseId === 'A'
    ));
    const baseImage = target?.faceController?.baseImage;
    if (!target || !baseImage || !this.reconstructor) {
      console.warn('[Face V3] A01 reconstruction target is unavailable');
      this.status('V3 얼굴 재구성 대상을 찾을 수 없습니다');
      return 0;
    }
    target.resetFaceIdentity();
    const result = this.reconstructor.reconstruct(
      this.session.frame,
      this.session.points,
      baseImage,
      identityOptions.reconstructionOptions,
    );
    const legacyComparison = identityOptions.reconstructionCompareEnabled
      ? this.reconstructor.reconstruct(
        this.session.frame,
        this.session.points,
        baseImage,
        { seamlessIntegrationEnabled: false, debugOutputsEnabled: true },
      )
      : null;
    const geometry = inspectReconstructionGeometry(target);
    const diagnostics = {
      mode: identityOptions.mode,
      targetCharacterId: target.id,
      reconstruction: result.diagnostics,
      geometry,
      comparison: legacyComparison?.applied ? {
        legacy: legacyComparison.diagnostics,
        seamless: result.diagnostics,
      } : null,
    };
    if (!result.applied) {
      console.warn('[Face V3] reconstruction quality gate rejected capture', diagnostics);
      window.__ECHO_FACE_RECONSTRUCTION_V3__ = diagnostics;
      this.status('V3 재구성 품질이 부족합니다. 정면에서 다시 촬영해 주세요');
      return 0;
    }
    target.setFaceTexture(result.texture);
    this.appliedCharacters.add(target);
    window.__ECHO_FACE_RECONSTRUCTION_V3__ = diagnostics;
    if (result.debugOutputs) {
      window.__ECHO_FACE_RECONSTRUCTION_V3_DEBUG__ = result.debugOutputs;
    } else {
      delete window.__ECHO_FACE_RECONSTRUCTION_V3_DEBUG__;
    }
    if (legacyComparison?.applied) {
      window.__ECHO_FACE_RECONSTRUCTION_V3_COMPARE__ = {
        legacy: {
          diagnostics: legacyComparison.diagnostics,
          final: legacyComparison.debugOutputs?.final ?? null,
        },
        seamless: {
          diagnostics: result.diagnostics,
          final: result.debugOutputs?.final ?? null,
        },
      };
      legacyComparison.texture.dispose();
    } else {
      delete window.__ECHO_FACE_RECONSTRUCTION_V3_COMPARE__;
    }
    console.info('[Face V3] reconstruction applied to A01 only', diagnostics);
    this.status('V3 얼굴 재구성이 A01에만 연결되었습니다');
    return 1;
  }

  resolveIdentityOptions() {
    const requested = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('faceIdentity')
      : null;
    const debugMode = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get('faceMorphDebug')
      : null;
    if (requested === 'reconstructionV3') {
      const params = new URLSearchParams(window.location.search);
      return {
        mode: requested,
        reconstructionV3Enabled: true,
        reconstructionOptions: {
          seamlessIntegrationEnabled: params.get('faceReconstructionCompare') === '1'
            || params.get('faceReconstructionPipeline') !== 'legacy',
          debugOutputsEnabled: params.get('faceReconstructionDebug') === '1'
            || params.get('faceReconstructionCompare') === '1',
        },
        reconstructionCompareEnabled: params.get('faceReconstructionCompare') === '1',
        featureEnhancementEnabled: false,
        geometryMorphEnabled: false,
        silhouetteMorphEnabled: false,
        adaptiveFeatureMappingEnabled: false,
        debugMode: null,
      };
    }
    if (requested === 'baseline') {
      return {
        mode: requested,
        featureEnhancementEnabled: false,
        geometryMorphEnabled: false,
        silhouetteMorphEnabled: false,
        adaptiveFeatureMappingEnabled: false,
        debugMode: null,
      };
    }
    if (requested === 'feature') {
      return {
        mode: requested,
        featureEnhancementEnabled: true,
        geometryMorphEnabled: false,
        silhouetteMorphEnabled: false,
        adaptiveFeatureMappingEnabled: false,
        debugMode: null,
      };
    }
    const legacyGeometry = requested === 'geometryV1';
    return {
      mode: legacyGeometry ? requested : requested === 'geometry' ? requested : 'default',
      reconstructionV3Enabled: false,
      featureEnhancementEnabled: FACE_IDENTITY_CONFIG.featureEnhancementEnabled,
      geometryMorphEnabled: FACE_IDENTITY_CONFIG.geometryMorphEnabled,
      silhouetteMorphEnabled: legacyGeometry ? false : FACE_IDENTITY_CONFIG.silhouetteMorphEnabled,
      adaptiveFeatureMappingEnabled: legacyGeometry
        ? false
        : FACE_IDENTITY_CONFIG.adaptiveFeatureMappingEnabled,
      debugMode: ['wireframe', 'heatmap'].includes(debugMode) ? debugMode : null,
      legacyMode: legacyGeometry,
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
    if (import.meta.env.DEV) {
      delete window.__ECHO_FACE_RECONSTRUCTION_V3__;
      delete window.__ECHO_FACE_RECONSTRUCTION_V3_DEBUG__;
      delete window.__ECHO_FACE_RECONSTRUCTION_V3_COMPARE__;
    }
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
    this.reconstructor = null;
    this.canonical = null;
  }
}
