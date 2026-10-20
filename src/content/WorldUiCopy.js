// Visitor-facing copy used by world controls and scene overlays.
// The opening/capture script remains in intro/config.js.
export const WORLD_ACTIONS = Object.freeze({
  next: '다음 좌표 탐색',
  returnToStart: 'ECHO 종료',
});

export const WORLD_CAPTIONS = Object.freeze({
  nextCoordinate: [
    '클라우드 너머 당신을 감지한\n또 다른 좌표로 이동합니다.',
    'We sensed your presence beyond the cloud.\nMoving to another coordinate.',
  ],
  nextCoordinateError: ['다음 좌표를 불러오지 못했어요.', 'Could not load the next coordinate.'],
  ritualRecognition: Object.freeze([
    ['어머니 같은 분이 오셨기에,', 'Someone like a mother has come,'],
    ['우리는 이렇게 환영합니다.', 'so this is how we welcome you.'],
    ['아버지 같은 분이 오셨기에,', 'Someone like a father has come,'],
    ['우리는 이렇게 환영합니다.', 'so this is how we welcome you.'],
    ['어머니 그리고 아버지!', 'Mother and father!'],
  ]),
  danceHover: ['그들은 기쁨의 춤을 춥니다.', 'They dance with joy.'],
  characterQuestion: Object.freeze({
    korean: '당신은 누구예요?',
    english: 'Who are you?',
    finnish: 'Kuka sinä olet?',
  }),
});

export const ARCHIVE_UI = Object.freeze({
  photoClose: '사진 닫기',
});

export const RETURN_LINES = Object.freeze([
  ['프로젝트 에코는', 'PROJECT ECHO'],
  ['당신이 업로드한 사진의 흔적을 따라', 'followed the trace of the photo you uploaded'],
  ['클라우드 너머로 향했습니다.', 'and traveled beyond the cloud.'],
  ['그 너머의 공간을 보았나요?', 'Did you see the space beyond it?'],
  ['그곳에서 마주한 것은 정말 당신이었나요?', 'Was what you encountered there really you?'],
]);

export const CURSOR_LABELS = Object.freeze({
  echo: 'PROJECT ECHO',
  character: '누구세요?',
  danceGroup: '이러한 의식',
  characterBack: '이전으로',
});

export const RESEARCH_UI = Object.freeze({
  view: '자료 보기',
  returnToWorld: '월드로 돌아가기',
  close: '자료 닫기',
  source: 'VIEW SOURCE ↗',
  index: 'RESEARCH',
  fact: 'FACT',
  simulation: 'SIMULATION',
});
