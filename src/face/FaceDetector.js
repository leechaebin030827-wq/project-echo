import { FaceLandmarker, ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';

export class FaceDetector {
  async initialize() {
    if (this.landmarker) return;
    this.loading ??= (async () => {
      this.files = await FilesetResolver.forVisionTasks('/vendor/mediapipe');
      this.landmarker = await FaceLandmarker.createFromOptions(this.files, {
        baseOptions: { modelAssetPath: '/vendor/mediapipe/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
      });
    })();
    await this.loading;
  }

  detect(image) {
    const points = this.landmarker.detect(image).faceLandmarks[0];
    if (!points) return { state: 'FACE_DETECTION_FAILED', points: null };
    const valid = points.length >= 468
      && points.every((point) => Number.isFinite(point.x + point.y))
      && points[152].y > points[1].y;
    return { state: valid ? 'FACE_DETECTION_VALID' : 'FACE_DETECTION_UNCERTAIN', points };
  }

  async segment(image) {
    await this.initialize();
    this.segmenter ??= await ImageSegmenter.createFromOptions(this.files, {
      baseOptions: { modelAssetPath: '/vendor/mediapipe/selfie_multiclass.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    const result = this.segmenter.segment(image);
    const mask = {
      data: result.categoryMask.getAsUint8Array().slice(),
      width: result.categoryMask.width,
      height: result.categoryMask.height,
    };
    result.close();
    return mask;
  }

  dispose() {
    this.landmarker?.close();
    this.segmenter?.close();
    this.landmarker = null;
    this.segmenter = null;
  }
}
