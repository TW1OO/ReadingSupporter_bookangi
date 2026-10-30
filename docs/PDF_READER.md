# PDF 리더 (front/src/pdf-reader)

PDF를 열고 단어를 선택하면 뜻·해설·예시를 보여주는 화면. 접속: `http://localhost:5173/` (기본 화면)
(시선 데모는 `/?gaze`, 기존 샘플 화면은 `/?legacy`.)

## 실행
```bash
cd front && npm install
npm run dev:full      # PDF 프록시(8001) + Vite(5173). 링크로 PDF 열기까지 쓸 때
npm run dev           # Vite 만. 파일 업로드/드래그로만 열 때
cd back && uvicorn app.main:app --reload   # 사전 조회(/api/lookup)
```

## 포크 구조에 맞추며 바꾼 점
- 위치: 저장소 루트가 아니라 `front/` 안. 기존 `modules/hand`, `modules/gaze`, `state` 는 건드리지 않았다.
- 전역 CSS(`styles.css`)는 `?pdf` 일 때만 lazy 로드. 정적 import 하면 body/button/header 스타일이 다른 화면까지 바뀐다.
- MediaPipe: CDN wasm(0.10.14) → 로컬 `public/mediapipe/wasm`(포크의 1.1.1과 항상 같은 버전), 얼굴 모델도 로컬 `face_landmarker.task`. 오프라인 부스에서도 동작.
- Vite 프록시: `/api/pdf-proxy` 를 `/api` 보다 먼저 둔다(순서가 바뀌면 FastAPI 404).
- `tsconfig`: `allowJs` 추가(JS/JSX 파일을 strict TS 프로젝트에서 import 하기 위해).
- `lib/dictionary.js`: 실제 라우터 응답(우리말샘/DeepL/not_found/error)을 모두 처리. 서버 오류를 "백엔드 미연결 데모 데이터"로 덮지 않는다.
- 손 포인터: 프레임마다 전체 리렌더하던 것을 DOM 직접 갱신으로 변경. 가장자리 여백 보정 + 평활화 + "포인터가 움직이면 유지 시간 재시작".
- PDF 프록시: IPv6 `[::1]`/IPv4-mapped 주소 차단 보강, CORS `*` 제거.

## 남은 일 / 알려진 한계
- 이 화면의 손·시선은 자체 훅(`hooks/useHandGestures.js`, `useGazeTracker.js`)이다. 팀 설계(손/시선은 `InputEvent`만 `state` 로 전달)와 달라 중복이 있다.
  `modules/hand`(자세 안내·worldLandmarks 기반 판정)와 `modules/gaze`(보정·One Euro)가 더 정확하므로, 이후 `startHandInput` / `GazeController` 로 교체 권장.
  단, PDF 텍스트 레이어는 단어가 아니라 텍스트 조각 단위라 `data-word-id` 단어 분할이 먼저 필요하다.
- 백엔드 라우터 응답 형태와 `schemas.py`(LookupResponse)가 다르다. 프론트 어댑터가 둘 다 받지만 계약은 한쪽으로 맞추는 게 좋다.
