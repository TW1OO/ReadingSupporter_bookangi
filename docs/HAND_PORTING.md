# 손 인식 모듈 (front/src/modules/hand)

원본 프로토타입은 `back/app/services/hand/hand-test/`(브라우저 JS)입니다. 이를 옮긴 이 모듈이 MediaPipe를 브라우저에서 직접 돌리므로 웹캠 프레임을 서버로 보내지 않습니다. 사용자 동작 기준은 [INTERACTION.md](INTERACTION.md)를 따릅니다.

## 구성
| 파일 | 역할 |
|---|---|
| `fingers.ts` | 손가락 펴짐 판정, 엄지·검지 끝 거리 측정 |
| `gestures.ts` | 손 모양 분류, 다수결, `HoldStabilizer`, 읽기용 `GestureTracker`, 보정용 `CalibrationGestureTracker` |
| `posture.ts` | 자세 안내 `PostureGuard` (화면 끝, 거리, 흔들림) |
| `index.ts` | `startHandInput(emit, opts)`: 웹캠, MediaPipe, InputEvent 방출, 정리 |

에셋은 `@mediapipe/tasks-vision` 1.1.1(고정)입니다. wasm은 `scripts/copy-mediapipe.mjs`가 `public/mediapipe/wasm`으로 복사하고(git 제외), 모델은 `public/mediapipe/`에 커밋되어 있습니다.

## 손 모양
최근 7프레임 다수결로 모양을 정합니다.

| 모양 | 조건 | 쓰임 |
|---|---|---|
| `fist` | 모두 접음 | 취소 |
| `thumb` | 네 손가락을 접고 엄지를 벌림 | 문장 지정, 기울여서 이동 |
| `confirm` | 엄지+검지 | 확정 |
| `one` / `two` / `three` | 검지 / 검지+중지 / 검지+중지+약지 (엄지 접음) | 메뉴 |
| `palm` | 네 손가락을 폄 | 문장 바꾸기, 쪽 넘기기, 결과 닫기, 보정 클릭 |
| `ok` | 엄지·검지 끝이 맞닿고 나머지 세 손가락을 폄 | 보정 시작과 완료 |

## 튜닝 값
모두 시작값입니다. 실제 웹캠과 조명에서 조정합니다.

| 값 | 위치 | 기본 |
|---|---|---|
| `HOLD_MS` 유지 시간 | `gestures.ts` | 700ms |
| `TILT_DEG` / `REARM_DEG` 엄지 기울기 | `gestures.ts` | 35도 / 15도 |
| `WAVE_DEG` / `WAVE_MS` 닫기 | `gestures.ts` | 45도 / 2초 |
| `OK_PINCH` OK 판정 거리 | `gestures.ts` | 0.3 |
| `PALM_CLICK_MS` / `PALM_REARM_MS` 보정 클릭 | `gestures.ts` | 150ms / 200ms |
| `TH` 손가락 펴짐 | `fingers.ts` | |
| `GUIDE` 자세 안내 | `posture.ts` | |

## 자세 차단
손이 화면 끝에 걸리거나 너무 멀거나 가까우면, 또는 인식이 흔들리면 읽기 제스처를 막고 안내합니다. 보정 중에는 접고 펴는 것이 정상 동작이므로 흔들림 차단을 적용하지 않고, 화면 끝과 거리 조건만 봅니다(`outOfRange`).

## 검증과 남은 일
- 판정 로직은 합성 데이터로 단위 테스트합니다 (`*.test.ts`).
- OK 표시와 보정 중 손 펴기는 실제 웹캠에서 아직 충분히 확인하지 못했습니다.
- `hand-test/`(약 27MB)는 비교가 끝나면 지웁니다.
