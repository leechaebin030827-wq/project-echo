import { NEVADA_INTERACTIONS } from './interaction/NevadaInteractionContent.js';

export const EXPERIENCE_STATES = Object.freeze({
  CAPTURE: 'CAPTURE',
  PHOTO_PREVIEW: 'PHOTO_PREVIEW',
  INTRO_FAR_ORBIT: 'INTRO_FAR_ORBIT',
  INTRO_ZOOM: 'INTRO_ZOOM',
  ECHO_ORBIT: 'ECHO_ORBIT',
  ECHO_RITUAL_SPIN: 'ECHO_RITUAL_SPIN',
  FREE_ROAM: 'FREE_ROAM',
  CHARACTER_FOCUS: 'CHARACTER_FOCUS',
  CHARACTER_SWITCH: 'CHARACTER_SWITCH',
  GROUP_DANCE_FOCUS: 'GROUP_DANCE_FOCUS',
  INTERACTIVE_OBJECT_FOCUS: 'INTERACTIVE_OBJECT_FOCUS',
  INTERACTIVE_OBJECT_RETURN: 'INTERACTIVE_OBJECT_RETURN',
  RETURN_TO_ECHO: 'RETURN_TO_ECHO',
  WORLD_JUMP_PREP: 'WORLD_JUMP_PREP',
  WORLD_JUMP_SPLIT: 'WORLD_JUMP_SPLIT',
  WORLD_JUMP_ECHO: 'WORLD_JUMP_ECHO',
  WORLD_JUMP_SKY: 'WORLD_JUMP_SKY',
  WORLD_LOADING: 'WORLD_LOADING',
  HAMINA_ARRIVAL: 'HAMINA_ARRIVAL',
});

export const CAMERA_CONFIG = Object.freeze({
  introOrbitDuration: 10,
  zoomDuration: 2.8,
  echoOrbitSpeed: 0.105,
  characterTransitionDuration: 0.85,
  returnDuration: 1.15,
  followSpeed: 7,
  farOrbitRadiusScale: 0.45,
  farOrbitHeightScale: 0.3,
  farOrbitBoundsClearance: 6.5,
  nevadaIntroRadius: 26,
  nevadaIntroHeightFromNear: 1.5,
  nevadaNearOrbitRadius: 23,
  nevadaNearOrbitHeightOffset: 2.2,
  nevadaOrbitTargetHeightRatio: 0.19,
  // Exact shared entry/orbit distance for Nevada and Hamina.
  nearOrbitRadius: 17.5,
  nearOrbitRadiusFromEcho: 3.03,
  nearOrbitHeightFromEcho: 1.185,
  nearOrbitMinimumRadius: 11.3,
  nearOrbitHeightOffset: -0.15,
  portraitDistanceFromHeight: 1.06,
  freeRoamLookSpeed: 0.0025,
  freeRoamMoveSpeed: 0.012,
  freeRoamDamping: 4.2,
  freeRoamFloorClearance: 1.25,
});

export const CHARACTER_CAMERA_CONFIG = Object.freeze({
  headroomRatio: 0.1,
  verticalOffset: 0.038,
  lookTargetOffset: 0.1,
});

export const INTERACTION_CONFIG = Object.freeze({
  longPressThreshold: 350,
  clickMoveTolerance: 6,
});

export const WORLD_CONFIG = Object.freeze({
  modelUrl: '/models/Nevada.glb',
  walkableNodeNames: ['land', 'road', 'building_floor', 'garage'],
  characterCount: 15,
  maxPixelRatio: 1.75,
  maxRenderPixels: 3200000,
  background: '#83b8ee',
  fogColor: '#d4e4ef',
});

export const ECHO_RIG_URL = '/models/EchoMeshyRig.glb';
export const ECHO_TRAVEL_RIG_URL = '/models/EchoTravelRig.runtime.glb';

export const HAMINA_CONFIG = Object.freeze({
  modelUrl: '/models/Hamina1018.runtime.glb',
  walkableNodeNames: ['Main_Base'],
  navigationAnchorName: 'Main_Base',
  background: '#75baf1',
  fogColor: '#e6f4fc',
  farOrbitScale: 0.8,
  nearOrbitScale: 0.9,
  // Korean exhibition script and Finnish subtitle for each Hamina object.
  interactions: Object.freeze({
    'Data Center': NEVADA_INTERACTIONS['Data Center'],
    Cooler: {
      label: 'JÄÄHDYTYS',
      hover: ['무슨 소리가 들리지 않아요?', 'Kuuletko tuon äänen?'],
      phrases: [
        ['쉬이익! 쉬이익!', 'Suhinaa! Suhinaa!'],
        ['기계가 열을 식히는 중이에요.', 'Koneet poistavat lämpöä.'],
        ['아아, 우리의 추억은 춥네요.', 'Voi, muistomme ovat kylmiä.'],
      ],
      effectDuration: 3,
    },
    Timer: {
      label: 'AJASTIN',
      hover: ['시간이 얼마나 남았을까요?', 'Kuinka paljon aikaa on jäljellä?'],
      phrases: [
        ['째깍! 째깍!', 'Tik tak! Tik tak!'],
        ['이곳은 전기를 무려 22년 동안', 'Täällä on kuulemma sovittu sähkön ostamisesta'],
        ['사기로 약속했대요!', 'peräti 22 vuodeksi!'],
        ['발전소는 2050년까지', 'Voimalaitos valmistautuu'],
        ['더 일할 준비를 하고 있고요.', 'jatkamaan töitä vuoteen 2050 asti.'],
        ['그때 당신의 사진은 몇 살일까요?', 'Kuinka vanha sinun valokuvasi silloin on?'],
        ['우와, 오래 사는 것도 참 바쁘네요!', 'Vau, pitkäikäisenäkin saa olla kiireinen!'],
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
        ['종이에서 구름으로!', 'Paperista pilveen!'],
        ['그런데 왜 이렇게 네모난 구름뿐일까요?', 'Mutta miksi kaikki pilvet ovat täällä niin neliskanttisia?'],
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
        ['어라? 차가웠다가, 뜨거웠다가…', 'Häh? Ensin kylmää, sitten kuumaa…'],
        ['이 동네는 참 바쁘네요!', 'Tässä kaupungissa riittää touhua!'],
      ],
      effectDuration: 3,
    },
    Forest: {
      label: 'METSÄ',
      hover: ['저 나무들은 무슨 생각을 할까요?', 'Mitäköhän nuo puut ajattelevat?'],
      phrases: [
        ['쉿! 숲한테는 비밀인데요.', 'Hys! Älä kerro tätä metsälle.'],
        ['이 근처 땅을 더 샀대요!', 'Lähistöltä on kuulemma ostettu lisää maata!'],
        ['구름을 더 크게 키울 생각인가 봐요.', 'Pilveä aiotaan kai kasvattaa suuremmaksi.'],
        ['그런데 나무들은 아직 모르나 봐요.', 'Mutta puut eivät taida vielä tietää siitä.'],
        ['혹시 이사해야 하면 어떡하죠?', 'Entä jos niiden täytyy muuttaa?'],
        ['앗, 나무는 걸을 수 없잖아요!', 'Ai niin, eiväthän puut osaa kävellä!'],
      ],
      effectDuration: 3,
    },
  }),
});

export const WORLD_JUMP_CONFIG = Object.freeze({
  focusDuration: 0.65,
  crouchDuration: 0.95,
  launchDuration: 3.6,
  spinDuration: 2.2,
  arrivalDuration: 6.5,
});

const terrainTexture = (
  folder,
  name,
  repeat,
  normalScale,
  roughnessValue,
  color = '#ffffff',
  triplanarScale,
) => Object.freeze({
  baseColor: `/textures/nevada/${folder}/Nevada_Winter_${name}_BaseColor.png`,
  normal: `/textures/nevada/${folder}/Nevada_Winter_${name}_Normal.png`,
  roughness: `/textures/nevada/${folder}/Nevada_Winter_${name}_Roughness.png`,
  repeat,
  triplanarScale,
  normalScale,
  roughnessValue,
  color,
});

export const TERRAIN_TEXTURE_CONFIG = Object.freeze({
  mountain: terrainTexture('mountain', 'Mountain', 9, 0.58, 0.94, '#bea397'),
  land: terrainTexture('grass', 'Dry_Grass', 18, 0.42, 0.96),
  'building floor': terrainTexture('concrete', 'Concrete', 22, 0.32, 0.88),
  road: terrainTexture('asphalt', 'Asphalt', 26, 0.34, 0.9),
  garage: terrainTexture('gravel', 'Gravel_Dirt', 18, 0.48, 0.98, '#8d9190', 0.1),
});

const haminaTerrainTexture = (
  folder,
  name,
  triplanarScale,
  normalScale,
  roughnessValue,
  color = '#ffffff',
  snowBlend = 0,
) => Object.freeze({
  baseColor: `/textures/hamina/${folder}/Hamina_${name}_BaseColor.png`,
  normal: `/textures/hamina/${folder}/Hamina_${name}_Normal.png`,
  roughness: `/textures/hamina/${folder}/Hamina_${name}_Roughness.png`,
  repeat: 1,
  triplanarScale,
  normalScale,
  roughnessValue,
  color,
  snowBlend,
});

export const HAMINA_TERRAIN_TEXTURE_CONFIG = Object.freeze({
  snow: haminaTerrainTexture('snow', 'Snow', 0.2, 0.28, 0.86, '#f4f8fb'),
  snowanddirt: haminaTerrainTexture('snow-dirt', 'Snow_Dirt', 0.22, 0.38, 0.91, '#e2e8eb', 0.72),
  water: haminaTerrainTexture('water', 'Cold_Water', 0.13, 0.18, 0.36, '#9bcde5', 0.08),
  Snow_Rock_A: haminaTerrainTexture('snowy-rock', 'Snowy_Rock', 0.17, 0.44, 0.9, '#e3eaee', 0.62),
  Snow_Rock_B: haminaTerrainTexture('snowy-rock', 'Snowy_Rock', 0.17, 0.44, 0.9, '#e3eaee', 0.62),
});

export const FACE_SETTINGS = Object.freeze({
  resolution: 768,
  featureOpacity: 0.99,
  skinBlend: 0.68,
  toneMatch: 0.85,
  desaturation: 0.01,
  quantization: 256,
  contrast: 1.04,
  sourceBlur: 0.12,
  blur: 0.18,
});

// Developer comparison modes can be selected with
// ?faceIdentity=baseline|feature|geometry. These flags do not add visitor UI.
export const FACE_IDENTITY_CONFIG = Object.freeze({
  geometryMorphEnabled: true,
  featureEnhancementEnabled: true,
  silhouetteMorphEnabled: true,
  adaptiveFeatureMappingEnabled: true,
  minimumProfileQuality: 0.58,
  geometryStrength: 0.9,
  maximumHorizontalDisplacement: 0.11,
  maximumVerticalDisplacement: 0.08,
  seamFadeUv: 0.055,
  contourPropagationBandUv: 0.065,
  headPropagationRadiusScale: 0.165,
  silhouettePropagationStrength: 0.86,
  minimumHeadWeight: 0.46,
  seamMatchTolerance: 0.00002,
  adaptiveFeatureStrength: 0.72,
  featureDetailStrength: 0.65,
});

// V3 is an isolated developer experiment. It is never selected by the normal
// exhibition flow and initially targets one A-base character only.
export const FACE_RECONSTRUCTION_V3_CONFIG = Object.freeze({
  enabled: false,
  targetCharacterId: 'A01',
  minimumQuality: 0.62,
  resolution: 768,
  landmarkPreservation: 0.52,
  contourPreservation: 0.14,
  skinOpacity: 0.58,
  featureOpacity: 0.97,
  contourFeather: 0.052,
  toneMatch: 0.68,
  detailStrength: 0.48,
  seamlessIntegrationEnabled: true,
  coverageRepairPixels: 1,
  atlasPaddingPixels: 6,
  surfaceBlurPixels: 1.35,
  surfaceContinuity: 0.28,
  foreheadContinuity: 0.36,
  jawContinuity: 0.34,
  hairlineFeatherBoost: 0.42,
  jawFeatherBoost: 0.34,
  boundaryToneContinuity: 0.46,
  featureHighPassStrength: 0.34,
  darkSpeckleThreshold: 52,
  darkSpeckleRepair: 0.38,
});

export const AVAILABLE_BASES = Object.freeze(['A', 'B', 'C']);
export const NEVADA_NPC_IDS = Object.freeze([
  'N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07', 'N08', 'N09', 'N10',
  'N11', 'N12', 'N13', 'N14', 'N15',
]);
