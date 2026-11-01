# 아키텍처

손과 시선은 브라우저에서 처리합니다. 웹캠 영상은 서버로 보내지 않습니다.

```
브라우저 (front, Vite+React+TS)                        서버
 modules/hand ──┐
 modules/gaze ──┼─ InputEvent ─> modules/state ─> pdf-reader 화면
 마우스·키보드 ──┘                                  │
                                                   ├─ /api/lookup, /api/explain, /api/llm ─> back (FastAPI)
                                                   └─ /api/page-proxy, /api/pdf-proxy ─> front/server (Node)
```

## 프론트 (`front/src`)
| 위치 | 역할 |
|---|---|
| `pdf-reader/` | 기본 화면. 앱이 손·시선·뷰어를 연결한다 (`PdfReaderApp.jsx`) |
| `modules/hand/` | MediaPipe 손 인식, 제스처 판정 (`HAND_PORTING.md`) |
| `modules/gaze/` | MediaPipe 얼굴 인식, 시선 회귀, 보정, 오토 프레이밍, 단어 확정 보정 |
| `modules/state/` | 입력 상태 머신 (`idle`, `adjusting`, `menu`, `result`) |
| `shared/` | 모듈 간 계약. `events.ts`(InputEvent), `api.ts`(프론트-백), `camera.ts`(카메라 요청) |
| `modules/viewer`, `modules/lookup`, `ui/`, `App.tsx` | `/?legacy` 초기 샘플 화면 |
| `GazeDemo.tsx` | `/?gaze` 시선 실험 화면 |
| `modules/llm/`, `LlmDemo.tsx` | `/?llm` 로컬 LLM 테스트 화면 (SSE 스트리밍 채팅) |

## 서버
| 위치 | 역할 |
|---|---|
| `back/app/routers/` | `POST /api/lookup`, `POST /api/explain`, `/api/llm/*`(상태, 로드, 채팅, 풀이), `/api/gaze/metrics`, `GET /api/health` |
| `back/app/services/` | `morph.py`(원형 복원, Kiwi), `dictionary.py`(우리말샘), `translator.py`(DeepL), `llm.py`(EXAONE GGUF 엔진, `LLM_ENABLED`로 켬), `explain.py`(리더 해설 자리, 아직 `llm.py`와 연결 전), `difficulty.py` |
| `front/server/` | 글·PDF 프록시 (`pdf-proxy.js`, 127.0.0.1:8001). 사설망 주소를 막는다 |

`back/app/services/hand/hand-test/`는 손 인식 원본 프로토타입(약 27MB)입니다. 실행 경로에서 쓰지 않습니다.

## 규칙
- hand와 gaze는 서로 import 하지 않는다. 바깥으로는 InputEvent나 콜백만 내보내고, 앱이 연결한다. 보정 제스처도 앱이 `subscribeGesture`로 전달한다.
- `state/machine.ts`는 순수 함수로 두고 웹캠 없이 테스트한다. 판정 로직(`gestures.ts`, `framing.ts`, `wordCorrection.ts` 등)도 같다.
- 프론트-백 계약은 `front/src/shared/api.ts` <-> `back/app/schemas.py`. 바꿀 때 양쪽을 함께 고친다.
- 형태소 분석기, 사전, LLM은 `back/app/services/*` 뒤에 숨겨 교체할 수 있게 한다.
- API 키는 서버(`back/.env`)에만 둔다.
