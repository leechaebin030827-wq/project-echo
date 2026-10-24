# PROJECT ECHO

Three.js 기반 세로형 인터랙티브 전시입니다. Nevada, Hamina, Pacific Light Cable 세 월드를 한 번의 관람에서 방문하며, 순서는 매 실행마다 달라집니다. 첫 월드는 Nevada 또는 Hamina입니다.

## 실행

```bash
npm install
npm run dev
```

기본 로컬 주소는 `http://127.0.0.1:5176/`입니다. 배포용 검사는 `npm run build`, 전체 테스트는 `npm test`로 실행합니다. 웹캠 사용에는 `localhost` 또는 HTTPS가 필요합니다.

## 코드 위치

| 영역 | 위치 | 담당 |
|---|---|---|
| 전체 흐름 | `src/app/ExperienceController.js` | 관람 상태, 월드 전환, 공통 도착 절차 |
| 월드 방문 순서 | `src/app/WorldRoute.js` | 방문 순서 생성 및 개발용 순서 지정 |
| 월드 문구·표시 | `src/content/WorldPresentation.js` | 진입 지명, 기본 자막, 날씨 종류 |
| 인물·의식 대사 | `src/content/WorldNarration.js` | 인물 대화와 태평양 진입 자막 |
| 오브젝트 대사·자료 | `src/content/NevadaInteractions.js`, `HaminaInteractions.js` | 지역별 호버·대사·자료 카드 |
| 공통 UI 문구 | `src/content/WorldUiCopy.js` | 이동·사진 보관함·귀환·커서 |
| 공통 3D 기능 | `src/world/shared/` | ECHO, 하늘, 조명, 날씨, 후처리, 이동 |
| Nevada | `src/world/nevada/` | Nevada 모델과 지형 연출 |
| Hamina | `src/world/hamina/` | Hamina 모델, 숲, 바다, 카운트다운 |
| Pacific Light Cable | `src/world/pacific/` | 수면·심해·케이블 경로·해저 지형 |
| 카메라 연출 | `src/camera/` | 기본 카메라 상태와 오브젝트별 샷 |
| 관람객·얼굴 | `src/characters/`, `src/face/` | 캐릭터와 얼굴 합성·브라우저 사진 보관 |
| 입력·오브젝트 대사 | `src/interaction/` | 포인터 입력과 월드 상호작용 |
| 인트로·음악·화면 | `src/intro/`, `src/audio/`, `src/ui/` | 월드 진입 전 연출, 오디오, DOM UI |
| 월드 나레이션 음원 | `public/audio/echo/`, `src/content/echoAudioCueMap.js`, `src/audio/EchoCuePlayer.js` | 91개 대사별 MP3와 장면별 재생 |

새 월드 전용 구현은 해당 월드 폴더에, 둘 이상에서 실제로 쓰는 3D 기능은 `src/world/shared/`에 둡니다. 월드 문구는 `src/content/`에서 관리하고, 카메라 타이밍이나 전환 순서는 `ExperienceController.js`와 `src/camera/`에서 관리합니다. 오프닝 문구는 `src/intro/config.js`에 둡니다. 상세 파일 지도는 [프로젝트 구조](docs/PROJECT_STRUCTURE.md)에 있습니다.

관람객 사진은 이 브라우저의 IndexedDB에 저장됩니다. 촬영·합성 처리는 브라우저에서 실행됩니다.

월드 나레이션 큐와 자막의 대응은 `npm run test:audio`로 확인합니다. 녹음 언어와 대사별 ID는 [나레이션 녹음 목록](docs/NARRATION_RECORDING_LANGUAGE_LIST.md)에 정리되어 있습니다.

## 개발자 단축키

개발 서버에서 백틱(`) 키로 단축키 안내를 열 수 있습니다. `'`는 촬영 진입, `1`/`2`/`3`은 Nevada/Hamina/Pacific 즉시 진입, `O`는 오비트, `J`는 다음 월드, `D`는 Data Center, `M`은 Nevada Money, `F`는 Nevada A01 얼굴 포커스입니다. 상세 단축키는 개발 모드에서만 작동합니다.
