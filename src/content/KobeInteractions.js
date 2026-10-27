const KOBE_ARCHIVE_HOVER = Object.freeze([
  '벽화? 여기 무언가 그려져 있어요.',
  '壁画？ ここに何かが描かれています。',
]);

export const KOBE_ARCHIVE_INTERACTIONS = Object.freeze({
  'Tunnel Archive 01': Object.freeze({
    world: 'kobe',
    label: '흑의 길에서 데이터의 길로',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['여긴 원래 흙이 지나가던 길이래요!', 'ここはもともと、土砂が通っていた道なんです！'],
      ['이젠 데이터를 위한 공간이 될 거래요.', 'これからは、データのための空間になるそうです。'],
      ['터널도 직업을 바꾸는군요!', 'トンネルも転職するんですね！'],
      ['저보다 부지런한데요?', '私より働き者ですね？'],
    ],
    effectDuration: 2,
  }),
  'Tunnel Archive 02': Object.freeze({
    world: 'kobe',
    label: '옛 터널 재활용 계획',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['오호! 터널 재활용 계획서네요.', 'おお！トンネル再活用の計画書ですね。'],
      ['재활용이라면 병이나 캔인 줄 알았는데…', '再活用というと、瓶や缶のことかと思っていましたが……'],
      ['터널도 재활용하는군요!', 'トンネルも再活用するんですね！'],
      ['아주 큰 분리수거네요!', 'とても大きな分別回収ですね！'],
    ],
    effectDuration: 2,
  }),
  'Tunnel Archive 03': Object.freeze({
    world: 'kobe',
    label: '2005년 9월, 토사 운반 종료',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['2005년 9월, 흑 나르는 일 종료!', '2005年9月、土砂を運ぶ仕事は終了！'],
      ['40년도 넘게 일했대요.', '40年以上も働いたそうです。'],
      ['이제 푹 쉬나 했더니…', 'やっとゆっくり休めるのかと思ったら……'],
      ['또 출근할 예정이네요!', 'また出勤する予定なんですね！'],
    ],
    effectDuration: 2,
  }),
  'Tunnel Archive 04': Object.freeze({
    world: 'kobe',
    label: '2026년 데이터센터 개발 발표',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['속보입니다! 속보!', '速報です！速報！'],
      ['이곳에 데이터센터를 만들겠다고, 2026년 10월 6일에 발표했대요!', 'ここにデータセンターを造ると、2026年10月6日に発表したそうです！'],
      ['그런데 컴퓨터들은 아직 출근 전인가 봐요.', 'でも、コンピューターたちはまだ出勤前みたいですね。'],
    ],
    effectDuration: 2,
  }),
  'Tunnel Archive 05': Object.freeze({
    world: 'kobe',
    label: '지하 온도 15~20°C',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['어? 여긴 일 년 내내 15도에서 20도 사이래요!', 'あれ？ここは一年中、15度から20度の間だそうです！'],
      ['컴퓨터들이 좋아할 만하네요.', 'コンピューターたちが喜びそうですね。'],
      ['저는 겉옷부터 챙길게요.', '私はまず上着を用意します。'],
      ['으으!', 'ぶるぶる！'],
    ],
    effectDuration: 2,
  }),
  'Tunnel Archive 06': Object.freeze({
    world: 'kobe',
    label: '2027년 말 운영 시작 예정',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['2027년 말에 문을 열 예정이래요!', '2027年末にオープンする予定だそうです！'],
      ['어쩐지 아무도 없더라니.', 'どうりで誰もいないわけですね。'],
      ['우리 꽤 일찍 와버렸네요.', '私たち、ずいぶん早く来てしまいましたね。'],
      ['허허. 기다리는 건 자신 있는데요!', 'ほほう。待つことには自信があります！'],
    ],
    effectDuration: 2,
  }),
  'Tunnel Archive 07': Object.freeze({
    world: 'kobe',
    label: '14.5km 중 약 3km 재활용',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['이 터널이 14.5킬로미터나 된대요!', 'このトンネルは、14.5キロメートルもあるそうです！'],
      ['그중 3킬로미터를 데이터센터로 사용할 계획이래요.', 'そのうち3キロメートルを、データセンターとして使う計画だそうです。'],
      ['나머지는요?', '残りは？'],
      ['음… 저도 궁금해요!', 'うーん……私も気になります！'],
    ],
    effectDuration: 2,
  }),
  'Tunnel Archive 08': Object.freeze({
    world: 'kobe',
    label: '관계자 외 출입 금지',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['앗! 관계자 외 출입 금지!', 'あっ！工事関係者以外、立入禁止！'],
      ['우리가 관계자였던가요?', '私たちは関係者でしたっけ？'],
      ['어… 저는 안내 담당인데요.', 'ええと……私は案内係なんですけど。'],
      ['출입증은 없어요! 허허.', '入構証は持っていません！ほほ。'],
    ],
    effectDuration: 2,
  }),
  'Tunnel Archive 09': Object.freeze({
    world: 'kobe',
    label: '터널의 새로운 역할',
    hover: KOBE_ARCHIVE_HOVER,
    phrases: [
      ['흑을 옮기던 곳이 이제는 데이터를 위한 시설이 된대요.', '土砂を運んでいた場所が、今度はデータのための施設になるそうです。'],
      ['이 터널은 두 번째 삶을 준비 중이군요!', 'このトンネルは、第二の人生を準備しているんですね！'],
      ['당신도 나중에 다시 와볼래요?', 'あなたもいつか、また来てみませんか？'],
    ],
    effectDuration: 2,
  }),
});
