# PROJECT ECHO: 분산된 데이터들의 현현
## Technical Handoff Document for ChatGPT

- 문서 목적: 프로젝트 원본 소스코드를 직접 열람하지 않는 AI 개발 파트너가 현재 시스템을 이해하고, 새로운 인터랙션·애니메이션·UI·3D 연출을 설계할 수 있도록 하는 기술 인수인계 문서
- 분석 기준: 2026-10-11 현재 프로젝트 루트의 실제 소스
- 분석 대상: `src/`, `index.html`, `package.json`, `README.md`, 런타임 에셋 경로
- 제외 대상: `node_modules/`, `dist/`, `package-lock.json`의 의존성 내부 구현, 자동 생성 산출물
- 문서 원칙: 확인된 코드와 식별자만 기술하며, 코드에 없는 기능은 구현된 것으로 가정하지 않는다.

---

## Quick Context

### 프로젝트 전체 구조

이 프로젝트는 별도 프레임워크 없이 Vite가 제공하는 ES module 엔트리포인트에서 `Three.js` 기반 3D 경험과 DOM/CSS 기반 인트로 UI를 함께 실행하는 세로형 웹 전시다.

```text
index.html
└─ src/main.js
   ├─ IntroExperience                    # DOM 기반 인트로 상태 머신
   │  ├─ AudioController
   │  ├─ IntroVisualLayer                # 인트로 전용 Three.js 캔버스
   │  ├─ OpeningEchoLayer                # 오프닝 Echo 캐릭터 연출
   │  └─ VisualPostProcessing            # 인트로 전용 EffectComposer
   └─ ExperienceController               # 실제 3D 월드 전체 오케스트레이터
      ├─ NevadaWorld / HaminaWorld
      ├─ CharacterManager
      ├─ CinematicCameraController
      ├─ PointerInteractionController
      ├─ FaceCaptureController
      ├─ Atmosphere / WeatherParticles
      ├─ PostProcessing
      └─ CaptureUI / EchoProximityCaption / InteractionCursor
```

### 가장 중요한 파일 10개

| 파일 | 역할 | 새 인터랙션과의 관계 |
|---|---|---|
| `src/main.js` | 런타임 초기화, 인트로와 월드 연결 | 전체 시퀀스의 진입/핸드오프 수정 시 확인 |
| `src/app/ExperienceController.js` | 월드·얼굴·카메라·UI·전환의 상위 조정자 | 월드 인터랙션 대부분의 1차 수정 지점 |
| `src/config.js` | 월드/카메라/입력/상태/얼굴 설정 | 상태나 수치 추가 시 우선 확인 |
| `src/camera/CinematicCameraController.js` | 카메라 상태 머신과 연출 전환 | 새 카메라 연출 또는 상태 추가 시 핵심 |
| `src/intro/IntroExperience.js` | 오프닝부터 얼굴 동의까지 인트로 상태 머신 | 인트로 인터랙션·타이밍 수정 시 핵심 |
| `src/interaction/PointerInteractionController.js` | 포인터 클릭·롱프레스·드래그 해석 | 기존 마우스/터치 입력 확장 시 핵심 |
| `src/characters/CharacterManager.js` / `CharacterEntity.js` | 캐릭터 스폰·상태·업데이트·포커스 | 캐릭터 반응/행동 추가 시 확인 |
| `src/face/FaceCaptureController.js` | 웹캠·얼굴 검출·얼굴 텍스처 적용 | 얼굴 데이터 흐름을 건드릴 때 필수 |
| `src/world/PostProcessing.js` | 월드 EffectComposer 및 GLSL grade | Nevada/Hamina 화면 효과 추가 시 핵심 |
| `src/intro/IntroVisualLayer.js` | 인트로 전용 캔버스·영상·큐브 렌더링 | 인트로 비주얼/영상 합성 추가 시 핵심 |

### 주요 인터랙션 흐름

```text
OPENING_IMAGE
  → QUOTE_TYPING / QUOTE_HOLD / QUOTE_FADE_OUT
  → START_TITLE_IDLE
  → 타이틀 클릭
  → INTRO_START / NARRATION_1
  → CAMERA
  → 얼굴 촬영 및 FaceDetector 검증
  → CAPTURE_CONFIRM
      ├─ 취소: CAMERA
      └─ 업로드 동의: NARRATION_2 → LOADING
  → ExperienceController.enterWorldFromIntro()
  → INTRO_FAR_ORBIT → INTRO_ZOOM → ECHO_ORBIT
      ├─ 캐릭터 짧은 클릭: CHARACTER_FOCUS
      ├─ 다른 캐릭터 클릭: CHARACTER_SWITCH
      ├─ 같은 캐릭터 클릭: RETURN_TO_ECHO
      ├─ 빈 공간 롱프레스 + 드래그: FREE_ROAM
      └─ ECHO 더블클릭: Nevada → Hamina 월드 점프
```

### 렌더링 및 상태 관리 핵심

- 월드와 인트로는 서로 다른 `WebGLRenderer`/`EffectComposer`를 사용한다.
- 월드는 `ExperienceController.animate()`의 단일 animation loop에서 업데이트/렌더링된다.
- 월드 상태는 `EXPERIENCE_STATES`와 `CinematicCameraController.state`를 중심으로 관리한다.
- 인트로 상태는 `IntroState`와 `IntroExperience.transition(next)`에서 관리한다.
- 전역 상태 관리 라이브러리는 없고, 클래스 인스턴스와 콜백으로 컴포넌트 간 데이터를 전달한다.
- 새로운 기능은 기존 상태 머신, 콜백, `update(delta)` 루프를 우선 재사용해야 한다.

### 새 기능 추가 시 반드시 알아야 할 사항

1. 월드의 최상위 조정자는 `ExperienceController`다. 입력 클래스에서 카메라나 월드를 직접 조작하는 구조를 새로 만들지 않는다.
2. 카메라 동작은 `CinematicCameraController`의 상태 전환으로 표현한다. 직접 `camera.position`을 여러 곳에서 변경하면 기존 transition과 충돌할 수 있다.
3. 인트로 캔버스와 월드 캔버스는 별도 렌더러다. 인트로 효과를 `PostProcessing`에 바로 넣거나 그 반대로 넣지 않는다.
4. 월드에 보이는 HTML/CSS 오버레이는 `#stage` 안의 레이어 순서와 `world-visible`, `data-*` 상태에 의존한다.
5. 코드에 패스코드, 키보드 게임플레이, 서버 업로드, React/Vue 컴포넌트는 존재하지 않는다.
6. 새 기능을 제안할 때는 대상 상태, 트리거, 입력 이벤트, 영향 파일, 종료 조건, QA URL/검증 절차를 함께 명시한다.

---

## A. Project Overview

### 실제 구현 목적

`index.html`의 문서 설명은 “한 사람의 얼굴이 반복되는 Nevada의 ECHO World”다. 사용자는 웹캠으로 자신의 얼굴을 촬영하고, 로컬 브라우저에서 생성된 얼굴 텍스처를 15명의 3D 캐릭터에 적용한다. 이후 캐릭터들이 움직이는 Nevada 월드를 공전하고, 캐릭터를 선택해 얼굴 가까이 관찰하거나 전체 ECHO로 돌아갈 수 있다. ECHO 구체를 더블클릭하면 네 명의 캐릭터를 분할해 바라보는 전환을 거쳐 Hamina 설원 월드로 이동한다.

프로젝트의 서사적 의도는 클라우드에 맡긴 사진·문서·기억의 위치를 추적하여, 사용자의 존재가 분산된 복제물로 나타나는 장소를 직접 탐색하게 하는 것이다. 이 해석은 인트로 텍스트, 캡션, 월드 오버레이, `EchoProximityCaption`에 실제로 구현된 문구를 기준으로 한다.

### 최초 진입부터 월드까지

1. `src/main.js`가 `ExperienceController`를 만들고 `initialize({ introMode: true })`를 호출한다.
2. `IntroExperience`가 `#intro-root` 안에 인트로 DOM을 구성한다.
3. `OPENING_IMAGE`에서 `opening.png`와 `OpeningEchoLayer` 연출이 표시된다.
4. 오프닝이 끝나면 `QUOTE_TYPING`으로 이동하여 `INTRO_TEXT.quote`의 한국어/영어/출처가 타이핑된다.
5. 인용문이 유지된 뒤 `START_TITLE_IDLE`에서 `PROJECT ECHO:\n분산된 우리의 현현(顯現)` 타이틀이 대기한다.
6. 사용자가 타이틀을 클릭하면 `INTRO_START`와 `NARRATION_1`이 시작되고 영상, 오디오, 자막이 재생된다.
7. 첫 번째 내레이션 종료 후 `CAMERA`로 이동한다. 사용자는 카메라 권한을 허용하고 정면을 바라본 뒤 셔터를 누른다.
8. `FaceCaptureController.processFrame()`이 얼굴 랜드마크를 검증하고, 성공하면 `CAPTURE_CONFIRM` 화면에서 결과를 확인한다.
9. `취소`는 얼굴 세션을 비우고 `CAMERA`로 되돌린다. `업로드` 동의는 실제 서버 업로드가 아니라 다음 내레이션/월드 진입을 위한 연출 전환이다.
10. `NARRATION_2`가 끝나면 `LOADING`에서 `ExperienceController.enterWorldFromIntro()`를 호출한다.
11. 사전 로드된 Nevada와 캐릭터에 얼굴 텍스처를 적용하고 `world-visible`을 활성화한다.
12. `INTRO_FAR_ORBIT`에서 Nevada의 ECHO를 멀리 공전하고, 카메라 전환 후 `ECHO_ORBIT`에서 기본 탐색 상태가 된다.

### 월드 이후와 종료 범위

- 구현된 월드는 Nevada와 Hamina 두 개다.
- Nevada에서 Hamina으로 이동하는 전환은 구현되어 있다.
- Hamina 도착 후에는 `HAMINA_ARRIVAL`을 거쳐 카메라가 다시 인트로/오빗 계열 상태로 돌아가지만, 별도의 최종 엔딩 화면이나 종료 인터랙션은 소스에서 확인되지 않는다.
- 명시적인 종료 버튼, 세션 재시작 버튼, 키보드 단축키는 확인되지 않는다.

---

## B. Technology Stack

### 언어와 실행 구조

- JavaScript ES modules: 전체 애플리케이션 소스
- HTML: `index.html`의 기본 DOM 골격
- CSS: `src/style.css`, `src/intro/intro.css`
- Vite: 개발 서버 및 production build
- `package.json`의 `type`은 `module`이다.

### 3D 렌더링

- `three` `0.184.0`
- `THREE.Scene`, `PerspectiveCamera`, `OrthographicCamera`, `WebGLRenderer`
- `GLTFLoader`: `Nevada.glb`, `Hamina.glb`, 캐릭터 GLB 로딩
- `MeshoptDecoder`: `HaminaWorld.js`에서 사용
- `SkeletonUtils.clone`: `CharacterEntity.js`에서 스켈레탈 캐릭터 복제
- `EffectComposer`, `RenderPass`, `ShaderPass`, `UnrealBloomPass`, `OutputPass`

### 얼굴 인식

- `@mediapipe/tasks-vision` `0.10.21`
- `FaceLandmarker`: 얼굴 랜드마크 1개 검출
- `ImageSegmenter`: `selfie_multiclass.tflite` 기반 세그멘테이션
- `FaceTextureGenerator`: 랜드마크 삼각형 워핑과 Canvas pixel 합성
- 모델 파일은 `public/vendor/mediapipe/`에 있다.

### 애니메이션/상태/이벤트

- 별도 애니메이션 라이브러리는 사용하지 않는다.
- 카메라 전환은 `CinematicCameraController.update(delta)`의 수동 보간/감쇠와 상태 머신으로 처리한다.
- 캐릭터 애니메이션은 Three.js `AnimationMixer`를 감싼 `CharacterAnimator`가 처리한다.
- 타이밍 시퀀스는 `setTimeout`, `requestAnimationFrame`, HTML media `ended` 이벤트로 처리한다.
- 포인터 입력은 Pointer Events API를 사용한다.
- `ResizeObserver`로 `#stage`와 인트로 캔버스 크기를 감시한다.
- 전역 상태 관리 패키지와 라우터는 없다.

### 에셋 로딩

- 정적 에셋 URL은 `/models/...`, `/textures/...`, `/intro/assets/...`, `/audio/...` 형태다.
- `NevadaWorld.load()`, `HaminaWorld.load()`, `BaseCharacterAsset.load()`가 `GLTFLoader`로 모델을 비동기 로딩한다.
- `ExperienceController.preloadWorld()`가 월드와 캐릭터 베이스를 병렬 로딩한다.
- `ExperienceController.preloadHamina()`는 월드 점프 시작 후 Hamina를 `visible: false`로 백그라운드 로딩한다.

### 사용하지 않는 것으로 확인된 기술

- React, Vue, Svelte 등의 UI 프레임워크 없음
- GSAP, Framer Motion 등의 애니메이션 라이브러리 없음
- 별도 shader 파일 없음. 월드/인트로 GLSL은 각각 `PostProcessing.js`, `VisualPostProcessing.js` 내부 문자열로 정의됨.
- 서버 API 호출 및 외부 데이터 업로드 코드 없음
- 키보드 이벤트 리스너 없음
- 패스코드 입력 로직 없음

---

## C. Complete File Architecture

아래 목록은 `src/`의 실제 파일을 기준으로 하며, 새 인터랙션과 직접 관련된 파일에는 `★`를 붙였다.

### 진입점과 설정

#### `src/main.js` ★

- 담당: CSS import, `ExperienceController`와 `IntroExperience` 생성, 개발 QA query parameter 분기, pagehide 정리
- 핵심: `experience.initialize()`, `new IntroExperience(...)`, `experience.processIntroCapture`, `experience.enterWorldFromIntro`, `pagehide`
- 의존: `ExperienceController`, `IntroExperience`, `CAPTIONS`, `IntroState`
- 수정 상황: 새 전체 플로우를 연결하거나 개발용 QA 진입점을 추가할 때. 일반적인 UI/월드 기능은 이 파일보다 하위 컨트롤러를 수정한다.

#### `src/config.js` ★

- 담당: `EXPERIENCE_STATES`, `CAMERA_CONFIG`, `CHARACTER_CAMERA_CONFIG`, `INTERACTION_CONFIG`, `WORLD_CONFIG`, `HAMINA_CONFIG`, `WORLD_JUMP_CONFIG`, 지형 텍스처 설정, `FACE_SETTINGS`, `AVAILABLE_BASES`
- 핵심: 상태 이름과 모든 주요 수치/URL
- 의존: 카메라, 월드, 캐릭터, 얼굴, 입력 모듈 전반
- 수정 상황: 새 카메라 상태·입력 임계값·월드 점프 시간·얼굴 생성 옵션을 추가할 때. 이 파일 변경은 여러 모듈에 영향을 준다.

### 상위 런타임

#### `src/app/ExperienceController.js` ★

- 담당: 월드 씬, 카메라, 캐릭터, 얼굴, 입력, UI, 오버레이, 월드 전환의 통합 조정
- 핵심 함수: `initialize`, `preloadWorld`, `handleCapture`, `handleRetake`, `handleUsePhoto`, `processIntroCapture`, `enterWorldFromIntro`, `handleWorldDoubleClick`, `resolveWorldCursorMode`, `startWorldJump`, `activateHamina`, `handleCharacterPick`, `resize`, `animate`, `dispose`
- 의존: `NevadaWorld`, `HaminaWorld`, `WorldNavigation`, `Atmosphere`, `WeatherParticles`, `PostProcessing`, `CharacterManager`, `CinematicCameraController`, `CharacterPicker`, `PointerInteractionController`, `FaceCaptureController`, UI 클래스
- 수정 상황: 새 월드 상호작용, 새 전환 시퀀스, 여러 시스템을 함께 묶는 기능. 입력 클래스에서 직접 월드 전환을 만들지 말고 이 컨트롤러에 콜백으로 연결한다.

### 카메라

#### `src/camera/CinematicCameraController.js` ★

- 담당: 카메라 상태와 위치/시선 보간
- 핵심 함수: `setState`, `configure`, `startIntro`, `zoomToEcho`, `startEchoOrbit`, `focusCharacter`, `enterFreeRoam`, `updateFreeRoam`, `exitFreeRoam`, `returnToEcho`, `startWorldJumpOverview`, `holdWorldJumpSplit`, `holdWorldJumpEcho`, `startSkyLook`, `holdWorldLoading`, `startWorldArrival`, `update`
- 의존: `EXPERIENCE_STATES`, `CAMERA_CONFIG`, `CHARACTER_CAMERA_CONFIG`, `WorldNavigation`, 현재 world geometry
- 수정 상황: 캐릭터 포커스, 공전, 자유 탐색, 월드 이동처럼 카메라 중심 새 연출을 넣을 때.
- 주의: `update(delta)`가 현재 `state`를 기준으로 동작한다. 새 상태를 추가하면 상태별 update branch와 완료 시 다음 상태를 함께 추가해야 한다.

### 캐릭터

#### `src/characters/BaseCharacterAsset.js`

- 담당: `/models/semantic/character_{a,b,c}_face_ready.glb` 기반 캐릭터 베이스 로딩/애니메이션 클립 추출
- 핵심: `BaseCharacterAsset.load`, 생성자, `findFirstMesh`/관련 asset 준비 로직
- 의존: `GLTFLoader`, Three.js
- 수정 상황: 새로운 캐릭터 베이스 모델을 추가하거나 모델의 노드/클립 규칙이 바뀔 때.

#### `src/characters/CharacterManager.js` ★

- 담당: 베이스 사전 로드, 최대 15명 스폰, focus/world/look-up 상태 전파, relocation, dispose
- 핵심: `preload`, `spawn`, `update`, `setFocused`, `setWorldMode`, `setLookingUp`, `relocate`, `dispose`
- 의존: `BaseCharacterAsset`, `CharacterEntity`, `CharacterBehavior`, `AVAILABLE_BASES`
- 수정 상황: 캐릭터 수/구성/집단 반응/월드 간 이동을 바꿀 때.

#### `src/characters/CharacterEntity.js` ★

- 담당: 하나의 캐릭터 root, hit volume, face material, foot glow, 애니메이션, look-up 및 거리 기반 업데이트
- 핵심: `createHitVolume`, `createFootGlow`, `play`, `setFaceTexture`, `setWorldMode`, `setLookingUp`, `getHeadWorldPosition`, `getHeadDirection`, `getFaceSurfaceDirection`, `getLookUpProgress`, `update`, `updateDistanceFill`, `dispose`
- 의존: `CharacterAnimator`, `CharacterBehavior`, `FaceMaterialController`, `SkeletonUtils.clone`
- 수정 상황: 개별 캐릭터의 시각 반응, 상태, 히트 영역, 얼굴 조명/포커스 연출을 추가할 때.

#### `src/characters/CharacterBehavior.js`

- 담당: 캐릭터가 `WorldNavigation`이 만든 폐곡선 route를 따라 이동하고 진행 방향으로 회전
- 핵심: 생성자, `update(delta)`
- 의존: `WorldNavigation`, 캐릭터 root
- 수정 상황: 걷기 속도, 경로 움직임, 방향 전환, 행동 패턴을 바꿀 때.

#### `src/characters/CharacterAnimator.js`

- 담당: `AnimationMixer`를 이용한 `idle`, `walk` 등 clip 재생 및 거리/포커스에 따른 애니메이션 업데이트
- 핵심: `play`, `hold`, `update`, `dispose`
- 수정 상황: 새 animation clip, 포커스 시 정지/재생, 거리별 재생 속도 등을 추가할 때.

### 얼굴 처리

#### `src/face/WebcamCapture.js`

- 담당: `navigator.mediaDevices.getUserMedia`로 사용자 카메라 시작/정지, Canvas 프레임 캡처
- 핵심: `start`, `capture`, `stop`
- 수정 상황: 카메라 제약 조건, 좌우 반전, 카메라 장치 처리 변경 시.

#### `src/face/FaceDetector.js`

- 담당: MediaPipe runtime/model 초기화, 랜드마크 검출, 사람 세그먼테이션
- 핵심: `initialize`, `detect`, `segment`, `dispose`
- 실제 검증: 랜드마크가 468개 이상이고 유한하며 `points[152].y > points[1].y`인 경우 `FACE_DETECTION_VALID`로 판정한다.
- 수정 상황: 얼굴 유효성 기준, MediaPipe model, segmenter 설정 변경 시.

#### `src/face/FaceTextureGenerator.js`

- 담당: 촬영 프레임을 canonical face mesh에 삼각형 단위로 워핑하고 베이스 얼굴과 혼합해 768px Canvas 텍스처 생성
- 핵심: `generate`, 내부 `drawTriangle`, tone sampling 및 feature/contour blend
- 의존: `FACE_SETTINGS`, `public/face/canonical.json`
- 수정 상황: 얼굴 합성 품질, 색조, feature opacity, 해상도 변경 시.

#### `src/face/FaceMaterialController.js`

- 담당: 캐릭터 얼굴 mesh의 기본/사용자 텍스처 적용과 포커스/거리 기반 재질 반응
- 핵심: `set`, `update`, `reset`, `dispose`
- 수정 상황: 얼굴 표시 방식, 포커스 시 재질, 사용자 텍스처 해제 동작 변경 시.

#### `src/face/FaceCaptureController.js` ★

- 담당: `WebcamCapture`, `FaceDetector`, `FaceTextureGenerator`의 파사드
- 핵심: `initialize`, `start`, `capture`, `processFrame`, `applyToCharacters`, `clearSession`, `stop`, `dispose`
- 데이터 흐름: `frame → FaceDetector.detect → FaceDetector.segment → session → FaceTextureGenerator.generate → CharacterEntity.setFaceTexture`
- 수정 상황: 촬영 처리 시퀀스, 얼굴 세션, 캐릭터 전체 적용을 변경할 때.

### 입력과 UI

#### `src/interaction/CharacterPicker.js` ★

- 담당: 화면 좌표를 NDC로 바꿔 `Raycaster`로 `CharacterEntity.hitVolume` 선택
- 핵심: `pick(clientX, clientY, logHit = true)`
- 수정 상황: 클릭 대상, hit volume, 선택 판정, UI hover 판정 변경 시.

#### `src/interaction/PointerInteractionController.js` ★

- 담당: `pointerdown/move/up/cancel`, 짧은 클릭과 350ms 롱프레스/드래그 구분
- 핵심: `handlePointerDown`, `handlePointerMove`, `handlePointerUp`, `handlePointerCancel`, `dispose`
- 의존: `EXPERIENCE_STATES`, `INTERACTION_CONFIG`, `cameraController`, `picker`, `onCharacter`
- 수정 상황: 기존 포인터 인터랙션 확장 시. 현재는 `ECHO_ORBIT`와 `CHARACTER_FOCUS`에서만 입력을 받는다.

#### `src/ui/CaptureUI.js`

- 담당: `#capture-layer`의 카메라/미리보기/촬영/재촬영/사용 버튼 DOM 상태
- 핵심: `bind`, `setReady`, `setBusy`, `showPreview`, `showCamera`, `showLoading`, `leave`, `dispose`
- 수정 상황: 얼굴 캡처 UI 버튼이나 로딩 UI를 바꿀 때.

#### `src/ui/InteractionCursor.js`

- 담당: 포인터 위치에 따라 `stage.dataset.worldHoverTarget`과 커서 모드 변경
- 핵심: `handlePointerMove`, `getMode`, `setMode`, `pointAtCameraShutter`
- 의존: `resolveWorldCursorMode` 콜백, `src/style.css`
- 수정 상황: 새 hover/cursor 상태, UI 버튼과 월드 대상별 포인터 피드백을 추가할 때.

#### `src/ui/EchoProximityCaption.js`

- 담당: 카메라와 ECHO의 거리/카메라 상태에 따른 캡션 표시 및 임시 override
- 핵심: `showOverride`, `clearOverride`, `update`
- 수정 상황: 월드 서사 텍스트나 캐릭터/공간 근접 반응을 추가할 때.

### 인트로

#### `src/intro/config.js` ★

- 담당: `IntroState`, `STAGE`, `INTRO_TEXT`, `TIMING`, `ASSETS`, `AUDIO_MIX`, `CAPTIONS`
- 수정 상황: 인트로 상태·문구·타이밍·오디오·자막을 변경할 때.

#### `src/intro/IntroExperience.js` ★

- 담당: 인트로 DOM 생성, `CaptionController`, 카메라 촬영 UI, 동의 UI, 상태 전환
- 핵심: `beginOpening`, `quoteFinished`, `titleHover`, `titleClick`, `enterCamera`, `capture`, `consent`, `rejectConsent`, `monitorNarration2End`, `transition`, `complete`, `destroy`
- 의존: `AudioController`, `createIntroVisualLayer`, `IntroState`, `CAPTIONS`, `TIMING`
- 수정 상황: 인트로의 사용자 행동/순서/동의 흐름을 변경할 때.

#### `src/intro/AudioController.js`

- 담당: 음원 preload, 안전한 play, 음악 fade, UI/월드 진입 효과음
- 핵심: `safePlay`, `playMusic`, `primeFromGesture`, `previewIntroMusic`, `startNarration1AndMusic`, `startNarration2AndMusic`, `playUi`, `playNevadaEntry`, `playHaminaEntry`, `handoffToWorld`, `destroy`
- 수정 상황: 오디오 큐/볼륨/페이드/자동재생 예외를 바꿀 때.

#### `src/intro/IntroVisualLayer.js`

- 담당: 인트로 전용 `WebGLRenderer`, orthographic scene, 영상 plane, camera plane, capture cube, intro postFX
- 핵심: `createIntroVisualLayer`, 내부 `resize`, `render`, `showOpening`, `startNarration1`, `showCamera`, `showCapture`, `startNarration2`, `showBlank`, `fadeOpening`, `destroy`
- 의존: `VisualPostProcessing`, `OpeningEchoLayer`, `ASSETS`, 영상 에셋
- 수정 상황: 인트로 비디오/카메라/큐브/오프닝 그래픽을 추가하거나 교체할 때.

#### `src/intro/OpeningEchoLayer.js`

- 담당: opening GLB(`echo-opening-rig.glb`)와 별도 2D/3D 연출 레이어
- 핵심: `createOpeningEchoLayer`, `reset`, `update`, `beginPair`, `solveLeg`, `resize`
- 수정 상황: 오프닝의 캐릭터/리깅/움직임을 바꿀 때.

#### `src/intro/VisualPostProcessing.js`

- 담당: 인트로용 `DreamShader`, bloom, diffusion, halation, grain, chromatic treatment
- 핵심: `INTRO_POST_FX`, `createIntroPostProcessing`
- 수정 상황: 인트로 영상의 optical look을 변경할 때. 월드 효과는 `src/world/PostProcessing.js`를 수정한다.

### 월드와 환경

#### `src/world/NevadaWorld.js` / `src/world/HaminaWorld.js` ★

- 담당: GLB 로딩, root/echo/bounds/walkable roots 설정, lighting, 월드 attach/detach/dispose
- 핵심: `load`, `addLighting`, `detach`, `dispose`
- 의존: `GLTFLoader`, `MeshoptDecoder`(Hamina), `TerrainTextureSystem`, 각 월드 config
- 수정 상황: 월드 모델 교체, 노드 이름 매핑, 조명, 월드별 bounds/echo를 바꿀 때.

#### `src/world/WorldNavigation.js`

- 담당: walkable mesh와 obstacle box를 분석하고 캐릭터 폐곡선 route 생성, 카메라 바닥/경계 제약
- 핵심: `configure`, `sampleHeight`, `isClear`, `makeEllipse`, `buildRoutes`, `sampleRoute`, `constrainCamera`
- 수정 상황: 캐릭터 길, 스폰 위치, 카메라 경계/지형 충돌을 바꿀 때.

#### `src/world/TerrainTextureSystem.js`

- 담당: 월드 material에 baseColor/normal/roughness 텍스처 적용 및 Hamina triplanar snow shader 적용
- 핵심: `apply`, `applyTriplanarShader`, `loadTexture`
- 수정 상황: 지형 재질, texture repeat, snow blend, shader 기반 지형 효과를 추가할 때.

#### `src/world/Atmosphere.js`

- 담당: gradient background, fog, Nevada↔Hamina 분위기 보간
- 핵심: `drawGradient`, `createGradientBackground`, `setFog`, `transitionTo`, `finishTransition`, `update`, `dispose`
- 수정 상황: 하늘색, 안개, 월드 전환 색감/환경 효과를 바꿀 때.

#### `src/world/WeatherParticles.js`

- 담당: dust/snow Points 파티클 생성, 위치 reset, 매 프레임 이동, dispose
- 핵심: `reset`, `update`, `dispose`
- 수정 상황: 눈/먼지/새 파티클 시스템을 추가하거나 수량/속도를 조절할 때.

#### `src/world/PostProcessing.js` ★

- 담당: 월드 `EffectComposer`와 `EchoGradeShader`, bloom, portrait focus, Hamina 색감
- 핵심: `setWorldMode`, `setSize`, `render`, `dispose`
- 수정 상황: 월드 전역 색보정, grain, chromatic separation, bloom, 포커스 연출을 바꿀 때.

### 스타일 및 문서

#### `src/style.css` ★

- 담당: 앱 shell, `#stage`, 월드 canvas, capture layer, world/hamina entry overlay, world jump overlay, cursor/caption의 layout/transition
- 수정 상황: 월드 DOM overlay, responsive layout, pointer feedback을 바꿀 때.

#### `src/intro/intro.css` ★

- 담당: 인트로 stage, opening, quote, title, narration/camera/capture/consent/loading의 스타일과 상태별 transition
- 수정 상황: 인트로 UI와 화면 전환을 바꿀 때.

---

## D. Current Interaction Inventory

### 1. 오프닝 이미지/Opening Echo

- Interaction Name: Opening sequence
- Trigger: 페이지 최초 진입 및 `IntroExperience` 생성
- Input: 초기화 후 시간 경과. 별도 사용자 클릭 없이 시작되며, `opening` 영역의 pointerdown/click 처리는 `IntroExperience` 내부에서 연결된다.
- Processing: `IntroExperience.beginOpening()`이 `openingTriggered`를 확인하고 `fadeOpening()` 후 `QUOTE_TYPING`으로 전환한다.
- Output: `opening.png`, `OpeningEchoLayer`, 인트로 전용 renderer와 intro postFX가 표시된다.
- Related Files: `src/intro/IntroExperience.js`, `src/intro/IntroVisualLayer.js`, `src/intro/OpeningEchoLayer.js`, `src/intro/intro.css`, `public/intro/assets/opening/`
- Dependencies: 인트로 root가 숨겨지지 않아야 하며, `IntroExperience`가 생성되어야 한다.

### 2. 인용문 타이핑 및 타이틀 호버

- Interaction Name: Quote and start title
- Trigger: 오프닝 종료 후 자동 진행, 이후 타이틀 pointer hover/click
- Input: 시간, `pointerenter`, `pointerleave`, `click`
- Processing: `createTypingQuote().play()`가 한 글자씩 textContent를 갱신한다. `quoteFinished()`가 hold/fade를 거쳐 `START_TITLE_IDLE`로 이동한다. `titleHover()`는 음악 preview와 UI sound를 호출한다.
- Output: 한국어/영어 인용문, 출처, 타이틀 glyph별 fade/hover 상태, intro BGM preview
- Related Files: `src/intro/IntroExperience.js`, `src/intro/config.js`, `src/intro/AudioController.js`, `src/intro/intro.css`
- Dependencies: `TIMING.QUOTE_TYPING_SPEED`, `TIMING.QUOTE_HOLD_DURATION`, `AudioController`

### 3. 타이틀 클릭과 Narration 1

- Interaction Name: Start Project ECHO introduction
- Trigger: `START_TITLE_IDLE` 상태에서 title click
- Input: click gesture
- Processing: `titleClick()`이 `INTRO_START`로 전환하고 `startNarration1AndMusic()`, `startNarration1()`, caption 시작을 수행한다. narration 1 종료 시 `enterCamera()`가 호출된다.
- Output: 타이틀/분할 화면이 사라지고 `narration_1_video_web.mp4`, `narration_1.mp3`, 한/영 captions가 재생된다.
- Related Files: `IntroExperience.js`, `IntroVisualLayer.js`, `AudioController.js`, `config.js`
- Dependencies: 브라우저 audio gesture 정책, narration media `ended` event, 자막 시간 cue

### 4. 웹캠 시작 및 얼굴 촬영

- Interaction Name: Face capture
- Trigger: Narration 1 종료 후 `CAMERA`, 또는 `ExperienceController`의 capture UI 촬영 버튼
- Input: 카메라 권한, video frame, capture button click
- Processing: `IntroExperience.enterCamera()`가 `view.camera.start()`를 호출한다. 셔터 클릭은 `IntroExperience.capture()`로 이어지고 `onCapture(frame)`가 `ExperienceController.processIntroCapture(frame)`을 호출한다. 월드 후 별도 capture layer에서는 `ExperienceController.handleCapture()`가 같은 `FaceCaptureController`를 사용한다.
- Output: 카메라 preview, 안내 문구, processing 상태, 촬영 frame 저장
- Related Files: `src/intro/IntroExperience.js`, `src/face/WebcamCapture.js`, `src/face/FaceCaptureController.js`, `src/ui/CaptureUI.js`, `index.html`
- Dependencies: HTTPS 또는 localhost, browser camera permission, MediaPipe initialization

### 5. 얼굴 검증 및 텍스처 생성

- Interaction Name: Face validation and face-to-character mapping
- Trigger: 촬영 직후 `processFrame(frame)` 또는 월드 capture UI의 `capture()`
- Input: Canvas frame
- Processing: `FaceDetector.detect()`가 468 landmark와 방향 조건을 검사하고, 성공 시 `segment()`가 사람 mask를 만든다. `FaceCaptureController.applyToCharacters()`가 각 base image에 대해 `FaceTextureGenerator.generate()`를 호출하고 `CharacterEntity.setFaceTexture()`로 적용한다.
- Output: 얼굴 session, 캐릭터 15명의 face texture, 상태 문구 `${applied}명의 얼굴이 연결되었습니다`
- Related Files: `FaceCaptureController.js`, `FaceDetector.js`, `FaceTextureGenerator.js`, `FaceMaterialController.js`, `CharacterEntity.js`, `public/face/canonical.json`
- Dependencies: MediaPipe model files, `FACE_SETTINGS`, 캐릭터 face controller의 `baseImage`

### 6. 촬영 결과 동의/재촬영

- Interaction Name: Capture confirmation
- Trigger: 얼굴 검증 성공 후
- Input: `no`/`yes` 버튼
- Processing: `rejectConsent()`는 `onReject`로 얼굴 session을 지우고 camera를 재시작한다. `consent()`는 `NARRATION_2`로 전환하고 narration 2를 시작한다.
- Output: capture preview, cloud consent dialog, 재촬영 또는 두 번째 내레이션
- Related Files: `IntroExperience.js`, 생성되는 consent DOM, `intro.css`, `main.js`
- Dependencies: 현재 문구는 실제 업로드 구현과 독립적이다. 서버 전송 코드는 없다.

### 7. Nevada 진입

- Interaction Name: Intro-to-world handoff
- Trigger: narration 2 최종 cue 이후 `LOADING`
- Input: 비동기 asset readiness, 얼굴 session
- Processing: `main.js`의 `onLoading` callback이 `experience.enterWorldFromIntro({ applyFace: true })`를 호출한다. `readyPromise`가 월드/캐릭터 로딩을 기다리고 `applyToCharacters()` 후 `world-visible`을 설정한다.
- Output: capture layer fade-out, world entry overlay, Nevada ECHO far orbit, Nevada entry audio
- Related Files: `main.js`, `ExperienceController.js`, `CaptureUI.js`, `CinematicCameraController.js`, `style.css`
- Dependencies: `preloadWorld`, 얼굴 session, `worldRenderingEnabled`

### 8. ECHO 자동 공전

- Interaction Name: ECHO orbit
- Trigger: Nevada 진입 연출 완료
- Input: 시스템 시간
- Processing: `CinematicCameraController.startIntro()`가 `INTRO_FAR_ORBIT`를 시작한다. `update(delta)`가 far orbit, zoom, near orbit을 진행한다. 완료 시 `ECHO_ORBIT`가 된다.
- Output: 카메라가 ECHO를 공전하고, world entry overlay가 표시되었다가 숨겨진다.
- Related Files: `CinematicCameraController.js`, `ExperienceController.js`, `EchoProximityCaption.js`, `style.css`
- Dependencies: 현재 world의 `echo`, `echoCenter`, `worldSize`, `CAMERA_CONFIG`

### 9. 캐릭터 짧은 클릭/포커스

- Interaction Name: Character focus
- Trigger: `ECHO_ORBIT` 또는 `CHARACTER_FOCUS` 상태에서 캐릭터 hit volume에 짧은 pointer click
- Input: pointer down/up, 화면 좌표, `clickMoveTolerance` 이내 이동
- Processing: `PointerInteractionController`가 `CharacterPicker.pick()`을 호출한다. 캐릭터가 선택되면 `ExperienceController.handleCharacterPick()`이 `cameraController.focusCharacter(character)` 또는 `returnToEcho()`/switch를 선택한다.
- Output: 카메라가 선택 캐릭터 head pose로 이동하고, 캐릭터 focus flag/portrait lighting/포스트프로세싱 portrait focus가 변경된다.
- Related Files: `PointerInteractionController.js`, `CharacterPicker.js`, `ExperienceController.js`, `CinematicCameraController.js`, `CharacterEntity.js`, `PostProcessing.js`
- Dependencies: `hitVolume`, 현재 카메라 state, `CharacterEntity.getHeadWorldPosition()` 및 face direction

### 10. 캐릭터 전환/복귀

- Interaction Name: Character switch and return
- Trigger: 포커스 상태에서 다른 캐릭터 또는 동일 캐릭터를 클릭
- Input: character hit volume click
- Processing: 동일 entity면 `returnToEcho()`, 다른 entity면 `focusCharacter()`가 `CHARACTER_SWITCH` 상태로 transition한다.
- Output: 카메라가 직접 다른 캐릭터로 이동하거나 ECHO orbit으로 돌아온다.
- Related Files: `ExperienceController.handleCharacterPick`, `CinematicCameraController.focusCharacter`, `returnToEcho`
- Dependencies: `cameraController.focused`, `CHARACTER_CAMERA_CONFIG`, `CAMERA_CONFIG.characterTransitionDuration`

### 11. 자유 부유 탐색

- Interaction Name: Free roam
- Trigger: `ECHO_ORBIT`에서 캐릭터가 아닌 빈 공간을 350ms 이상 누른 뒤 이동
- Input: pointer down/move/up, `INTERACTION_CONFIG.longPressThreshold`, delta x/y
- Processing: timer가 `cameraController.enterFreeRoam()`을 호출한다. 이동 중 `updateFreeRoam(dx,dy)`, release/cancel 시 `exitFreeRoam()` → `returnToEcho()`가 실행된다.
- Output: 카메라 yaw/pitch와 drag 기반 부유, pointer release 후 ECHO로 복귀
- Related Files: `PointerInteractionController.js`, `CinematicCameraController.js`, `WorldNavigation.js`
- Dependencies: 포인터가 빈 공간이어야 하며, 캐릭터 클릭과 long press timer가 충돌하지 않도록 해야 한다.

### 12. ECHO hover와 더블클릭 월드 점프

- Interaction Name: Nevada-to-Hamina world jump
- Trigger: `ECHO_ORBIT`에서 ECHO mesh 위 더블클릭
- Input: canvas `dblclick`, raycast hit
- Processing: `handleWorldDoubleClick()`이 ECHO를 raycast하고 `startWorldJump()`를 호출한다. overview → split portraits → snapshot/dissolve → sky look → loading → `activateHamina()` 순서다.
- Output: 캡션 override, 카메라 상승, 네 명의 split portrait, ECHO snapshot dissolve, 먼지→눈 atmosphere 전환, Hamina 진입 overlay/audio
- Related Files: `ExperienceController.js`, `CinematicCameraController.js`, `Atmosphere.js`, `WeatherParticles.js`, `HaminaWorld.js`, `style.css`
- Dependencies: `worldTransitioning`, `currentWorld`, `WORLD_JUMP_CONFIG`, Hamina preload, `splitCameras`

### 13. 커서/hover 피드백

- Interaction Name: Interaction cursor
- Trigger: `pointermove` on stage/window
- Input: pointer coordinates
- Processing: `InteractionCursor.getMode()`가 callback으로 `ExperienceController.resolveWorldCursorMode()`를 호출한다. 결과는 `blocked`, `character`, `character-back`, `echo` 등이다.
- Output: CSS 커서/hover 상태와 `stage.dataset.worldHoverTarget`
- Related Files: `InteractionCursor.js`, `ExperienceController.js`, `style.css`
- Dependencies: 현재 camera state와 raycast 결과. 전환 중에는 `blocked`다.

### 14. 환경/캐릭터 자동 애니메이션

- Interaction Name: World simulation loop
- Trigger: `renderer.setAnimationLoop(this.animate)`
- Input: `THREE.Timer` delta/elapsed
- Processing: `ExperienceController.animate()`가 character update, camera update, atmosphere, weather, caption, post-processing, render를 연속 호출한다.
- Output: 캐릭터 걷기, 카메라 보간/공전, 파티클, 안개 색상, face fill, bloom/grade
- Related Files: `ExperienceController.js`, `CharacterManager.js`, `CharacterBehavior.js`, `CharacterAnimator.js`, `WeatherParticles.js`, `Atmosphere.js`, `PostProcessing.js`
- Dependencies: `worldRenderingEnabled`, active world, current camera state

---

## E. Rendering & Visual Architecture

### DOM 레이어와 3D 캔버스

`index.html`의 `#stage`는 모든 출력의 컨테이너다.

```text
#stage
├─ #world-canvas                 # ExperienceController의 월드 renderer
├─ #intro-root                   # IntroExperience가 동적으로 채우는 인트로 DOM/visual layer
├─ #capture-layer                # 월드 전 얼굴 캡처 UI
├─ #world-loading
├─ #world-entry-overlay
├─ #hamina-entry-overlay
├─ #world-jump-overlay
│  └─ .world-jump-snapshot canvas
└─ #echo-caption
```

실제 z-index와 opacity는 `src/style.css`, `src/intro/intro.css`에 있다. 새 오버레이를 추가할 때는 같은 `#stage` 안에 두고, `hidden`, class, `aria-hidden`, `world-visible`의 기존 동작을 확인해야 한다.

### 월드 렌더 파이프라인

`ExperienceController` 생성 시 다음이 한 번 구성된다.

```text
THREE.Scene
  → RenderPass(scene, camera)
  → UnrealBloomPass
  → ShaderPass(EchoGradeShader)
  → OutputPass
  → EffectComposer.render()
```

`EchoGradeShader`는 `tDiffuse`, `resolution`, `time`, `portraitFocus`, `haminaMode`를 사용한다. 화면 가장자리 chromatic separation, contrast/saturation, vignette, grain을 적용하고 `haminaMode`가 켜지면 차가운 snow grade를 적용한다. 캐릭터 포커스 상태에서는 `portraitFocus`가 damp되어 chromatic/grain/vignette 강도가 달라진다.

`PostProcessing.setWorldMode('hamina')`는 bloom strength/threshold, renderer toneMapping exposure, shader의 `haminaMode`를 바꾼다.

### 인트로 렌더 파이프라인

인트로는 월드와 별도의 renderer/scene/camera를 만든다.

```text
IntroVisualLayer WebGLRenderer
  → OrthographicCamera
  → backdrop plane
  → media plane (opening/narration/camera/capture)
  → capture cube (narration2)
  → lights
  → Intro EffectComposer
      RenderPass → UnrealBloomPass → DreamShader → OutputPass
```

`DreamShader`에는 diffusion, halation, grain, chromatic shift, optional starburst, color tint가 들어 있다. `INTRO_POST_FX.starburstEnabled`와 `dofStrength`는 현재 설정상 비활성/0이다.

인트로 텍스트/UI는 이 composer 안에 들어가지 않는다. `IntroVisualLayer`의 주석에도 “text/UI outside this composer”가 명시되어 있다. 따라서 새 텍스트가 영상과 같은 optical treatment를 받아야 하는지, DOM layer로 남아야 하는지를 먼저 결정해야 한다.

### 애니메이션 루프

- 월드: `renderer.setAnimationLoop(this.animate)`
- 월드 `animate()`는 `THREE.Timer`에서 delta/elapsed를 얻고, `ExperienceController`가 하위 객체들을 update한다.
- 인트로: `IntroVisualLayer` 내부의 별도 render loop가 media sync와 capture cube를 업데이트한다.
- 타이밍 시퀀스: `setTimeout`, `requestAnimationFrame`, HTML audio/video `ended` 이벤트가 혼합되어 있다.

새 애니메이션은 가능하면 기존 `update(delta)` 또는 상태 머신의 transition에 넣는다. 별도 `setInterval`이나 독립적인 무한 RAF를 만들면 `dispose()`와 visibility/lifecycle 정리가 필요하다.

### 반응형/화면 비율

- 월드 PerspectiveCamera는 초기 aspect를 `9 / 16`으로 생성한다.
- `ExperienceController.resize()`가 실제 stage size를 보고 renderer/camera/composer를 갱신한다.
- `WORLD_CONFIG.maxPixelRatio`, `maxRenderPixels`를 사용해 렌더 픽셀을 제한하는 구조가 있다.
- 인트로 stage는 `STAGE = { width: 2160, height: 3840 }` 기준의 세로 composition이다.
- 인트로 visual layer는 실제 stage 크기에 맞춰 orthographic camera와 video texture crop을 재계산한다.
- `ResizeObserver`가 월드 stage와 인트로 root를 각각 감시한다.

### 충돌 가능 지점

- 월드 canvas는 post-processing composer가 최종 출력하므로 canvas 위에 직접 CSS filter를 추가하면 shader grade와 이중 적용될 수 있다.
- 인트로와 월드가 별도 renderer라서 하나의 renderer의 scene/pass를 공유하면 안 된다.
- `#world-jump-overlay`와 `#world-entry-overlay`는 state/class 전환으로 visibility를 제어하므로 새 transition에서 임의로 `hidden`을 조작하면 기존 fade가 깨질 수 있다.
- `worldRenderingEnabled`가 false인 동안에는 월드 커서/입력/렌더가 막힌다.
- 카메라 직접 이동은 `CinematicCameraController.transition`과 충돌한다.
- split portrait는 `splitCameras` 4개와 layer 설정, 별도 render 순서를 사용하므로 일반 camera만 수정해서는 반영되지 않는다.

---

## F. State & Event Architecture

### 인트로 상태

`src/intro/config.js`의 `IntroState`가 사용하는 상태는 다음과 같다.

```text
OPENING_IMAGE
  → QUOTE_TYPING
  → QUOTE_HOLD
  → QUOTE_FADE_OUT
  → START_TITLE_FADE_IN
  → START_TITLE_IDLE
  → INTRO_START
  → NARRATION_1
  → CAMERA
  → CAPTURE_CONFIRM
      ├─ rejectConsent → CAMERA
      └─ consent → NARRATION_2
                    └─ narration end → LOADING
                              └─ onLoading → INTRO_COMPLETE
```

`transition(next)`은 `root.dataset.introState = next`를 설정한다. CSS는 이 dataset/class를 이용해 상태별 스타일을 적용한다.

### 월드/카메라 상태

`src/config.js`의 `EXPERIENCE_STATES`는 다음과 같다.

```text
CAPTURE
PHOTO_PREVIEW
INTRO_FAR_ORBIT
INTRO_ZOOM
ECHO_ORBIT
FREE_ROAM
CHARACTER_FOCUS
CHARACTER_SWITCH
RETURN_TO_ECHO
WORLD_JUMP_PREP
WORLD_JUMP_SPLIT
WORLD_JUMP_ECHO
WORLD_JUMP_SKY
WORLD_LOADING
HAMINA_ARRIVAL
```

중요한 전환 조건:

- `startIntro()` → `INTRO_FAR_ORBIT`
- intro orbit update 완료 → `INTRO_ZOOM`
- zoom 완료 → `ECHO_ORBIT`
- ECHO 빈 공간 long press → `FREE_ROAM`
- free roam release/cancel → `RETURN_TO_ECHO`
- 캐릭터 선택 → `CHARACTER_FOCUS` 또는 `CHARACTER_SWITCH`
- 같은 캐릭터 재선택 → `RETURN_TO_ECHO`
- return transition 완료 → `ECHO_ORBIT`
- ECHO double click → `WORLD_JUMP_PREP`
- split sequence → `WORLD_JUMP_SPLIT` → `WORLD_JUMP_ECHO` → `WORLD_JUMP_SKY` → `WORLD_LOADING`
- Hamina activate 후 → `HAMINA_ARRIVAL`, arrival transition 완료 시 `startIntro()`가 호출될 수 있다.

### 주요 상태 변수

`ExperienceController`:

- `currentWorld`: `'nevada'` 또는 `'hamina'`
- `worldRenderingEnabled`: 월드 렌더/입력 허용 여부
- `worldTransitioning`: Nevada→Hamina 중복 전환 방지
- `assetsReady`, `readyPromise`: 월드/캐릭터 로딩 상태
- `haminaPromise`: Hamina 사전 로드 promise
- `splitCharacters`, `splitCameras`: 월드 점프 분할 연출
- `worldHoverTarget`: 현재 hover 대상
- `pendingSplitCapture`: split snapshot 관련 상태

`CinematicCameraController`:

- `state`: 현재 `EXPERIENCE_STATES`
- `focused`: 현재 포커스 캐릭터
- `transition`: 카메라 transition 정보
- `angle`, `nearRadius`, `farRadius`, `nearHeight`, `farHeight`
- `freeYaw`, `freePitch`, `drag`, `freeVelocity`

`FaceCaptureController`:

- `session`: `{ frame, points, segmentation }`
- `busy`, detector/generator/webcam 인스턴스

### 이벤트 등록과 해제

- `PointerInteractionController`가 canvas에 pointer listeners를 등록하고 `dispose()`에서 제거한다.
- `ExperienceController`는 canvas `dblclick`을 등록하고 `dispose()`에서 제거한다.
- `CaptureUI.bind()`가 capture/retake/use 버튼에 listener를 등록하고 `dispose()`에서 제거한다.
- `IntroExperience`는 title/camera/consent DOM listener와 audio ended listener를 설정하고 `destroy()`에서 제거한다.
- `ResizeObserver`는 `ExperienceController.dispose()`와 인트로 visual layer destroy 흐름에서 정리된다.
- `pagehide`에서 `intro?.destroy()`와 `experience.dispose()`가 호출된다.

새 이벤트는 반드시 소유 클래스의 `dispose()`/`destroy()`에서 제거한다.

### 비동기와 로딩

```text
ExperienceController.initialize()
  ├─ renderer/resize/animationLoop 설정
  └─ readyPromise = preloadWorld()
       ├─ NevadaWorld.load()
       └─ CharacterManager.preload()
          → navigation configure
          → CharacterManager.spawn(15)
          → picker/pointer controller 생성

Intro capture
  → FaceDetector.initialize()
  → processFrame()
  → session 저장

Use Photo / Intro Loading
  → await readyPromise
  → await applyToCharacters()
  → world visible

World jump
  → preloadHamina()
  → sequence waits
  → await Hamina promise + minimum loading hold
  → activateHamina()
```

---

## G. Assets & 3D Environment

### 에셋 디렉터리

```text
public/
├─ audio/
│  ├─ nevada-entry.mp3
│  └─ hamina-entry.mp3
├─ face/
│  ├─ canonical.json
│  └─ ATTRIBUTION.txt
├─ intro/assets/
│  ├─ audio/                         # bgm, narration, typing, UI sounds
│  ├─ narration1/*.mp4
│  ├─ narration2/*.mp4
│  └─ opening/
│     ├─ echo-opening-rig.glb
│     └─ opening.png
├─ models/
│  ├─ Nevada.glb
│  ├─ Hamina.glb
│  └─ semantic/character_*_face_ready.glb
├─ textures/
│  ├─ nevada/{asphalt,concrete,grass,gravel,mountain}/
│  └─ hamina/{snow,snow-dirt,snowy-rock,water}/
└─ vendor/mediapipe/
   ├─ face_landmarker.task
   ├─ selfie_multiclass.tflite
   └─ vision wasm files
```

### GLB 처리

- `NevadaWorld.load()`은 `WORLD_CONFIG.modelUrl`을 로드하고 config의 `walkableNodeNames`에 해당하는 root를 찾는다.
- `HaminaWorld.load()`은 `HAMINA_CONFIG.modelUrl`을 로드하고 `MeshoptDecoder`를 연결한다.
- 월드 로드 후 `TerrainTextureSystem.apply()`가 지형 material을 수정한다.
- 캐릭터 베이스는 `BaseCharacterAsset.load()`에서 로드하고, `CharacterManager.spawn()`이 `CharacterEntity`로 복제한다.
- `CharacterEntity`는 `SkeletonUtils.clone`을 사용하므로 스켈레탈 캐릭터를 단순 `object.clone()`으로 대체하지 않는다.

### 텍스처/재질

- Nevada material은 `TERRAIN_TEXTURE_CONFIG`를 사용한다.
- Hamina는 `HAMINA_TERRAIN_TEXTURE_CONFIG`와 triplanar/snow blend shader를 사용한다.
- 얼굴은 `FACE_TEXTURE_GENERATOR`가 768px Canvas를 생성한 후 `THREE.Texture`로 캐릭터 face material에 적용한다.
- `FaceCaptureController.applyToCharacters()`는 동일 `baseImage`에 대한 generated template를 `Map`으로 캐시한 뒤 clone하여 적용한다.

### 성능 최적화로 확인되는 것

- `preloadWorld()`에서 월드/캐릭터 베이스를 `Promise.all`로 병렬 로딩한다.
- `preloadHamina()`는 월드 점프 전에 Hamina를 비가시로 미리 로딩한다.
- renderer pixel ratio와 render pixel budget을 제한한다.
- 인트로 visual layer는 `pixelBudgetRatio`를 계산해 post-FX pixel ratio를 최대 1.25로 제한한다.
- 얼굴 텍스처는 base image별로 한 번 생성하고 clone한다.
- Hamina로 전환한 후 이전 world는 `requestIdleCallback` 또는 timeout으로 지연 dispose한다.
- 캐릭터 spawn route는 지형 높이와 obstacle box를 검사한다.

에셋을 추가할 때는 `public` 아래에 파일을 두고 config URL 및 loader를 연결한다. `dist`에 직접 파일을 추가하지 않는다.

---

## H. Current Constraints & Known Issues

아래는 코드에서 확인되는 제약 또는 확장 시 주의점이다. 실행 환경에서 재현하지 않은 내용을 버그로 단정하지 않는다.

### 구조적 결합

- `ExperienceController`가 대부분의 하위 시스템을 직접 생성하고 보관한다. 새 기능이 여러 subsystem을 건드리면 이 파일이 커질 수 있다.
- `CinematicCameraController.state`가 입력 가능 여부, caption, post-processing portrait focus, overlay hide/show에 영향을 준다.
- 얼굴 적용은 `CharacterEntity.faceController.baseImage`가 있는 캐릭터를 전제로 한다.
- 월드 navigation은 GLB 안의 특정 node name(`land`, `road`, `building_floor`, `garage`, Hamina의 `snow`, `snowanddirt`, `navigationAnchorName`)에 의존한다.
- Hamina transition은 `currentWorld === 'nevada'`, `cameraController.state === ECHO_ORBIT`, `worldTransitioning === false` 조건에 강하게 결합되어 있다.

### 상태/입력 제약

- Pointer interaction은 `ECHO_ORBIT`와 `CHARACTER_FOCUS`에서만 시작된다.
- 자유 탐색은 빈 공간 long press만으로 진입하며 캐릭터 위 long press는 캐릭터 선택으로 남는다.
- 월드 점프는 ECHO mesh raycast hit와 canvas `dblclick`이 동시에 필요하다.
- 전환 중 `resolveWorldCursorMode()`는 `blocked`를 반환한다.
- 키보드 조작은 확인되지 않는다.
- touch-specific gesture/모바일 pinch/스와이프 처리 코드는 확인되지 않는다. Pointer Events 기반이라 브라우저 수준의 pointer event는 받을 수 있지만 별도 touch UX가 설계되어 있지는 않다.

### 성능 위험 요소

- 전체 JavaScript production chunk가 build 기준 약 923 kB minified이며 Vite가 500 kB 초과 warning을 출력한다. 현재 code splitting은 없다.
- `FaceTextureGenerator.generate()`는 768×768 pixel을 여러 번 순회하고 Canvas `getImageData`를 사용한다. 촬영 직후 UI를 block할 수 있으므로 새 얼굴 처리 연출은 비동기 흐름을 존중해야 한다.
- 인트로와 월드가 동시에 renderer/composer를 유지하는 시점이 있을 수 있다. 월드가 preloaded되는 동안 인트로가 표시되므로 GPU 메모리를 고려해야 한다.
- split portrait는 한 frame에 4개 camera를 추가 렌더링할 수 있다.
- terrain texture 및 GLB dispose는 월드/캐릭터 수명과 연결되어 있어 새 persistent object를 추가하면 dispose 누락 위험이 있다.

### 하드코딩/기대되는 외부 이름

- camera aspect 초기값 `9 / 16`
- character count `15`
- face texture resolution `768`
- long press `350ms`, click movement tolerance `6`
- 주요 world node names와 navigation anchor names
- HTML ID/class (`#stage`, `#world-canvas`, `#intro-root`, `#world-jump-overlay`, `data-world`, `data-world-hover-target`)
- asset URL이 `src/intro/config.js` 및 `src/config.js`에 문자열로 정의됨

### 기능 상태 분류

#### 구현 완료로 확인된 기능

- Vite/Three.js 런타임
- Nevada/Hamina GLB 로딩
- 캐릭터 15명 스폰 및 이동
- 얼굴 촬영, 랜드마크 검증, segmentation, 텍스처 적용
- 인트로 오디오/비디오/자막/캡처/동의 흐름
- ECHO orbit, character focus/switch/return
- empty-space long press free roam
- Nevada→Hamina world jump
- world/intro post-processing, atmosphere, dust/snow
- resize/dispose/pagehide lifecycle

#### 부분 구현 또는 추가 검증이 필요한 기능

- 오디오 자동재생 정책에 대한 fallback은 `AudioController.safePlay`에 있으나 모든 전시 브라우저에서의 실제 동작은 별도 검증이 필요하다.
- 얼굴 촬영 안내와 실패 처리는 있으나 저조도/안경/가림/다중 얼굴 등 전시 입력 조건 전체를 다루는 별도 UX는 확인되지 않는다.
- Hamina 도착 연출은 구현되어 있으나 Hamina 안에서의 추가 interaction/ending은 확인되지 않는다.
- 월드 QA query parameter는 개발용 검증 진입점이지 사용자 기능이 아니다.

#### 미구현 또는 소스에서 확인되지 않은 기능

- 서버 업로드/클라우드 저장 API
- 패스코드 또는 비밀번호 화면
- 키보드 조작
- 사용자 계정/세션 저장
- 월드 재시작/처음으로 돌아가기 UI
- Hamina 이후 명시적 엔딩/크레딧
- 별도 shader 파일 또는 shader hot reload 시스템

---

## I. How to Add a New Interaction

### 1. 먼저 요구사항을 상태와 소유자로 분해한다

새 인터랙션을 코드 작업으로 넘길 때 다음을 먼저 정한다.

```text
Trigger → 허용되는 현재 state → 입력 데이터 → 처리 owner → 시각/사운드 출력
        → 종료 조건 → 다음 state → dispose/예외 처리 → 검증 URL 또는 수동 테스트
```

예를 들어 “ECHO를 길게 누르면 특정 연출”은 단순 이벤트 추가가 아니라 다음을 결정해야 한다.

- `ECHO_ORBIT`에서만 허용할지
- 기존 free roam long press와 어떻게 구분할지
- `PointerInteractionController`가 timer를 소유할지
- `ExperienceController`가 sequence를 소유할지
- 카메라 동작이면 `CinematicCameraController`에 새 state가 필요한지
- overlay/caption/audio/postFX를 어느 owner가 호출할지

### 2. 새로운 UI 인터랙션 추가

수정 순서:

1. 기본 DOM은 `index.html`에 추가하거나, 인트로 전용이면 `IntroExperience`의 생성 함수에 추가한다.
2. UI 동작은 `src/ui/`에 작은 클래스로 분리한다. 기존 `CaptureUI`, `InteractionCursor`, `EchoProximityCaption` 패턴을 따른다.
3. 상위 조정이 필요하면 `ExperienceController`에 `bind` callback과 handler를 추가한다.
4. 스타일은 월드 UI면 `src/style.css`, 인트로 UI면 `src/intro/intro.css`에 추가한다.
5. DOM 표시 상태는 임의의 inline style보다 class/`hidden`/`aria-hidden`/`data-*`를 우선 사용한다.
6. `dispose()`에서 모든 listener를 제거한다.

재사용 구조:

- 버튼 이벤트: `CaptureUI.bind()` 패턴
- pointer hover: `InteractionCursor`
- 임시 서사 문구: `EchoProximityCaption.showOverride()` / `clearOverride()`
- 인트로 상태별 DOM: `IntroExperience.transition(next)`와 `data-intro-state`

### 3. 새로운 마우스/키보드/포인터 이벤트 추가

기존 world pointer 흐름은 `canvas → PointerInteractionController → CharacterPicker/ExperienceController → CameraController`다.

새 포인터 입력은 가능하면 `PointerInteractionController`에 추가한다.

- `handlePointerDown`: 시작 state와 대상 기록
- `handlePointerMove`: drag/gesture 중 처리
- `handlePointerUp`: click/gesture 확정 및 callback 호출
- `handlePointerCancel`: timer/transition 정리
- `INTERACTION_CONFIG`: threshold와 tolerance를 config로 이동

키보드 기능은 현재 존재하지 않으므로 새로 추가한다면 listener owner, 허용 state, focus/accessibility, pagehide 해제를 별도로 설계해야 한다. `window.addEventListener('keydown', ...)`를 `main.js`에 임시로 넣기보다 기능 소유 클래스에서 등록/해제한다.

### 4. 새로운 3D 오브젝트 추가

#### 정적/월드 오브젝트

- Nevada 전용이면 `NevadaWorld.load()` 또는 world root 아래에 추가한다.
- Hamina 전용이면 `HaminaWorld.load()`에 추가한다.
- 두 월드 공통이면 별도 world component 클래스로 만들고 `ExperienceController`가 소유한다.
- navigation obstacle/walkable에 영향을 준다면 `WorldNavigation.configure()`가 해당 object를 어떻게 분류하는지 확인한다.

#### 동적/인터랙티브 오브젝트

- 클래스 생성자는 scene/world/camera 등 명시적 dependency를 받는다.
- 매 프레임 변화는 `update(delta, elapsed)`로 만든다.
- `ExperienceController.animate()`에서 update 호출을 연결한다.
- 제거 시 geometry/material/texture/listener를 `dispose()`에서 정리한다.
- raycast 대상이면 `CharacterPicker`에 섞을지, 별도 raycaster/target collection을 둘지 결정한다. 기존 캐릭터 선택을 깨뜨리지 않도록 별도 layer 또는 target collection을 선호한다.

### 5. 새로운 캐릭터 애니메이션/행동

- 모델 clip을 추가/확인: `BaseCharacterAsset.js`
- clip 재생 API: `CharacterAnimator.play()` 또는 `hold()`
- 행동 상태: `CharacterBehavior.js` 또는 `CharacterEntity`의 상태
- 여러 캐릭터 반응: `CharacterManager.setLookingUp()`, `setFocused()`, `setWorldMode()`와 유사한 broadcast method 추가
- 월드 점프 같은 일회성 행동이면 `ExperienceController.startWorldJump()`처럼 sequence owner를 두고 `CharacterManager`에 low-level 명령만 전달한다.

### 6. 새로운 카메라 애니메이션

`CinematicCameraController`에 다음을 추가하는 방식이 안전하다.

1. 필요하면 `EXPERIENCE_STATES`에 상태 추가
2. `startNewSequence()`에서 `elapsed`, `transition`, `focused`, target 등을 초기화
3. `update(delta)`에 새 상태 branch 추가
4. 완료 시 명확한 다음 state로 `setState()` 호출
5. `ExperienceController`의 overlay/caption/postFX가 상태를 어떻게 해석하는지 확인
6. `returnToEcho()` 또는 `startEchoOrbit()`로 복귀 경로를 제공

카메라를 다른 파일에서 직접 이동시키지 않는다. 특히 `camera.position`, `camera.lookAt`, `target`, `transition`을 여러 owner가 동시에 바꾸면 보간이 깨질 수 있다.

### 7. 새로운 셰이더/화면 효과

#### 월드 효과

- `src/world/PostProcessing.js`의 `EchoGradeShader` uniform/fragment shader를 확장한다.
- `render(elapsed, state, delta)`에서 state 기반 uniform 값을 갱신한다.
- world mode 차이는 `setWorldMode()`에서 처리한다.
- `setSize()`에서 resolution uniform을 업데이트한다.
- 새 pass는 composer 순서(RenderPass → scene-dependent effects → grade → OutputPass)를 고려한다.

#### 인트로 효과

- `src/intro/VisualPostProcessing.js`의 `INTRO_POST_FX`, `DreamShader`, `createIntroPostProcessing()`을 수정한다.
- 텍스트/UI는 composer 밖이므로, 텍스트에도 효과가 필요하면 별도 canvas layer 또는 media plane으로 설계해야 한다.

#### 주의

- 이미 월드에는 bloom, grade, vignette, grain, chromatic effect가 있다. 같은 효과를 CSS와 GLSL에 중복 구현하지 않는다.
- 새 pass마다 `dispose()`와 resize 대응을 추가한다.
- 모바일/세로 화면의 render pixel budget을 넘기지 않는다.

### 8. 기존 화면 전환에 기능 삽입

- 인트로 순서에 삽입: `IntroState`, `IntroExperience.transition()`, `TIMING`, `CAPTIONS`, `IntroVisualLayer`를 함께 수정한다.
- 얼굴 전/후에 삽입: `IntroExperience.capture()`, `consent()`, `main.js onLoading`, `ExperienceController.enterWorldFromIntro()` 경계를 사용한다.
- Nevada 진입에 삽입: `ExperienceController.handleUsePhoto()` 또는 `enterWorldFromIntro()`와 `cameraController.startIntro()` 사이를 확인한다.
- 캐릭터 선택에 삽입: `ExperienceController.handleCharacterPick()`과 camera transition을 함께 확인한다.
- Hamina 점프에 삽입: `ExperienceController.startWorldJump()`의 wait/overlay/atmosphere/camera 순서를 보존한다.

각 sequence에 비동기 await가 있으므로, 중간에 사용자가 재입력할 수 있는지 `worldTransitioning`, state, busy flag로 막아야 한다.

### 9. 검증 방법을 기능과 함께 명시한다

`main.js`에 이미 개발용 진입점이 있다.

- `?worldQa`: 인트로를 건너뛰고 world QA
- `?orbitQa`: ECHO orbit QA
- `?focusQa=<characterId>`: 특정 character focus QA
- `?jumpQa`: world jump QA
- `?longPressQa`: long press QA
- `?introHandoffQa`: 얼굴 적용을 생략한 intro handoff QA
- `?narration2Qa`: narration 2부터 시작하는 QA
- `?switchQa`: character switch QA 지원 초기화

새 기능에도 가능한 경우 전용 query QA를 추가하고, production에서 활성화되지 않도록 `import.meta.env.DEV` 조건을 유지한다.

---

## J. Development & Verification

### 실행

```bash
npm install
npm run dev
```

기본 개발 서버:

```text
http://127.0.0.1:5176/
```

`index.html`은 `file:` 프로토콜로 직접 열면 `http://127.0.0.1:5176/`로 이동시킨다. 카메라 기능은 HTTPS 또는 localhost 계열 환경에서 사용해야 한다.

### 빌드

```bash
npm run build
```

확인된 build 결과는 Vite production build 성공이다. 현재 build 시 JavaScript chunk가 500 kB를 초과한다는 warning이 있으며, 이는 build 실패가 아니다.

### 현재 제공되는 검사/QA

- 자동화된 unit/e2e test script는 `package.json`에서 확인되지 않는다.
- 개발 query parameter 기반 smoke/연출 QA가 `src/main.js`, `ExperienceController.runLongPressQa()`에 있다.
- browser에서 카메라 권한, 오디오 gesture, WebGL, 세로 화면을 수동으로 확인해야 한다.

### 새 기능 후 체크리스트

1. `npm run build` 성공 여부
2. 최초 진입 인트로가 정상적으로 시작되는지
3. 카메라 권한 허용/거부/재촬영
4. 얼굴 검증 성공/실패
5. 얼굴 적용 후 캐릭터 15명 표시
6. ECHO orbit → 캐릭터 focus → switch → return
7. long press free roam이 캐릭터 클릭을 방해하지 않는지
8. ECHO double click과 일반 빈 공간 입력이 충돌하지 않는지
9. Nevada→Hamina 전환 중 중복 입력이 막히는지
10. resize/세로 화면/낮은 pixel ratio
11. pagehide/새로고침 시 media stream, renderer, listener가 정리되는지
12. 새 geometry/material/texture/observer/RAF의 dispose가 있는지

### 화면 비율/기기 대응

- 디자인 기준은 세로 9:16이다.
- world camera와 intro composition 모두 portrait를 우선한다.
- `ResizeObserver`, renderer pixel ratio 제한, texture crop/fitting을 통해 다른 크기에 대응한다.
- 가로 화면에서의 최종 디자인은 별도 보장되지 않으므로, 새 UI는 stage 내부 세로 레이아웃을 기준으로 설계한다.

---

## K. AI Collaboration Guidelines

앞으로 ChatGPT가 Codex에 전달할 개발 프롬프트는 아래 형식을 따르는 것이 좋다.

### 프로젝트 전용 지침

1. 기존 아키텍처를 유지한다. `ExperienceController`, `IntroExperience`, `CinematicCameraController`, `PointerInteractionController`, `CharacterManager`의 역할을 우회하지 않는다.
2. 불필요한 대규모 재작성이나 프레임워크 도입을 하지 않는다. 현재의 ES module, class, callback, `update(delta)` 패턴을 우선 사용한다.
3. 기존 인터랙션을 훼손하지 않는다. 새 입력은 허용 state와 기존 pointer timer/double click을 먼저 확인한다.
4. 현재 설치된 `three`와 `@mediapipe/tasks-vision` 및 기존 post-processing 구조를 우선 활용한다.
5. 새 기능의 영향을 받는 파일을 하나만 수정한다고 가정하지 않는다. state, controller, CSS/HTML, asset config, dispose, QA 경로를 함께 검토한다.
6. 새 카메라 연출은 `CinematicCameraController` 상태와 `update(delta)`에 연결하고, 직접적인 다중 camera mutation을 피한다.
7. 새 shader/pass는 월드용 `PostProcessing.js`와 인트로용 `VisualPostProcessing.js` 중 정확한 레이어에 추가한다.
8. 새 3D object/texture/audio/video는 `public/` 저장 위치, loader, config URL, preload, dispose를 함께 정의한다.
9. 서버 업로드나 개인정보 저장을 추가한다고 추정하지 않는다. 현재 얼굴 처리는 브라우저 메모리 기반이다.
10. 코드에 존재하지 않는 기능을 현재 기능처럼 문서화하지 않는다. 패스코드, 키보드, 엔딩 등은 제안/미구현으로 명시한다.
11. 모든 비동기 sequence에 성공·실패·중복 입력·취소 경로를 지정한다.
12. 구현 후 `npm run build`와 관련 QA query/manual flow를 실행하고 결과를 보고한다.

### Codex에 전달할 권장 프롬프트 형식

```text
목표:
- 어떤 사용자가 어떤 입력으로 무엇을 작동시키는지

허용 상태:
- ECHO_ORBIT, CHARACTER_FOCUS 등

기대 결과:
- 카메라 / 캐릭터 / DOM UI / 사운드 / post-processing

영향 가능 파일:
- 실제 파일 경로와 수정 이유

구현 제약:
- 기존 인터랙션 유지
- 새 state 또는 기존 state 재사용 여부
- 성능/세로 비율/dispose 요구

검증:
- npm run build
- 수동 시나리오 또는 ?qaParameter
```

---

## 분석 범위와 한계

### 실제로 확인한 범위

- `src/`에 있는 모든 애플리케이션 JavaScript, CSS 파일의 파일 목록과 주요 export/class/function
- 핵심 파일의 전체 또는 관련 함수 구현
- `index.html`의 DOM 구조와 overlay/canvas ID
- `package.json`의 scripts와 dependencies
- `README.md`의 실행 및 입력 설명
- `public/`의 모델·텍스처·영상·오디오·MediaPipe 파일 경로
- 개발용 QA query parameter와 빌드 명령

### 의도적으로 분석하지 않은 범위

- `node_modules/` 내부 소스
- `dist/`의 생성 산출물
- `package-lock.json` 내부 의존성 metadata
- GLB/MP4/PNG/MP3의 픽셀·폴리곤·오디오 내용 자체에 대한 시각/청각 QA
- 실제 전시 장비에서의 브라우저 권한, GPU 성능, 모바일 호환성 실측
- Git history, 외부 디자인 원본, 기획서 등 현재 workspace에 없는 자료

### 문서의 한계

이 문서는 코드 구조와 확인 가능한 런타임 관계를 정리한 기술 문서다. 실제 체감되는 모션 품질, 에셋의 미학적 의도, 전시 운영 정책, Hamina 이후의 기획적 엔딩은 소스만으로 완전히 확정할 수 없다. 따라서 새 기능을 구현하기 전에는 이 문서의 상태/파일 관계를 기준으로 설계하되, 최종 의도와 시각 품질은 실제 브라우저에서 확인해야 한다.
