export const EXPERIENCE_STATES = Object.freeze({
  CAPTURE: 'CAPTURE',
  PHOTO_PREVIEW: 'PHOTO_PREVIEW',
  INTRO_FAR_ORBIT: 'INTRO_FAR_ORBIT',
  INTRO_ZOOM: 'INTRO_ZOOM',
  ECHO_ORBIT: 'ECHO_ORBIT',
  FREE_ROAM: 'FREE_ROAM',
  CHARACTER_FOCUS: 'CHARACTER_FOCUS',
  CHARACTER_SWITCH: 'CHARACTER_SWITCH',
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
  zoomDuration: 4.2,
  echoOrbitSpeed: 0.055,
  characterTransitionDuration: 0.85,
  returnDuration: 1.15,
  followSpeed: 7,
  farOrbitRadiusScale: 0.45,
  farOrbitHeightScale: 0.26,
  farOrbitBoundsClearance: 5.5,
  nearOrbitRadiusFromEcho: 4.5,
  nearOrbitHeightFromEcho: 1.15,
  portraitDistanceFromHeight: 0.94,
  freeRoamLookSpeed: 0.0025,
  freeRoamMoveSpeed: 0.012,
  freeRoamDamping: 4.2,
  freeRoamFloorClearance: 1.25,
});

export const CHARACTER_CAMERA_CONFIG = Object.freeze({
  headroomRatio: 0.1,
  verticalOffset: 0.038,
  lookTargetOffset: 0.26,
});

export const INTERACTION_CONFIG = Object.freeze({
  longPressThreshold: 350,
  clickMoveTolerance: 6,
});

export const WORLD_CONFIG = Object.freeze({
  modelUrl: '/models/Nevada.glb',
  walkableNodeNames: ['land', 'road', 'building_floor', 'garage'],
  characterCount: 15,
  maxPixelRatio: 1.4,
  maxRenderPixels: 3000000,
  background: '#83b8ee',
  fogColor: '#d4e4ef',
});

export const HAMINA_CONFIG = Object.freeze({
  modelUrl: '/models/Hamina.glb',
  walkableNodeNames: ['snow', 'snowanddirt'],
  navigationAnchorName: 'snowanddirt',
  background: '#75baf1',
  fogColor: '#e6f4fc',
  farOrbitScale: 0.8,
  nearOrbitScale: 0.9,
});

export const WORLD_JUMP_CONFIG = Object.freeze({
  overviewDuration: 2.4,
  splitDuration: 4.6,
  dissolveDuration: 1.35,
  echoHoldDuration: 0.9,
  skyDuration: 3,
  minimumLoadingHold: 2.2,
});

const terrainTexture = (folder, name, repeat, normalScale, roughnessValue, color = '#ffffff') => Object.freeze({
  baseColor: `/textures/nevada/${folder}/Nevada_Winter_${name}_BaseColor.png`,
  normal: `/textures/nevada/${folder}/Nevada_Winter_${name}_Normal.png`,
  roughness: `/textures/nevada/${folder}/Nevada_Winter_${name}_Roughness.png`,
  repeat,
  normalScale,
  roughnessValue,
  color,
});

export const TERRAIN_TEXTURE_CONFIG = Object.freeze({
  mountain: terrainTexture('mountain', 'Mountain', 9, 0.58, 0.92),
  land: terrainTexture('grass', 'Dry_Grass', 18, 0.42, 0.96),
  'building floor': terrainTexture('concrete', 'Concrete', 22, 0.32, 0.88),
  road: terrainTexture('asphalt', 'Asphalt', 26, 0.34, 0.9),
  garage: terrainTexture('gravel', 'Gravel_Dirt', 18, 0.48, 0.98, '#aaa098'),
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
  featureOpacity: 0.96,
  skinBlend: 0.56,
  toneMatch: 0.72,
  desaturation: 0.04,
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
  adaptiveFeatureStrength: 0.62,
  featureDetailStrength: 0.42,
});

export const AVAILABLE_BASES = Object.freeze(['A', 'B', 'C']);
