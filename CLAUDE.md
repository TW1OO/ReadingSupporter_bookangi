# Book항이 (ReadingSupporter_bookangi)

시선(아이트래킹)과 손동작(핸드트래킹)으로 전자책 속 모르는 단어를 찾아주는 한국어 독서 보조 서비스.
2026 DevDay(동아대 소프트웨어혁신센터) AI·SW 기초 트랙 출품작. 팀 Book항이(6명). 사용자는 한국어로 짧고 직접적인 답변을 선호하고, 기술 선택의 이유를 함께 설명해 주길 원한다.

## 일정
- 포스터 제출 10/28 18:00 (공식), 행사 11/04 10:00~15:00 S06-607호 (공식)
- 마일스톤(제안): ~10/30 1~2단계, ~11/02 3~4단계, 11/03 리허설

## 구조
- `front` Vite + React + TS. `src/modules/{viewer,state,lookup}`, `src/ui`, `src/shared`(모듈 간 계약). 웹캠 프레임/입력은 back과 통신
- `back` FastAPI. `app/{routers,services}`; `services/{hand,gaze}`(MediaPipe·gazer, 팀원 구현), 사전 조회 (키는 서버에만)
- 상세: `docs/ARCHITECTURE.md`, `docs/STAGES.md`, `docs/BRANCHING.md`

## 설계 규칙
- 손(hand)과 시선(gaze) 모듈(back)은 서로를 모른다. 둘 다 `InputEvent`만 `state`에 보낸다.
- `state/machine.ts`는 순수 함수(reducer)로 유지하고 웹캠 없이 테스트한다.
- 시선 오차가 약 100px로 크므로 시선은 문단·줄 수준 보조 입력이다. 단어 지정은 손 포인팅 + 가까운 단어 스냅이 맡는다.
- 시선이 늦어져도 2단계(손 단독) 데모가 항상 돌아가야 한다.
- 손 제스처는 유지 시간(hold)으로 안정화한다. 메뉴: 손가락 1=뜻, 2=해설, 3=검색(예시), 주먹=취소.
- 한국어 활용형은 원형으로 복원한 뒤 사전을 조회한다. "세계 최초" 같은 주장은 하지 않는다(한국어용 직접 구현·평가가 강조점).
- 전자책 샘플은 공개 도메인이나 자작 글만 쓴다.

## 개발 단계
1. 마우스 클릭 조회 → 2. 손 포인팅·번호 메뉴·주먹 취소 → 3. 시선 문단 추정·어려운 단어 강조 → 4. 원형 복원·난이도 지표

## 미정 (결정 필요)
- 형태소 분석기 선택, 담당자 배정
- 해설은 서버의 로컬 LLM으로 마지막에 연동 (`back/app/services/explain.py`, 지금은 빈 자리)

## 명령어
- 프론트: `cd front && npm install && npm run dev | typecheck | test | build`
- 백: `cd back && pip install -r requirements.txt && uvicorn app.main:app --reload && pytest`
- 커밋: `feat:` `fix:` `docs:` `chore:`, PR로만 main 병합
