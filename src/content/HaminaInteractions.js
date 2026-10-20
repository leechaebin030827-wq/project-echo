import { NEVADA_INTERACTIONS } from './NevadaInteractions.js';

// Hamina object copy and exhibit pacing. The shared archive uses Nevada's copy.
export const HAMINA_INTERACTIONS = Object.freeze({
  'Data Center': NEVADA_INTERACTIONS['Data Center'],
  Cooler: {
    label: 'JÄÄHDYTYS',
    hover: ['무슨 소리가 들리지 않아요?', 'Kuuletko tuon äänen?'],
    phrases: [
      ['쉬이익! 쉬이익!', 'Suhinaa! Suhinaa!'],
      ['기계가 열심히 열을 식히는 중이에요.', 'Koneet tekevät kovasti töitä poistaakseen lämpöä.'],
      ['아아, 우리의 추억은 춥네요.', 'Voi, muistomme ovat kylmiä.'],
    ],
    effectDuration: 3,
  },
  Timer: {
    label: 'AJASTIN',
    hover: ['시한폭탄? 이게 뭐예요?', 'Aikapommi? Mikä tämä on?'],
    phrases: [
      ['째깍! 째깍!', 'Tik tak! Tik tak!'],
      ['그들은 이곳의 전기를 무려', 'He ovat sopineet ostavansa tänne sähköä peräti'],
      ['22년 동안 사기로 약속했대요!', '22 vuoden ajan!'],
      ['발전소는 2050년까지', 'Voimalaitos valmistautuu'],
      ['더 일할 준비를 하고 있고요.', 'jatkamaan töitä vuoteen 2050 asti.'],
      ['그때 당신의 사진은 몇 살일까요?', 'Kuinka vanha sinun valokuvasi silloin on?'],
    ],
    effectDuration: 3,
  },
  Finland: {
    label: 'SUOMI / HAMINA',
    hover: ['수오미! 수오미!', 'Suomi! Suomi!'],
    phrases: [
      ['짜잔! 핀란드 하미나에 오신 걸 환영해요!', 'Tadaa! Tervetuloa Haminaan, Suomeen!'],
      ['바다 옆에 있는 커다란 데이터센터예요.', 'Meren rannalla on suuri datakeskus.'],
      ['여기는 원래 종이를 만들던 공장이었대요.', 'Tämä oli ennen paperitehdas.'],
      ['지금은 종이 대신 데이터를 다루죠.', 'Nyt täällä käsitellään paperin sijaan dataa.'],
      ['종이로 구름을 접어보아요.', 'Taitellaan paperista pilvi.'],
    ],
    effectDuration: 3,
  },
  Ocean: {
    label: 'MERI',
    hover: ['바다도 일을 하나요?', 'Tekeekö merikin töitä?'],
    phrases: [
      ['첨벙!', 'Loiskis!'],
      ['이 바닷물이 기계를 식혀준대요!', 'Tämä merivesi kuulemma jäähdyttää koneita!'],
      ['그런데 기계에서 나온 열은', 'Mutta koneiden tuottama lämpö'],
      ['동네 사람들의 집을 데워준대요.', 'lämmittää lähiseudun asukkaiden koteja.'],
    ],
    effectDuration: 3,
  },
  Forest: {
    label: 'METSÄ',
    hover: ['저 나무들은 무슨 생각을 할까요?', 'Mitäköhän nuo puut ajattelevat?'],
    phrases: [
      ['쉿! 숲한테는 비밀인데요.', 'Hys! Älä kerro tätä metsälle.'],
      ['그들이 이 근처 땅을 더 샀대요!', 'He ovat kuulemma ostaneet lisää maata täältä!'],
      ['구름을 더 크게 키울 생각인가 봐요.', 'Pilveä aiotaan kai kasvattaa suuremmaksi.'],
      ['그런데 나무들은 아직 모르나 봐요…', 'Mutta puut eivät taida vielä tietää siitä…'],
      ['혹시 이사해야 하면 어떡하죠?', 'Entä jos niiden täytyy muuttaa?'],
      ['앗, 나무는 걸을 수 없잖아요!', 'Ai niin, eiväthän puut osaa kävellä!'],
    ],
    effectDuration: 3,
  },
});
