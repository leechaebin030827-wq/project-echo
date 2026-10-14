# ECHO — Nevada

`Nevada.glb`, PROJECT ECHO의 월드 처리 원칙, Character Face Kit을 하나의 Three.js 런타임으로 통합한 세로형 전시 경험입니다.

## 실행

```bash
npm install
npm run dev
```

카메라는 HTTPS 또는 `localhost`에서만 사용할 수 있습니다. 얼굴 프레임, 랜드마크, 생성 텍스처는 브라우저 메모리 안에서만 처리되며 서버 업로드 코드는 없습니다.

## 입력

- 캐릭터 짧게 클릭: 해당 인물 추적
- 추적 중 같은 캐릭터 클릭: ECHO orbit 복귀
- 추적 중 다른 캐릭터 클릭: 인물 간 직접 전환
- ECHO orbit 중 빈 공간을 누른 채 350ms 이상 유지하고 드래그: 자유 부유 탐색
- 마우스/포인터 놓기: ECHO orbit 복귀

## 런타임 구조

- Three.js `Scene` 1개
- `PerspectiveCamera` 1개 (`aspect = 9 / 16`)
- `WebGLRenderer` 1개
- `renderer.setAnimationLoop()` 1개

Nevada의 원본 geometry, transform, material은 유지됩니다. 런타임에서는 조명, 안개, 절차적 하늘, 가벼운 눈 파티클, 미세한 grain/vignette/chromatic grade만 추가합니다.
