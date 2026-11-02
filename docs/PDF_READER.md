# 리더 화면 (front/src/pdf-reader)

PDF나 웹 글을 열고 단어를 선택하면 뜻·해설·예시를 보여주는 화면. 접속: `http://localhost:5173/` (기본 화면)
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
- 시선: 시선 보정을 마친 뒤에 켜지며, 옅은 히트맵으로 시선을 따라간다. 뷰어에 들어오면 보정 안내와 손 인식이 자동으로 시작된다. 지표 전송은 `/?gaze` 데모에서만 한다.
- 보안: `pdfjs-dist` 4.x(GHSA-wgrm-67xf-hhpq 패치) + `isEvalSupported: false`.
- PDF 프록시: 사설망 주소 차단, 50MB 제한, 한글 파일명은 RFC 5987로 전달.
- MediaPipe: 로컬 wasm(`public/mediapipe/wasm`)과 모델을 쓴다. 오프라인 부스에서도 동작.

## 읽기 화면
- 웹 글과 PDF가 같은 틀을 쓴다(`components/ReaderChrome.jsx`): 위에서 내려오는 머리글과 ⋮ 메뉴, 왼쪽 읽기 도구 패널, 아래 쪽 이동 막대, 오른쪽 위 시선·손 상태 표시.
- 얼굴이 벗어나면 안내와 위치 그림을 보여 주고, 돌아오면 저절로 닫는다. PDF는 쪽 맞춤으로 열고 이동 막대에서 확대·회전한다.
- 시선 보정 안내는 `CalibrationOverlay`의 `variant="reader"`로 카메라, 조명, 손 위치를 확인한다.

## 패드 (768~1279px)
- 웹 글은 가로 화면에서 양쪽 펼침, 세로 화면에서 한쪽으로 보여 준다(`lib/articleLayout.js`). 글자 크기는 `styles.css`의 패드 구간에서 정한다.
- PDF 쪽 맞춤은 `#stage`의 CSS 여백을 읽어 계산하고, 직접 확대·축소하기 전까지는 화면을 돌리거나 쪽을 넘기면 다시 맞춘다.
- 터치 크기와 조정 단추는 화면 폭이 아니라 `pointer:coarse`로 적용한다. 터치 PC에도 같이 적용된다.

## 휴대폰 (터치 기기, 폭 767px 이하 또는 높이 500px 이하)
- 뷰어에 들어가도 시선 보정과 손 인식을 자동으로 켜지 않고 터치로 읽는다(`lib/device.js`). 읽기 도구 패널에서 직접 켤 수는 있다. PC 창을 좁게 줄인 경우는 해당하지 않는다.
- 쪽 이동 막대는 이전, 쪽 번호, 다음, 더보기로 줄이고 나머지는 더보기로 접는다.
- 머리글은 작은 막대로 늘 보이고, 상태 표시는 숨긴다. 왼쪽 위 단추로 읽기 도구를 열고 접으며, 패널 머리에는 홈 단추를 둔다. 홈에서는 `시연 자료 열기`를 맨 위에 둔다.
- 터치 기기에서는 읽는 중 좌우로 밀면 쪽을 넘긴다(`lib/swipe.js`). 확대해서 가로로 스크롤되는 PDF에서는 동작하지 않는다.
- 단어를 탭하면 조정 단추가 쪽 이동 막대 자리에 나오고, 확정하면 뜻이 화면 아래 시트로 올라온다. 시트 바깥을 누르면 닫힌다.
- PDF는 쪽 맞춤으로 열되, 휴대폰 가로 화면에서만 너비에 맞추고 터치로 스크롤한다(`lib/pageFit.js`).

## 웹 글 읽기
- 링크로 연 웹 페이지는 `server/pdf-proxy.js`의 `/api/page-proxy`로 받아 Readability로 본문을 뽑고, `components/ArticleViewer.jsx`가 글자만 그려 양쪽 펼침으로 보여 준다. 원본 HTML은 화면에 넣지 않는다. 그림과 그림 설명은 표시하지 않는다(`removeImageBoxes`).
- 홈의 `시연 자료 열기`는 `Landing.jsx`의 `DEMO_ARTICLE_URL` 기사를 연다. 기사 글을 저장소에 넣지 않고 열 때마다 원문에서 불러오므로 인터넷과 프록시가 필요하다. 공개 시연 전에 이용 허락을 확인한다.
- 프록시는 로컬 전용이다. 공개 배포하려면 인증과 호출 제한이 필요하다. 접근을 막은 사이트를 우회하지 않는다.

## 남은 일 / 알려진 한계
- 해설·예시: 서버의 로컬 LLM으로 마지막에 연동한다. `POST /api/explain`과 화면은 연결돼 있고, `back/app/services/explain.py`의 `generate_explanation`만 채우면 된다. 지금은 `status: "unavailable"`을 돌려준다.
- 백엔드 라우터 응답 형태와 `schemas.py`(LookupResponse)가 다르다. 프론트 어댑터가 둘 다 받지만 계약은 한쪽으로 맞추는 게 좋다.
- 스캔 PDF처럼 글자 정보가 없는 문서는 단어를 고를 수 없다.
