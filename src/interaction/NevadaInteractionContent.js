// Caption pacing is independent of the removed Nevada dialogue recordings.
export const captionDurationSeconds = (korean) =>
  Math.min(4.1, Math.max(1.75, 1.05 + [...korean].length * 0.105));

export const NEVADA_INTERACTIONS = Object.freeze({
  'Data Center': {
    label: 'COPY / MULTIPLICATION',
    phrases: [
      ['걱정마요. 당신이 클라우드에 전송한 사진은', "Don't worry. The photo you sent to the cloud"],
      ['잘 보관되고 있어요.', 'is being kept safe.'],
      ['네~ 복사본 또 만들었어요. 봤죠?', 'Yep~ I made another copy. See?'],
    ],
    effectDuration: 4.4,
    research: {
      number: '00', topic: 'REPLICATION', title: 'WHO KEEPS A COPY?',
      fact: '클라우드 스토리지는 내구성과 가용성을 위해 데이터를 여러 가용 영역이나 지역에 복제할 수 있습니다.',
      interpretation: '관람객 사진의 화면 속 복제는 예술적 재구성입니다. 실제 Switch 시설에서 관람객 사진이 복제된다는 뜻은 아닙니다.',
      sourceLabel: 'GOOGLE CLOUD / LOCATIONS & REPLICATION',
      sourceUrl: 'https://docs.cloud.google.com/storage/docs/locations',
    },
  },
  Cooler: {
    label: 'COOLING / INFRASTRUCTURE',
    phrases: [
      ['쉬이익! 쉬이익!', 'Whoosh! Whoosh!'],
      ['기계가 열을 식히는 중이에요.', 'The machines are cooling off the heat.'],
      ['아아, 우리의 추억은 춥네요.', 'Ah, our memories are cold.'],
    ],
    effectDuration: 5.2,
    research: {
      number: '04', topic: 'COOLING', title: 'WHAT KEEPS IT RUNNING?',
      fact: '데이터센터 서버는 연산과 저장 작업 중 열을 발생시키며 안정적인 운영을 위해 냉각 설비가 필요합니다.',
      interpretation: '화면 반전과 커지는 냉각기 소리는 작품의 시청각 연출이며 실제 냉각 현상이 아닙니다.',
      sourceLabel: 'SWITCH / TSC COOLING',
      sourceUrl: 'https://www.switch.com/switch-tsc-1000/',
    },
  },
  Billboard: {
    label: 'SOLD! / OWNERSHIP',
    phrases: [
      ['딩동댕!', 'Ding-dong!'],
      ['투자자들이 이곳을 인수 완료했대요', 'The investors have finished buying this place.'],
      ['그게 무슨 뜻이냐면요', 'And what that means is...'],
      ['우리의 주인이 바뀌었다는 거에요', 'our owners have changed.'],
      ['영원한 주인은 없는걸까요..', 'Maybe no owner stays forever...'],
    ],
    effectDuration: 3.4,
    research: {
      number: '01', topic: 'OWNERSHIP', title: 'WHO OWNS THE INFRASTRUCTURE?',
      fact: '2022년 12월 6일 DigitalBridge와 IFM Investors 관련 투자 주체들이 Switch 인수를 완료했습니다. 거래 규모는 부채 상환을 포함해 약 110억 달러였습니다.',
      interpretation: 'ECHO의 “우리의 주인”은 공간을 의인화한 표현입니다. 기업 인수가 고객 데이터의 소유권 이전을 의미하지는 않습니다.',
      sourceLabel: 'DIGITALBRIDGE / SWITCH ACQUISITION',
      sourceUrl: 'https://www.digitalbridge.com/news/2022-12-06-digitalbridge-and-ifm-investors-complete-11-billion-take-private-of-switch',
    },
  },
  Money: {
    label: 'POWER / IMPACT FEE',
    phrases: [
      ['전기 공급 전환 비용이', 'The cost of switching power suppliers was'],
      ['무려 2,700만 달러!', 'a whopping $27 million!'],
      ['이 돈이 없었다면', 'Without this money,'],
      ['우리도 없어요', 'we would not be here.'],
      ['우리는 돈! 돈은 우리!', 'We are money! Money is us!'],
    ],
    effectDuration: 3.6,
    research: {
      number: '05', topic: 'POWER', title: 'THE COST OF KEEPING THINGS',
      fact: 'Switch는 2017년 네바다에서 전력 구매 방식을 변경하며 NV Energy에 전환 비용 2,700만 달러를 일시 지급했습니다. 이는 전체 전기요금이나 파일 저장 비용이 아닙니다.',
      interpretation: '돈뭉치는 인프라의 경제적 조건을 보여주는 연출입니다. ECHO의 발언은 비용과 데이터의 존재를 과장해 연결한 표현입니다.',
      sourceLabel: 'SEC / SWITCH 2017 FORM 10-K',
      sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1710583/000171058318000034/swch12311710-k.htm',
    },
  },
  Flag: {
    label: 'NEVADA / UNITED STATES',
    phrases: [
      ['짜잔! 미국 네바다주에 오신 걸 환영해요!', 'Ta-da! Welcome to Nevada, USA!'],
      ['사막 한가운데 아주 커다란 데이터센터가 있죠.', 'There is a huge data center in the middle of the desert.'],
      ['이곳에서는 수많은 서버가', 'Here, countless servers'],
      ['밤낮없이 열심히 일하고 있답니다.', 'work hard day and night.'],
      ['전기도 먹고, 열도 내뿜고요!', 'They use electricity and give off heat, too!'],
      ['구름이라더니, 꽤 묵직하죠?', 'For a cloud, it is pretty heavy, right?'],
      ['자, 당신의 흔적도 한번 찾아볼까요?', 'Now, shall we look for your trace?'],
    ],
    effectDuration: 4.5,
    research: {
      number: '03', topic: 'LOCATION', title: 'WHERE IS THE CLOUD?',
      fact: '네바다의 데이터센터 캠퍼스는 대규모 서버와 전력·냉각 인프라에 기반하며, 북부 네바다와 라스베이거스의 캠퍼스는 장거리 전용 광섬유망으로 연결됩니다.',
      interpretation: '미국 국기는 현재 탐색 공간의 지리적 위치를 소개하는 작품 속 장치입니다.',
      sourceLabel: 'SWITCH / TAHOE RENO',
      sourceUrl: 'https://www.switch.com/tahoe-reno/',
    },
  },
});
