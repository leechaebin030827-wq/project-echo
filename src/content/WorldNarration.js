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
export const PACIFIC_ARRIVAL_NARRATION = Object.freeze([
  Object.freeze({ atMs: 0, korean: '프로젝트 에코가…', local: 'Project ECHO is…' }),
  Object.freeze({ atMs: 2600, korean: '여기가 어디죠?', local: 'Where are we?' }),
  Object.freeze({ atMs: 5400, korean: '아, 가끔 우리도 실수를 한답니다.', local: 'Ah, even we make mistakes sometimes.' }),
  Object.freeze({ atMs: 8600, korean: '길을 잃었네요.', local: 'We are lost.' }),
]);

export const PACIFIC_ARRIVAL_CLEAR_MS = 12600;

