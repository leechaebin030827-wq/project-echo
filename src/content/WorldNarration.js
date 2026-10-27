export const INTERACTIVE_QUESTIONS = Object.freeze({
  'Data Center': {
    korean: '이곳에는 무엇이 있을까요?',
    english: 'What could be in here?',
  },
  Billboard: {
    korean: '이곳에도 주인이 있나요?',
    english: 'Does this place have an owner too?',
  },
  Flag: {
    korean: '아메리카! 아메리카!',
    english: 'America! America!',
  },
  Cooler: {
    korean: '무슨 소리가 들리지 않아요?',
    english: 'Do you hear something?',
  },
  Money: {
    korean: '이곳에 무언가 어마어마한 게 있나요?',
    english: 'Is there something enormous here?',
  },
});

export const DANCE_NARRATION = Object.freeze([
  ['당신은 나의 어머니, 나는 당신의 일부!', 'You are my mother, and I am a part of you!'],
  ['우리는 서로를 알아본 기쁨에 춤춥니다.', 'We dance for the joy of recognizing each other.'],
]);

export const HAMINA_DANCE_NARRATION = Object.freeze([
  ['당신은 나의 어머니, 나는 당신의 일부!', 'Sinä olet äitini, ja minä olen osa sinua!'],
  ['우리는 서로를 알아본 기쁨에 춤춥니다.', 'Tanssimme, koska olemme iloisia tunnistaessamme toisemme.'],
]);

export const CHARACTER_DIALOGUE = Object.freeze([
  [
    ['나는 이곳이 좋아요.', 'I like it here.'],
    ['어떻게 오게 된 건지는 모르겠지만요.', "I don't know how I got here, though."],
    ['누군가 나를 여기 맡겨둔 모양이에요.', 'It seems someone left me here.'],
  ],
  [
    ['구름 보러 오셨어요?', 'Did you come to see the clouds?'],
    ['여기선 가끔 구름이', 'Sometimes, the clouds here'],
    ['사람 얼굴을 하고 지나가요.', 'drift by with human faces.'],
    ['비는 안 오고요. 좀 이상하죠?', "But it never rains. Isn't that strange?"],
  ],
  [
    ['아까 저랑 똑같이 생긴 사람을 봤어요.', 'I saw someone who looked exactly like me.'],
    ['저를 보더니 ‘늦었네’ 하더라고요.', 'They looked at me and said, “You’re late.”'],
    ['근데 누가 먼저 온 건지는', 'But who got here first'],
    ['아직도 잘 모르겠어요.', "is something I still don't know."],
  ],
]);

export const HAMINA_CHARACTER_DIALOGUE = Object.freeze([
  [
    ['나는 이곳이 좋아요.', 'Pidän tästä paikasta.'],
    ['어떻게 오게 된 건지는 모르겠지만요.', 'En tosin tiedä, miten jouduin tänne.'],
    ['누군가 나를 여기 맡겨둔 모양이에요.', 'Joku taisi jättää minut tänne.'],
  ],
  [
    ['구름 보러 오셨어요?', 'Tulitko katsomaan pilviä?'],
    ['여기선 가끔 구름이', 'Täällä pilvet kulkevat joskus'],
    ['사람 얼굴을 하고 지나가요.', 'ohi ihmiskasvoisina.'],
    ['비는 안 오고요. 좀 이상하죠?', 'Mutta koskaan ei sada. Outoa, vai mitä?'],
  ],
  [
    ['아까 저랑 똑같이 생긴 사람을 봤어요.', 'Näin äsken jonkun, joka näytti aivan minulta.'],
    ['저를 보더니 ‘늦었네’ 하더라고요.', 'Hän katsoi minua ja sanoi: ”Olet myöhässä.”'],
    ['근데 누가 먼저 온 건지는', 'Mutta en vieläkään tiedä,'],
    ['아직도 잘 모르겠어요.', 'kumpi meistä tuli ensin.'],
  ],
]);

// Caption text is separate from the timed transition in ExperienceController.
export const PACIFIC_NARRATION_START_MS = 4100;
export const KOBE_ENTRY_FOLLOWUP = Object.freeze([
  Object.freeze({
    cueId: 'K17',
    korean: '어라? 잠시만요. 스미마셍.',
    local: 'あれ？ ちょっと待ってください。すみません。',
  }),
  Object.freeze({
    cueId: 'K18',
    korean: '우리가 조금 일찍 도착했나 봐요.',
    local: '私たち、少し早く着いてしまったみたいです。',
  }),
  Object.freeze({
    cueId: 'K19',
    korean: '여긴 원래 흙을 옮기던 길이래요.',
    local: 'ここはもともと、土砂を運んでいた道だそうです。',
  }),
  Object.freeze({
    cueId: 'K20',
    korean: '이제 이곳에 데이터센터가 들어설 거래요!',
    local: 'これからここに、データセンターが造られるそうです！',
  }),
]);

export const KOBE_TUNNEL_NARRATION = Object.freeze([
  Object.freeze({
    atMs: 0,
    cueId: 'JP-T01',
    korean: '제가 한번 들어가볼게요.',
    local: 'ちょっと中に入ってみますね。',
  }),
  Object.freeze({
    atMs: 8900,
    cueId: 'JP-T02',
    korean: '제가 본 건…',
    local: '私が見たものは……',
  }),
  Object.freeze({
    atMs: 10500,
    cueId: 'JP-T03',
    korean: '아무것도 없어요.',
    local: '何もありません。',
  }),
  Object.freeze({
    atMs: 11950,
    cueId: 'JP-T04',
    korean: '비어 있네요.',
    local: '空っぽですね。',
  }),
  Object.freeze({
    atMs: 13200,
    cueId: 'JP-T05',
    korean: '마치 무언가 들어올 것처럼.',
    local: 'まるで、何かが入ってくるのを待っているみたいです。',
  }),
]);

export const KOBE_TUNNEL_ENTRY_CAPTION_CLEAR_MS = 2700;
export const KOBE_TUNNEL_NARRATION_CLEAR_MS = 17450;

export const PACIFIC_ARRIVAL_NARRATION = Object.freeze([
  Object.freeze({ atMs: 0, korean: '프로젝트 에코가…', local: 'Project ECHO is…' }),
  Object.freeze({ atMs: 2600, korean: '여기가 어디죠?', local: 'Where are we?' }),
  Object.freeze({ atMs: 5400, korean: '아, 가끔 우리도 실수를 한답니다.', local: 'Ah, even we make mistakes sometimes.' }),
  Object.freeze({ atMs: 8600, korean: '길을 잃었네요.', local: 'We are lost.' }),
]);

export const PACIFIC_ARRIVAL_CLEAR_MS = 9950;
export const PACIFIC_CABLE_SECRET = '이곳은 클라우드 너머로 가기 위한 비밀 통로에요.';
export const PACIFIC_FISH_HOVER = '뻐끔 뻐끔 누구냐 너는!';
export const PACIFIC_PARTICLE_HOVER = '빠르게 움직이는 이것들은?';
export const PACIFIC_PARTICLE_PHOTO = '데이터들이 이동중인거같네요.';

