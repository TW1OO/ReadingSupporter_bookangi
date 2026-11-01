# Book항이 (ReadingSupporter_bookangi)

시선(아이트래킹)과 손동작(핸드트래킹)으로 전자책 속 모르는 단어를 찾아주는 한국어 독서 보조 서비스.
2026 DevDay(동아대 소프트웨어혁신센터) AI·SW 기초 트랙 출품작. 팀 Book항이(6명). 사용자는 한국어로 짧고 직접적인 답변을 선호하고, 기술 선택의 이유를 함께 설명해 주길 원한다.

## 일정
- 포스터 제출 10/28 18:00 (공식), 행사 11/04 10:00~15:00 S06-607호 (공식)
- 마일스톤(제안): ~10/30 1~2단계, ~11/02 3~4단계, 11/03 리허설

## 구조
- `front` Vite + React + TS. `src/pdf-reader`(기본 화면), `src/modules/{hand,gaze,state}`(손·시선은 브라우저 MediaPipe, 웹캠 영상은 서버로 보내지 않음), `src/shared`(모듈 간 계약), `server`(글·PDF 프록시)
- `back` FastAPI. `app/{routers,services}`; 사전·번역·형태소·해설 (키는 서버에만)
- 상세: `README.md`, `docs/ARCHITECTURE.md`, `docs/STAGES.md`, `docs/BRANCHING.md`

## 설계 규칙
- 손(hand)과 시선(gaze) 모듈(front)은 서로를 모른다. 바깥으로는 `InputEvent`나 콜백만 내보내고 앱이 연결한다.
- `state/machine.ts`는 순수 함수(reducer)로 유지하고 웹캠 없이 테스트한다.
- 시선 오차가 약 100px로 크므로 시선은 문장과 후보 단어를 대략 잡는 데 쓴다. 정확한 단어 지정은 제스처 조정이 맡는다. 흐름과 제스처 기준은 `docs/INTERACTION.md`.
- 시선을 쓸 수 없어도 데모가 돌아가야 한다(마우스로 대신 지정 + 제스처).
- 손 제스처는 유지 시간(hold)으로 안정화한다. 메뉴: 손가락 1=단어 뜻 해석, 2=문장 해설, 3=LLM 검색. 주먹=그만두기, 손 펴고 흔들기=결과 닫기.
- 한국어 활용형은 원형으로 복원한 뒤 사전을 조회한다. "세계 최초" 같은 주장은 하지 않는다(한국어용 직접 구현·평가가 강조점).
- 전자책 샘플은 공개 도메인이나 자작 글만 저장소에 둔다. 저작권이 있는 글은 저장하지 않고 원문에서 불러온다.

## 개발 단계
1. 마우스 클릭 조회 → 2. 시선 문장 지정·제스처 단어 조정·메뉴 → 3. 어려운 단어 강조 → 4. 원형 복원·난이도 지표

## 남은 연동
- API 키와 로컬 LLM(`back/app/services/explain.py`, 지금은 빈 자리), 서버 배포는 팀장 담당

## 명령어
- 프론트: `cd front && npm install && npm run dev | dev:full | typecheck | test | build` (`dev:full`은 프록시 포함)
- 백: `cd back && pip install -r requirements.txt && uvicorn app.main:app --reload && pytest`
- 커밋: `feat:` `fix:` `docs:` `chore:`, PR로만 main 병합
