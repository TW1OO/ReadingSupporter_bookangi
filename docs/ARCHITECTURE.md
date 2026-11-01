# 아키텍처

```
front/ (Vite+React+TS)            back/ (FastAPI)
 viewer(mouse) ─┐                 services/hand  (MediaPipe, 팀원 구현)
 front/state ◀─ InputEvent ─┴─ services/gaze  (gazer, 팀원 구현)
 modules/lookup ── fetch /api ──>  services/dictionary  사전 조회 (키는 서버에만)
 modules/llm ──── SSE /api/llm ──>  services/llm  로컬 LLM(EXAONE GGUF, GPU 서버 전용. docs/LLM_SERVER.md)
```

## 규칙
- hand <-> gaze 상호 import 금지(back/services). front로는 `shared/events.ts`의 InputEvent 형태로만 전달.
- `state/machine.ts`는 순수 함수. 웹캠 없이 테스트.
- 프론트-백 계약은 `front/src/shared/api.ts` <-> `back/app/schemas.py`. 바꿀 때 양쪽 동시 수정.
- 형태소 분석기·사전은 `back/app/services/*` 뒤에 숨겨 교체 가능하게 한다.
