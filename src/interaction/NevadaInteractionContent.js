export const NEVADA_INTERACTIONS = Object.freeze({
  'Data Center': {
    label: 'COPY / MULTIPLICATION',
    phrases: [
      ['유후! 당신이 계속 늘어나네요.', 'Yoo-hoo! There are more and more of you.'],
      ['하나, 둘, 셋…', 'One, two, three...'],
      ['벌써 셀 수도 없겠어요.', 'There are already too many to count.'],
      ['원본은 대체 어느 쪽이죠?', 'Which one is the original?'],
      ['아무튼, 지금 요청하신 대로', 'Anyway, just as you requested,'],
      ['잘 진행되고 있어요.', 'everything is going well.'],
    ],
    effectDuration: 4.4,
    research: {
      number: '00', topic: 'IDENTITY', title: 'WHO KEEPS A COPY?',
      fact: '데이터센터는 정보를 보관·처리하는 물리적 시설입니다.',
      interpretation: '화면의 사진 복제는 예술적 시뮬레이션입니다. 관람객 사진이 Switch 시설에 저장되거나 복제된다는 뜻이 아닙니다.',
      sourceLabel: 'SWITCH / TAHOE RENO',
      sourceUrl: 'https://www.switch.com/tahoe-reno/',
    },
  },
  Cooler: {
    label: 'COOLING / INFRASTRUCTURE',
    phrases: [
      ['쉬이익! 기계가 식히는 중이에요.', 'Whoosh! The machines are cooling things down.'],
      ['아아, 우리의 추억은 춥네요.', 'Ah, our memories are cold.'],
    ],
    effectDuration: 5.2,
    research: {
      number: '04', topic: 'COOLING', title: 'WHAT KEEPS IT RUNNING?',
      fact: 'Switch는 데이터센터 냉각을 위한 HVAC 시스템을 소개합니다.',
      interpretation: '화면 반전과 팬 소리는 냉각의 노동을 표현한 연출입니다. 실제 시설에서 이런 시각 현상이 일어난다는 뜻이 아닙니다.',
      sourceLabel: 'SWITCH / TSC COOLING',
      sourceUrl: 'https://www.switch.com/switch-tsc-1000/',
    },
  },
  Billboard: {
    label: 'SOLD! / OWNERSHIP',
    phrases: [
      ['딩동댕!', 'Ding-ding-ding!'],
      ['데이터센터 회사가 팔렸대요.', 'The data center company was sold.'],
      ['무슨 소리냐고요?', 'What does that mean?'],
      ['걱정 마요. 아직은 괜찮아요.', "Don't worry. You're fine for now."],
    ],
    effectDuration: 3.4,
    research: {
      number: '01', topic: 'OWNERSHIP', title: 'WHO OWNS THE INFRASTRUCTURE?',
      fact: '2022년 12월 6일 DigitalBridge와 IFM Investors의 Switch 인수가 완료됐습니다. 발표된 약 110억 달러에는 미상환 부채 상환이 포함됩니다.',
      interpretation: '인프라 기업의 소유권 변화와 관람객 사진 또는 개별 파일의 권리는 다른 문제입니다.',
      sourceLabel: 'SEC / 2022-12-06 PRESS RELEASE',
      sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1710583/000119312522298966/d356989dex991.htm',
    },
  },
  Money: {
    label: 'POWER / IMPACT FEE',
    phrases: [
      ['전기 공급 전환 비용이', 'The power supply switch cost'],
      ['무려 2,700만 달러!', 'a whopping $27 million!'],
      ['전기도 이사비가 드네요.', 'Even electricity has a moving fee.'],
      ['그것도 한 번에!', 'And it is paid all at once!'],
    ],
    effectDuration: 3.6,
    research: {
      number: '05', topic: 'POWER', title: 'THE COST OF KEEPING THINGS',
      fact: 'Switch는 2017년 5월 31일 NV Energy에 2,700만 달러의 impact fee를 일시불로 지급했습니다. 월간 전기요금이 아닌 전력 공급 방식 전환 관련 비용입니다.',
      interpretation: '돈뭉치의 움직임은 전력 인프라 비용을 드러내기 위한 연출입니다.',
      sourceLabel: 'SEC / SWITCH 2017 FORM 10-K',
      sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1710583/000171058318000034/swch12311710-k.htm',
    },
  },
  Cable: {
    label: 'DISTANCE / DISTRIBUTION',
    phrases: [
      ['슈우웅! 이걸 타고', 'Whoosh! Ride this'],
      ['또 다른 곳으로 갈 수 있대요.', 'and you can reach another place.'],
      ['라스베이거스에서 리노까지,', 'From Las Vegas to Reno,'],
      ['500마일이 넘어요.', 'it is more than 500 miles.'],
      ['당신도요?', 'You too?'],
      ['그건 케이블도 몰라요! 하하.', "Even the cable doesn't know! Ha ha."],
    ],
    effectDuration: 4.5,
    research: {
      number: '03', topic: 'DISTRIBUTION', title: 'ONE FILE, MULTIPLE PLACES?',
      fact: 'Switch는 Las Vegas와 Tahoe Reno의 캠퍼스가 SUPERLOOP으로 연결되고 500마일 넘게 떨어져 있다고 설명합니다.',
      interpretation: '화면의 선은 개념적 연결 도식이며 실제 케이블 경로가 아닙니다. 관람객 사진이 해당 네트워크를 통과한다는 뜻도 아닙니다.',
      sourceLabel: 'SWITCH / SUPERLOOP',
      sourceUrl: 'https://www.switch.com/switch-superloop/',
    },
  },
});
