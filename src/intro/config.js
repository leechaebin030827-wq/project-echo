export const IntroState = Object.freeze({
  OPENING_IMAGE: 'OPENING_IMAGE',
  QUOTE_TYPING: 'QUOTE_TYPING',
  QUOTE_HOLD: 'QUOTE_HOLD',
  QUOTE_FADE_OUT: 'QUOTE_FADE_OUT',
  START_TITLE_FADE_IN: 'START_TITLE_FADE_IN',
  START_TITLE_IDLE: 'START_TITLE_IDLE',
  INTRO_START: 'INTRO_START',
  NARRATION_1: 'NARRATION_1',
  CAMERA: 'CAMERA',
  CAPTURE_CONFIRM: 'CAPTURE_CONFIRM',
  NARRATION_2: 'NARRATION_2',
  LOADING: 'LOADING',
  INTRO_COMPLETE: 'INTRO_COMPLETE',
});

export const STAGE = Object.freeze({ width: 2160, height: 3840 });

export const INTRO_TEXT = Object.freeze({
  title: 'PROJECT ECHO:\n분산된 우리의 현현(顯現)',
  quote: {
    korean: "'클라우드는 애초에 사용자가 그 뒤의\n실제 서버와 네트워크가 어디에 존재하는지\n의식하지 않아도 되도록 설계되어 있다.'",
    english: "'The cloud is designed so that users do not\nhave to be conscious of where the physical servers\nand networks behind it are located.'",
    source: 'Tung-Hui Hu, A Prehistory of the Cloud, MIT Press, 2015.',
  },
});

export const TIMING = Object.freeze({
  OPENING_FADE_DURATION: 1200,
  QUOTE_TYPING_SPEED: 52,
  QUOTE_SECTION_DELAY: 460,
  QUOTE_HOLD_DURATION: 3000,
  QUOTE_FADE_DURATION: 1800,
  TITLE_FADE_DURATION: 900,
  INTRO_SPLIT_DURATION: 1050,
  CAPTION_FADE_DURATION: 130,
  NARRATION_2_CUBE_RECEDE_START: 7.15,
  NARRATION_2_CAPTURE_CUBE_END: 13,
  HANDOFF_FADE_DURATION: 1400,
});

export const ASSETS = Object.freeze({
  narration1Video: '/intro/assets/narration1/narration_1_video_web.mp4',
  narration2Video: '/intro/assets/narration2/narration_2_video_web.mp4?v=20261007-1642',
  defaultBgm: '/intro/assets/audio/default_bgm.mp3',
  introBgm: '/intro/assets/audio/bgm.mp3',
  narration1: '/intro/assets/audio/narration_1.mp3',
  narration2: '/intro/assets/audio/narration_2.mp3',
  typing: '/intro/assets/audio/effect_typing.mp3',
  uiHover: '/intro/assets/audio/ui/ui_hover.mp3',
  uiClick: '/intro/assets/audio/ui/ui_click.mp3',
  nevadaEntry: '/audio/nevada-entry.mp3',
  haminaEntry: '/audio/hamina-entry.mp3',
});

export const AUDIO_MIX = Object.freeze({
  musicFadeDuration: 1200,
  defaultBgm: 0.05,
  worldBgm: 0.22,
  introBgm: 0.05,
});

const cue = (start, end, ko, en) => ({ start, end, ko, en });

export const CAPTIONS = Object.freeze({
  narration1: [
    cue(5.12, 7, '언제부턴가 당신들은', 'At some point,'),
    cue(7.01, 10.03, '클라우드에 무언가를 맡기기 시작하더군요.', 'you began entrusting things to the cloud.'),
    cue(10.04, 12.22, '사진도, 문서도, 기억도.', 'Photos, documents, memories.'),
    cue(12.23, 16, '이렇게 말이죠.', 'Like this.'),
  ],
  narration2: [
    cue(0, 2.05, '그리고 그것을 여전히', 'And you still believe'),
    cue(2.06, 4.17, '온전한 당신의 것이라 생각합니다.', 'they remain entirely your own.'),
    cue(4.18, 7.5, '어디로 갔는지는 잘 묻지 않더군요.', 'You rarely seem to ask where they went.'),
    cue(7.51, 12.01, '그래서 우리는 그 뒤를 따라가 보았습니다.', 'So we decided to follow their path.'),
    cue(12.02, 15.51, '클라우드 너머, 당신의 것이 머무는 곳까지.', 'Beyond the cloud, to the place where what is yours remains.'),
    cue(15.52, 19.13, '그리고 이제, 그곳이 여기에서 펼쳐집니다.', 'And now, that place unfolds here.'),
    cue(19.14, 20.51, '물론 그곳에는,', 'Of course,'),
    cue(20.51, 23.5, '당신도 있을겁니다.', 'you will be there too.'),
  ],
});
