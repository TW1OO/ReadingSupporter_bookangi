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

## 구조
- 위치: `front/src/pdf-reader`. 스타일(`styles.css`)은 전역이라 PDF 리더 화면에서만 lazy 로드한다.
- 입력: 손은 `modules/hand`, 시선은 `modules/gaze`, 마우스 드래그까지 모두 `InputEvent`로 `modules/state`에 보낸다. 단어 팝업의 탭도 `state.choice`를 따른다.
- 단어 스냅: PDF 텍스트 레이어는 조각 단위라 `lib/textLayout.js`로 단어를 나누고 `PdfViewer`가 단어 사각형을 손 모듈에 준다.
- 시선: "시선 보정"을 마친 뒤에만 켜지며 줄 수준으로 강조한다. 지표 전송은 `/?gaze` 데모에서만 한다.
- 보안: `pdfjs-dist` 4.x(GHSA-wgrm-67xf-hhpq 패치) + `isEvalSupported: false`.
- PDF 프록시: 사설망 주소 차단, 50MB 제한, 한글 파일명은 RFC 5987로 전달.
- MediaPipe: 로컬 wasm(`public/mediapipe/wasm`)과 모델을 쓴다. 오프라인 부스에서도 동작.

## 남은 일 / 알려진 한계
- 백엔드 라우터 응답 형태와 `schemas.py`(LookupResponse)가 다르다. 프론트 어댑터가 둘 다 받지만 계약은 한쪽으로 맞추는 게 좋다.
- 스캔 PDF처럼 글자 정보가 없는 문서는 단어를 고를 수 없다.
