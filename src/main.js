import './style.css';
import './intro/intro.css';
import './interaction/nevada-interactions.css';
import { ExperienceController } from './app/ExperienceController.js';
import { IntroExperience } from './intro/IntroExperience.js';
import { CAPTIONS, IntroState } from './intro/config.js';

const params = new URLSearchParams(window.location.search);
if (import.meta.env.DEV && params.get('npcFaceQa') === 'N01') {
  import('./qa/N01FaceQa.js').then(({ startN01FaceQa }) => startN01FaceQa()).catch((error) => {
    console.error('[N01 Face QA] initialization failed', error);
    document.body.textContent = `N01 QA를 시작할 수 없습니다: ${error.message}`;
  });
} else if (import.meta.env.DEV && params.get('npcBatchQa') === 'nevada') {
  import('./qa/NevadaBatchFaceQa.js').then(({ startNevadaBatchFaceQa }) => startNevadaBatchFaceQa()).catch((error) => {
    console.error('[Nevada Batch Face QA] initialization failed', error);
    document.body.textContent = `Nevada Batch QA를 시작할 수 없습니다: ${error.message}`;
  });
} else {
const experience = new ExperienceController(document.querySelector('#stage'));
const worldQa = import.meta.env.DEV && (params.has('worldQa') || params.has('orbitQa')
  || params.get('nevadaNpcWalkQa') === '1' || params.get('nevadaInteractionQa') === '1'
  || params.get('moneyQa') === '1');
const introHandoffQa = import.meta.env.DEV && params.has('introHandoffQa');
const narration2Qa = import.meta.env.DEV && params.has('narration2Qa');
const introRoot = document.querySelector('#intro-root');

experience.initialize({ introMode: !worldQa }).catch((error) => {
  console.error('[ECHO] initialization failed', error);
  const status = document.querySelector('#face-status');
  if (status) status.textContent = '경험을 시작할 수 없습니다. 페이지를 새로고침해 주세요.';
});

let intro = null;
let worldAudio = null;
let developerShortcutRunning = false;
if (worldQa) {
  introRoot.hidden = true;
} else {
  intro = new IntroExperience(introRoot, {
    onCapture: (frame) => experience.processIntroCapture(frame),
    onReject: () => experience.clearIntroCapture(),
    onLoading: async (controller) => {
      await experience.enterWorldFromIntro({ applyFace: !introHandoffQa });
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      controller.audio.playNevadaEntry();
      controller.complete();
    },
  });
  worldAudio = intro.controller.audio;
  experience.onWorldHover = () => worldAudio?.playUi('uiHover');
  experience.onWorldClick = () => worldAudio?.playUi('uiClick');
  experience.onHaminaEnter = () => worldAudio?.playHaminaEntry();
  if (introHandoffQa) {
    window.setTimeout(() => intro?.controller.transition(IntroState.LOADING), 120);
  }
  if (narration2Qa) {
    window.setTimeout(() => {
      if (!intro) return;
      introRoot.querySelector('.audio-start-prompt')?.remove();
      intro.controller.view.opening.classList.add('is-hidden');
      intro.controller.transition(IntroState.NARRATION_2);
      intro.controller.view.visualLayer.startNarration2(intro.controller.audio.narration2);
      intro.controller.captions.start(intro.controller.audio.narration2, CAPTIONS.narration2);
    }, 120);
  }
}

const handleDeveloperWorldShortcut = async (event) => {
  if (!import.meta.env.DEV
    || event.code !== 'Quote'
    || event.repeat
    || event.metaKey
    || event.ctrlKey
    || event.altKey
    || event.shiftKey
    || worldQa
    || experience.worldRenderingEnabled
    || developerShortcutRunning
    || experience.developerCaptureActive
    || event.target instanceof HTMLInputElement
    || event.target instanceof HTMLTextAreaElement
    || event.target?.isContentEditable) return;

  event.preventDefault();
  developerShortcutRunning = true;
  try {
    if (intro) {
      intro.controller.audio.handoffToWorld();
      intro.destroy({ preserveMusic: true });
      intro = null;
    }
    await experience.startDeveloperPhotoRoute(() => worldAudio?.playNevadaEntry());
  } catch (error) {
    console.error('[Dev Shortcut] photo route initialization failed', error);
  } finally {
    developerShortcutRunning = false;
  }
};

if (import.meta.env.DEV) window.addEventListener('keydown', handleDeveloperWorldShortcut);

window.addEventListener('pagehide', () => {
  window.removeEventListener('keydown', handleDeveloperWorldShortcut);
  intro?.destroy();
  experience.dispose();
}, { once: true });
}
