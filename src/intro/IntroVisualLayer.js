import * as THREE from 'three';
import { ASSETS, TIMING } from './config.js';
import { createIntroPostProcessing } from './VisualPostProcessing.js';
import { createOpeningEchoLayer } from './OpeningEchoLayer.js';

const NARRATION_1_PRE_BLOOM_GAIN = 1.18;
const NARRATION_1_DURATION = 16.064;

function fitTexture(texture, sourceWidth, sourceHeight, targetWidth, targetHeight, mirrorX = false) {
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;
  const visibleWidth = sourceAspect > targetAspect ? targetAspect / sourceAspect : 1;
  const visibleHeight = sourceAspect < targetAspect ? sourceAspect / targetAspect : 1;
  texture.repeat.set(mirrorX ? -visibleWidth : visibleWidth, visibleHeight);
  texture.offset.set(
    mirrorX ? (1 + visibleWidth) / 2 : (1 - visibleWidth) / 2,
    (1 - visibleHeight) / 2,
  );
  texture.needsUpdate = true;
}

function fitTextureToSquare(texture, width, height) {
  const aspect = width / height;
  const visibleWidth = aspect > 1 ? 1 / aspect : 1;
  const visibleHeight = aspect < 1 ? aspect : 1;
  texture.repeat.set(visibleWidth, visibleHeight);
  texture.offset.set((1 - visibleWidth) / 2, (1 - visibleHeight) / 2);
  texture.needsUpdate = true;
}

export function createIntroVisualLayer(root) {
  const element = document.createElement('div');
  element.className = 'intro-visual-layer';
  element.setAttribute('aria-hidden', 'true');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.className = 'intro-visual-canvas';
  element.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  camera.position.z = 1000;

  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const backdropMaterial = new THREE.MeshBasicMaterial({ color: '#000000' });
  const backdrop = new THREE.Mesh(planeGeometry, backdropMaterial);
  scene.add(backdrop);

  const mediaMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const mediaPlane = new THREE.Mesh(planeGeometry, mediaMaterial);
  mediaPlane.position.z = 0.1;
  mediaPlane.visible = false;
  scene.add(mediaPlane);

  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cubeMaterials = Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.72, metalness: 0,
  }));
  const captureCube = new THREE.Mesh(cubeGeometry, cubeMaterials);
  captureCube.position.z = 50;
  captureCube.visible = false;
  scene.add(captureCube);
  scene.add(new THREE.HemisphereLight('#ffffff', '#39445b', 1.25));
  const keyLight = new THREE.DirectionalLight('#ffffff', 2.1);
  keyLight.position.set(2.5, 3.5, 5);
  scene.add(keyLight);

  const postFX = createIntroPostProcessing(renderer, scene, camera);

  let openingEcho = createOpeningEchoLayer(element);
  const narrationVideo = document.createElement('video');
  narrationVideo.src = ASSETS.narration1Video;
  narrationVideo.preload = 'auto';
  narrationVideo.muted = true;
  narrationVideo.playsInline = true;
  const narrationTexture = new THREE.VideoTexture(narrationVideo);
  narrationTexture.colorSpace = THREE.SRGBColorSpace;
  const narration2Video = document.createElement('video');
  narration2Video.src = ASSETS.narration2Video;
  narration2Video.preload = 'auto';
  narration2Video.muted = true;
  narration2Video.playsInline = true;
  const narration2Texture = new THREE.VideoTexture(narration2Video);
  narration2Texture.colorSpace = THREE.SRGBColorSpace;

  let mode = 'opening';
  let width = 1;
  let height = 1;
  let cubeBaseSize = 1;
  let cameraTexture;
  let cameraSource;
  let captureTexture;
  let cubeTexture;
  let narrationTrack;
  let narration2Track;
  let captureToken = 0;

  const setMedia = (texture, gain = 1) => {
    mediaMaterial.map = texture;
    mediaMaterial.color.setRGB(gain, gain, gain);
    mediaMaterial.opacity = 1;
    mediaMaterial.needsUpdate = true;
    mediaPlane.visible = Boolean(texture);
  };

  const showBackdrop = (map = null, color = '#000000') => {
    backdropMaterial.map = map;
    backdropMaterial.color.set(color);
    backdropMaterial.needsUpdate = true;
  };

  const setCubeTexture = (texture) => {
    cubeTexture?.dispose();
    cubeTexture = texture.clone();
    cubeTexture.image = texture.image;
    cubeTexture.colorSpace = THREE.SRGBColorSpace;
    fitTextureToSquare(cubeTexture, texture.image.width, texture.image.height);
    cubeMaterials.forEach((material) => {
      material.map = cubeTexture;
      material.needsUpdate = true;
    });
    captureCube.visible = mode === 'narration2';
  };

  const resize = () => {
    const rect = root.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    // The source video is 4K portrait. A lower post-FX pixel ratio preserves the
    // optical character while preventing the multi-tap diffusion pass from
    // starving video decoding and audio-volume animation.
    const pixelBudgetRatio = Math.sqrt(2000000 / (width * height));
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      1.25,
      Math.max(0.5, pixelBudgetRatio),
    );
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    postFX.resize(width, height, pixelRatio);
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    backdrop.scale.set(width, height, 1);
    mediaPlane.scale.set(width, height, 1);
    cubeBaseSize = Math.min(width, height) * 0.5;
    fitTexture(narrationTexture, 2160, 3840, width, height);
    fitTexture(narration2Texture, 1080, 1920, width, height);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  resize();

  const render = () => {
    if (mode === 'narration1' && Number.isFinite(narrationVideo.duration)) {
      const duration = Number.isFinite(narrationTrack?.duration) && narrationTrack.duration > 0
        ? narrationTrack.duration : NARRATION_1_DURATION;
      narrationVideo.playbackRate = narrationVideo.duration / duration;
      if (narrationTrack && !narrationTrack.paused && narrationTrack.readyState >= 2) {
        const target = Math.min(
          narrationVideo.duration - 0.04,
          narrationTrack.currentTime * narrationVideo.duration / duration,
        );
        if (narrationVideo.readyState >= 2 && Math.abs(narrationVideo.currentTime - target) > 0.36) {
          narrationVideo.currentTime = target;
        }
      }
    }
    if (mode === 'camera' && cameraSource?.videoWidth) {
      fitTexture(cameraTexture, cameraSource.videoWidth, cameraSource.videoHeight, width, height, true);
    }
    if (mode === 'narration2') {
      const elapsed = narration2Track?.currentTime ?? 0;
      if (import.meta.env.DEV) {
        element.dataset.narration2VideoState = JSON.stringify({
          readyState: narration2Video.readyState,
          currentTime: Number(narration2Video.currentTime.toFixed(3)),
          paused: narration2Video.paused,
          seeking: narration2Video.seeking,
          width: narration2Video.videoWidth,
          height: narration2Video.videoHeight,
          mediaVisible: mediaPlane.visible,
        });
      }
      if (Number.isFinite(narration2Video.duration)) {
        const duration = Number.isFinite(narration2Track?.duration) && narration2Track.duration > 0
          ? narration2Track.duration : narration2Video.duration;
        narration2Video.playbackRate = narration2Video.duration / duration;
        if (narration2Track && !narration2Track.paused && narration2Track.readyState >= 2) {
          const target = Math.min(
            narration2Video.duration - 0.04,
            narration2Track.currentTime * narration2Video.duration / duration,
          );
          if (narration2Video.readyState >= 2
            && !narration2Video.seeking
            && Math.abs(narration2Video.currentTime - target) > 0.75) {
            narration2Video.currentTime = target;
          }
        }
      }
      if (elapsed <= TIMING.NARRATION_2_CAPTURE_CUBE_END) {
        captureCube.visible = Boolean(cubeTexture);
        const progress = THREE.MathUtils.clamp(
          (elapsed - TIMING.NARRATION_2_CUBE_RECEDE_START)
            / (TIMING.NARRATION_2_CAPTURE_CUBE_END - TIMING.NARRATION_2_CUBE_RECEDE_START),
          0,
          1,
        );
        const scale = THREE.MathUtils.lerp(1, 0.08, progress * progress);
        captureCube.scale.setScalar(cubeBaseSize * scale);
        captureCube.rotation.set(-0.24 + elapsed * 0.42, 0.55 + elapsed * 0.78, elapsed * 0.08);
      } else {
        captureCube.visible = false;
      }
    }
    postFX.render(performance.now() / 1000);
  };
  renderer.setAnimationLoop(render);

  return {
    element,
    fadeOpening() { openingEcho?.fadeOut(); },
    showBlank() {
      mode = 'blank';
      openingEcho?.dispose();
      openingEcho = null;
      narration2Video.pause();
      showBackdrop();
      mediaPlane.visible = false;
      captureCube.visible = false;
    },
    startNarration1(track) {
      mode = 'narration1';
      narrationTrack = track;
      showBackdrop();
      captureCube.visible = false;
      fitTexture(narrationTexture, 2160, 3840, width, height);
      setMedia(narrationTexture, NARRATION_1_PRE_BLOOM_GAIN);
      narrationVideo.currentTime = 0;
      narrationVideo.play().catch(() => {});
    },
    stopNarration1() {
      narrationVideo.pause();
      narrationTrack = null;
      this.showBlank();
    },
    showCamera(video) {
      mode = 'camera';
      showBackdrop();
      captureCube.visible = false;
      if (cameraSource !== video) {
        cameraTexture?.dispose();
        cameraSource = video;
        cameraTexture = new THREE.VideoTexture(video);
        cameraTexture.colorSpace = THREE.SRGBColorSpace;
      }
      setMedia(cameraTexture);
    },
    showCapture(canvas) {
      mode = 'capture';
      showBackdrop();
      captureCube.visible = false;
      const token = ++captureToken;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      if (token !== captureToken) {
        texture.dispose();
        return;
      }
      fitTexture(texture, canvas.width, canvas.height, width, height, true);
      captureTexture?.dispose();
      captureTexture = texture;
      setMedia(texture);
    },
    startNarration2(track) {
      mode = 'narration2';
      narration2Track = track;
      openingEcho?.dispose();
      openingEcho = null;
      showBackdrop();
      fitTexture(narration2Texture, 1080, 1920, width, height);
      // Do not leave the previous still capture on the full-screen media plane
      // while the first video frame is being decoded. Reveal the video texture
      // only after playback has actually started.
      mediaPlane.visible = false;
      narration2Video.pause();
      narration2Video.currentTime = 0;
      narration2Video.load();
      const revealNarration2Video = () => {
        if (mode !== 'narration2') return;
        narration2Texture.needsUpdate = true;
        setMedia(narration2Texture);
      };
      if (narration2Video.readyState >= 2) revealNarration2Video();
      else narration2Video.addEventListener('loadeddata', revealNarration2Video, { once: true });
      narration2Video.play()
        .then(revealNarration2Video)
        .catch((error) => console.error('[Intro] Narration 2 video playback failed', error));
      captureCube.scale.setScalar(cubeBaseSize);
      captureCube.rotation.set(-0.24, 0.55, 0);
      if (captureTexture?.image) setCubeTexture(captureTexture);
    },
    destroy() {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      narrationVideo.pause();
      narrationVideo.removeAttribute('src');
      narrationVideo.load();
      narration2Video.pause();
      narration2Video.removeAttribute('src');
      narration2Video.load();
      openingEcho?.dispose();
      narrationTexture.dispose();
      narration2Texture.dispose();
      cameraTexture?.dispose();
      captureTexture?.dispose();
      cubeTexture?.dispose();
      backdropMaterial.dispose();
      mediaMaterial.dispose();
      cubeMaterials.forEach((material) => material.dispose());
      cubeGeometry.dispose();
      planeGeometry.dispose();
      postFX.destroy();
      renderer.dispose();
      renderer.forceContextLoss();
      element.remove();
    },
  };
}
