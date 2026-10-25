import './style.css';
import './intro/intro.css';
import './interaction/nevada-interactions.css';
import { ExperienceController } from './app/ExperienceController.js';
import { IntroExperience } from './intro/IntroExperience.js';
import { CAPTIONS, IntroState } from './intro/config.js';
import { VintageFilmOverlay } from './ui/VintageFilmOverlay.js';

const params = new URLSearchParams(window.location.search);
new VintageFilmOverlay(document.querySelector('#stage'));
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
  || params.get('moneyQa') === '1' || params.get('dataCenterQa') === '1'
  || params.has('lightCableQa'));
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
experience.onPacificCreatureAudioChange = (active) => worldAudio?.setUnderwaterMusic(active);
let developerShortcutRunning = false;
let developerShortcutPanel = null;
let developerShortcutToggle = null;
const developerShortcuts = [
  ['`', '도움말 열기/닫기'],
  ["'", '사진 촬영 후 월드 진입'],
  ['1', 'Nevada 즉시 진입'],
  ['2', 'Hamina 즉시 진입'],
  ['3', 'Pacific 즉시 진입'],
  ['4', 'Kobe 즉시 진입'],
  ['O', '현재 육지 월드 오비트'],
  ['J', '다음 월드로 이동'],
  ['D', 'Data Center 상호작용'],
  ['M', 'Nevada Money 상호작용'],
  ['F', 'Nevada A01 얼굴 포커스'],
];

const isEditableShortcutTarget = (target) => target instanceof HTMLInputElement
  || target instanceof HTMLTextAreaElement || target?.isContentEditable;

const showDeveloperShortcutPanel = (visible) => {
  if (!developerShortcutPanel) {
    developerShortcutToggle = document.createElement('button');
    developerShortcutToggle.type = 'button';
    developerShortcutToggle.className = 'developer-shortcut-toggle';
    developerShortcutToggle.textContent = 'DEV';
    developerShortcutToggle.setAttribute('aria-label', '개발자 단축키 열기');
    developerShortcutToggle.setAttribute('aria-expanded', 'false');
    developerShortcutToggle.addEventListener('click', () => {
      showDeveloperShortcutPanel(!developerShortcutPanel.classList.contains('visible'));
    });
    developerShortcutPanel = document.createElement('aside');
    developerShortcutPanel.className = 'developer-shortcut-panel';
    developerShortcutPanel.setAttribute('aria-label', '개발자 단축키');
    developerShortcutPanel.innerHTML = `
      <header><strong>DEV SHORTCUTS</strong><span>ESC / \`</span></header>
      <dl>${developerShortcuts.map(([key, label]) => `<div><dt>${key}</dt><dd>${label}</dd></div>`).join('')}</dl>`;
    document.querySelector('#stage').append(developerShortcutToggle, developerShortcutPanel);
  }
  developerShortcutPanel.classList.toggle('visible', visible);
  developerShortcutPanel.setAttribute('aria-hidden', String(!visible));
  developerShortcutToggle.classList.toggle('active', visible);
  developerShortcutToggle.setAttribute('aria-expanded', String(visible));
  developerShortcutToggle.setAttribute('aria-label', `개발자 단축키 ${visible ? '닫기' : '열기'}`);
};

const openDeveloperPreset = (preset) => {
  const next = new URL(window.location.href);
  next.search = '';
  next.searchParams.set('worldQa', '1');
  const orders = {
    nevada: 'nevada,lightcable,hamina,kobe',
    hamina: 'hamina,lightcable,nevada,kobe',
    pacific: 'nevada,lightcable,hamina,kobe',
    kobe: 'kobe,nevada,lightcable,hamina',
  };
  next.searchParams.set('worldOrder', orders[preset.world] ?? orders.nevada);
  for (const [key, value] of Object.entries(preset.params ?? {})) {
    next.searchParams.set(key, value);
  }
  window.location.assign(next);
};
const restoreWorldMusicOnGesture = () => {
  if (!experience.worldRenderingEnabled || (intro && !intro.destroyed)) return;
  if (worldAudio?.audio.defaultBgm.paused) worldAudio.handoffToWorld();
};
window.addEventListener('pointerdown', restoreWorldMusicOnGesture, { passive: true });
if (worldQa) {
  introRoot.hidden = true;
} else {
  intro = new IntroExperience(introRoot, {
    onCapture: (frame) => experience.processIntroCapture(frame),
    onReject: () => experience.clearIntroCapture(),
    onLoading: async (controller) => {
      await experience.enterWorldFromIntro({ applyFace: !introHandoffQa });
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      controller.complete();
    },
    onComplete: () => {
      experience.showWorldEntryOverlay();
      experience.playFirstEntryOnce();
    },
  });
  worldAudio = intro.controller.audio;
  experience.onWorldHover = () => worldAudio?.playUi('uiHover');
  experience.onWorldClick = () => worldAudio?.playUi('uiClick');
  experience.onReturnTypingStart = () => worldAudio?.playTyping();
  experience.onReturnTypingEnd = () => worldAudio?.stopTyping();
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
    || event.repeat
    || event.metaKey
    || event.ctrlKey
    || event.altKey
    || isEditableShortcutTarget(event.target)) return;

  if (event.code === 'Backquote') {
    event.preventDefault();
    showDeveloperShortcutPanel(!developerShortcutPanel?.classList.contains('visible'));
    return;
  }
  if (event.code === 'Escape' && developerShortcutPanel?.classList.contains('visible')) {
    showDeveloperShortcutPanel(false);
    return;
  }

  const preset = {
    Digit1: { world: 'nevada', params: { orbitQa: '1' } },
    Digit2: { world: 'hamina', params: { orbitQa: '1' } },
    Digit3: { world: 'pacific', params: { lightCableQa: '1' } },
    Digit4: { world: 'kobe', params: { orbitQa: '1' } },
    KeyO: { world: experience.currentWorld === 'hamina' ? 'hamina' : 'nevada', params: { orbitQa: '1' } },
    KeyD: { world: experience.currentWorld === 'hamina' ? 'hamina' : 'nevada', params: { dataCenterQa: '1' } },
    KeyM: { world: 'nevada', params: { moneyQa: '1' } },
    KeyF: { world: 'nevada', params: { orbitQa: '1', focusQa: 'A01' } },
  }[event.code];
  if (preset) {
    event.preventDefault();
    openDeveloperPreset(preset);
    return;
  }

  if (event.code === 'KeyJ' && experience.worldRenderingEnabled) {
    event.preventDefault();
    if (!experience.worldTransitioning) void experience.startNextWorld();
    return;
  }

  if (event.code !== 'Quote'
    || event.shiftKey
    || worldQa
    || experience.worldRenderingEnabled
    || developerShortcutRunning
    || experience.developerCaptureActive) return;

  event.preventDefault();
  developerShortcutRunning = true;
  try {
    if (intro) {
      intro.controller.audio.handoffToWorld();
      intro.destroy({ preserveMusic: true });
      intro = null;
    }
    await experience.startDeveloperPhotoRoute(() => {});
  } catch (error) {
    console.error('[Dev Shortcut] photo route initialization failed', error);
  } finally {
    developerShortcutRunning = false;
  }
};

if (import.meta.env.DEV) {
  showDeveloperShortcutPanel(false);
  window.addEventListener('keydown', handleDeveloperWorldShortcut);
}

window.addEventListener('pagehide', () => {
  window.removeEventListener('keydown', handleDeveloperWorldShortcut);
  window.removeEventListener('pointerdown', restoreWorldMusicOnGesture);
  intro?.destroy();
  experience.dispose();
}, { once: true });
}
