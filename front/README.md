# Book항이 (React)

시선 및 제스처 기반 맞춤형 독서 보조 서비스 — PDF 뷰어 프론트엔드.
`bookhang_mediapipe_frontend.html` 을 React(Vite)로 분리·이식한 프로젝트입니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173  (카메라는 localhost 또는 HTTPS에서만 동작)
npm run build
```

## 구조

```
src/
├─ App.jsx                  상태 총괄(문서/배율/회전/검색/시선/팝업)
├─ styles.css               원본 CSS 그대로 (id/class 유지)
├─ components/
│  ├─ Header.jsx            상단 바(테마, PDF 열기)
│  ├─ Sidebar.jsx           시선 카드 + 페이지 썸네일
│  ├─ Thumbnail.jsx         화면에 보일 때만 렌더링(IntersectionObserver)
│  ├─ Toolbar.jsx           페이지 이동·줌·회전·검색·인쇄·다운로드
│  ├─ SearchBar.jsx
│  ├─ PdfViewer.jsx         canvas + 텍스트 레이어 + 시선 오버레이 (ref.updateGaze)
│  ├─ WordPopup.jsx         단어 선택 시 뜻/해설/예시 팝업
│  ├─ StatusBar.jsx / DropOverlay.jsx
├─ hooks/
│  ├─ useGazeTracker.js     카메라 + MediaPipe Face Landmarker
│  ├─ usePdfSearch.js       문서 전체 검색(디바운스·취소 처리)
│  └─ useFileDrop.js        PDF 드래그&드롭
└─ lib/
   ├─ pdf.js                pdf.js 초기화/유틸
   ├─ gaze.js               홍채 기반 시선 추정·스무딩
   ├─ dictionary.js         ★ 단어 조회 어댑터 (백엔드 연동 지점)
   └─ text.js
```

## 연동 포인트

- **단어 사전/형태소 분석 API**: `lib/dictionary.js`의 `lookupWord(word)` 내부만 `fetch`로 교체하세요.
  반환 형태 `{ part, meaning, explanation, examples[] }` 를 유지하면 UI는 그대로 동작합니다.
- **시선 보정(calibration)**: `lib/gaze.js`의 `estimateGaze`가 현재는 고정 상수 기반 근사치입니다.
- **설정/도움말**: 지금은 `alert()` 데모입니다. `App.jsx`의 `onSettings`, `onHelp`에서 모달로 교체하면 됩니다.

## 원본과 달라진 점

- 시선 좌표는 프레임마다 들어오므로 React state를 거치지 않고 `PdfViewer`의 ref(`updateGaze`)로 DOM을 직접 갱신합니다(리렌더 방지).
- 검색: 입력 디바운스(250ms) + 이전 검색 취소 처리, 현재 페이지에서 검색어가 포함된 텍스트 조각을 노란색으로 표시(원본은 표시 없음).
- 썸네일: 원본은 전 페이지를 순차 렌더링, 여기서는 보이는 썸네일만 렌더링.
- 페이지/줌/회전 변경 시 단어 팝업이 자동으로 닫힘.

## 외부 PDF 링크 열기 (CORS 프록시)

브라우저는 다른 도메인의 PDF를 직접 읽지 못할 수 있습니다. 이 프로젝트는 로컬 Node.js 프록시를 통해 공개 PDF를 가져옵니다.

1. Node.js 18 이상을 설치합니다.
2. 프로젝트 폴더에서 `npm install`을 실행합니다.
3. `npm run dev`를 실행하면 PDF 프록시와 Vite 개발 서버가 함께 시작됩니다.
4. 브라우저에서 `http://localhost:5173`을 열고 PDF 링크를 입력합니다.

프록시만 별도로 실행하려면 `npm run proxy`, 프런트엔드만 실행하려면 `npm run dev:web`을 사용하세요.

프록시는 공개 HTTP/HTTPS 주소만 허용하고, 내부 네트워크 주소를 차단하며, PDF 파일 크기는 50MB로 제한합니다. 로그인/권한이 필요한 문서와 일부 공유 서비스 링크는 지원되지 않을 수 있습니다. 배포할 때는 `server/pdf-proxy.js`를 별도 서버로 배포하고, 공개 접근 제어·요청 제한·도메인 허용 정책을 추가하세요. 이 프록시는 외부 주소의 내용을 서버에서 가져오므로 신뢰할 수 있는 사용자에게만 노출해야 합니다.


## 손동작 제어
- PDF를 연 뒤 화면 오른쪽 아래의 **손 인식 켜기**를 누르고 카메라 권한을 허용합니다.
- 검지 하나를 펴고 PDF의 단어를 가리킨 뒤 약 0.7초 유지하면 해당 단어의 뜻 팝업이 열립니다.
- 팝업이 열린 상태에서 손가락 1개는 뜻, 2개는 해설, 3개는 예문 탭을 선택합니다.
- 손동작 인식은 `@mediapipe/tasks-vision`과 `public/mediapipe/hand_landmarker.task`를 사용합니다. MediaPipe WASM 파일은 jsDelivr에서 로드됩니다.
- 카메라 기능은 `localhost` 또는 HTTPS에서 사용해야 합니다.

## PDF URL 불러오기
- 시작 화면의 URL 입력란에 공개 PDF 직접 링크를 입력할 수 있습니다.
- Google Drive 링크는 파일 공유 권한이 '링크가 있는 사용자'로 설정되어 있어야 합니다.
- 외부 URL 가져오기는 로컬 PDF 프록시 서버를 사용합니다.
