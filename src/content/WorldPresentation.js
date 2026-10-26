// Text and atmosphere metadata shared by entry overlays, captions and world setup.
// Route order and transition timing live in WorldRoute and ExperienceController.
export const WORLD_ENTRY_COPY = Object.freeze([
  '프로젝트 에코가 클라우드 너머에서',
  '당신의 흔적을 감지한 곳입니다.',
]);

export const WORLD_PRESENTATION = Object.freeze({
  nevada: Object.freeze({
    entryWords: Object.freeze([
      Object.freeze({ text: 'NEVADA,', className: 'world-entry-word--nevada' }),
      Object.freeze({ text: 'USA', className: 'world-entry-word--usa' }),
    ]),
    weather: 'dust',
    defaultCaption: Object.freeze({
      korean: '클라우드 너머, 이곳에서 당신을 목격했어요.',
      local: 'Beyond the cloud, I saw you here.',
    }),
  }),
  hamina: Object.freeze({
    entryWords: Object.freeze([
      Object.freeze({ text: 'HAMINA,', className: 'world-entry-word--hamina' }),
      Object.freeze({ text: 'Finland', className: 'world-entry-word--finland' }),
    ]),
    weather: 'snow',
    defaultCaption: Object.freeze({
      korean: '클라우드 너머, 이곳에서 당신을 목격했어요.',
      local: 'Pilven tuolla puolen näin sinut täällä.',
    }),
  }),
  lightcable: Object.freeze({
    entryWords: Object.freeze([
      Object.freeze({ text: 'PACIFIC', className: 'world-entry-word--nevada' }),
      Object.freeze({ text: 'OCEAN', className: 'world-entry-word--usa' }),
    ]),
    weather: 'plankton',
    defaultCaption: Object.freeze({
      korean: '클라우드 너머, 이곳에서 당신을 목격했어요.',
      local: 'Beyond the cloud, I saw you here.',
    }),
  }),
  kobe: Object.freeze({
    entryWords: Object.freeze([
      Object.freeze({ text: 'KOBE,', className: 'world-entry-word--nevada' }),
      Object.freeze({ text: 'JAPAN', className: 'world-entry-word--usa' }),
    ]),
    weather: 'none',
    defaultCaption: Object.freeze({
      korean: '흐르는 바닥을 거슬러, 에코가 자신의 자리로 돌아옵니다.',
      local: 'Against the moving floor, ECHO returns to its axis.',
    }),
  }),
});
