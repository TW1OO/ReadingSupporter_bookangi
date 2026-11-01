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
- 시선: "시선 보정"을 마친 뒤에만 켜지며 줄 수준으로 강조한다. 지표 전송은 `/?gaze` 데모에서만 한다.
- 보안: `pdfjs-dist` 4.x(GHSA-wgrm-67xf-hhpq 패치) + `isEvalSupported: false`.
- PDF 프록시: 사설망 주소 차단, 50MB 제한, 한글 파일명은 RFC 5987로 전달.
- MediaPipe: 로컬 wasm(`public/mediapipe/wasm`)과 모델을 쓴다. 오프라인 부스에서도 동작.

## 웹 글 읽기
- 링크로 연 웹 페이지는 `server/pdf-proxy.js`의 `/api/page-proxy`로 받아 Readability로 본문을 뽑고, `components/ArticleViewer.jsx`가 글자만 그려 양쪽 펼침으로 보여 준다. 원본 HTML은 화면에 넣지 않는다. 그림은 표시하지 않는다.
- 프록시는 로컬 전용이다. 공개 배포하려면 인증과 호출 제한이 필요하다. 접근을 막은 사이트를 우회하지 않는다.

## 남은 일 / 알려진 한계
- 해설·예시: 서버의 로컬 LLM으로 마지막에 연동한다. `POST /api/explain`과 화면은 연결돼 있고, `back/app/services/explain.py`의 `generate_explanation`만 채우면 된다. 지금은 `status: "unavailable"`을 돌려준다.
- 백엔드 라우터 응답 형태와 `schemas.py`(LookupResponse)가 다르다. 프론트 어댑터가 둘 다 받지만 계약은 한쪽으로 맞추는 게 좋다.
- 스캔 PDF처럼 글자 정보가 없는 문서는 단어를 고를 수 없다.
