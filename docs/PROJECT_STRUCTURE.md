# PROJECT ECHO 파일 지도

## 공통 연출을 수정할 때

| 바꾸려는 것 | 기준 파일 |
|---|---|
| 월드 방문 순서 | `src/app/WorldRoute.js` |
| 월드 진입 지명·기본 자막·날씨 표기 | `src/content/WorldPresentation.js` |
| 인물·의식 대사와 태평양 진입 자막 | `src/content/WorldNarration.js` |
| 네바다·하미나 오브젝트 대사와 자료 카드 | `src/content/NevadaInteractions.js`, `HaminaInteractions.js` |
| 이동 메뉴·귀환·사진 보관함·커서 문구 | `src/content/WorldUiCopy.js` |
| 공통 육상 도착 설정 | `src/app/ExperienceController.js`의 `configureLandPresentation()` |
| 육상/태평양 간 전환 단계와 나레이션 시점 | `src/app/ExperienceController.js` |
| 기본 카메라 상태·인물 포커스 | `src/camera/CinematicCameraController.js` |
| 상호작용별 카메라 샷 | `src/camera/InteractiveCameraShots.js` |
| ECHO 모델·월드 이동 | `src/world/shared/EchoModel.js`, `EchoTravelAnimator.js` |
| 하늘·대기·날씨 | `src/world/shared/SkyDetail.js`, `Atmosphere.js`, `WeatherParticles.js` |
| CRT·색보정·후처리 | `src/world/shared/PostProcessing.js` |
| PS1 정수격자 버텍스 효과 | `src/world/shared/Ps1VertexSnap.js` |
| 인터랙션 연출 | `src/interaction/WorldInteractionExperience.js` |

## 월드별 파일

- `src/world/nevada/NevadaWorld.js`와 `NevadaGrass.js`: Nevada 월드 로딩·지형.
- `src/world/hamina/HaminaWorld.js`, `HaminaSea.js`, `HaminaForest.js`, `HaminaLandInstances.js`, `HaminaCountdownDisplay.js`: Hamina 월드와 지역별 요소.
- `src/world/pacific/LightCableWorld.js`, `GlassCableModule.js`, `EndlessCablePath.js`, `SeabedSurface.js`, `CableExitMotion.js`: 태평양 수면, 심해, 생성형 유리 케이블, 무한 이동과 출구 연출. GLB에서는 물고기·식물·해저 지형을 사용하며 케이블 메시는 코드에서 생성합니다.

`src/world/shared/`에는 둘 이상의 월드에서 쓰는 기능만 둡니다. 전용 기능이 공통 기능이 되면 그때 shared로 옮깁니다. 파일 이름은 `World`, `Camera`, `Caption`, `Motion`, `Surface`처럼 역할이 드러나게 유지합니다.

## 상태와 에셋

- `src/config.js`: 카메라·상호작용·얼굴 처리 등 수치와 상태 상수.
- `src/main.js`: 인트로와 월드 런타임을 연결하는 진입점.
- `public/models/`, `public/textures/`, `public/audio/`: 런타임 정적 에셋. 경로를 옮길 때 로더 URL도 함께 확인합니다.
- `tests/`: 순수 계산과 일부 상호작용 로직 검증. 월드 파일 이동 시 상대 import 경로를 함께 고칩니다.

`PROJECT_CONTEXT_FOR_CHATGPT.md`는 2026-10-11 당시 흐름을 기록한 과거 인수인계 문서입니다. 현재 파일 위치와 세 월드 구성은 이 문서와 실제 소스가 기준입니다.
