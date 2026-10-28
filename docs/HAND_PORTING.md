# 손 인식 front 이식 현황

원본 프로토타입: `back/app/services/hand/hand-test/` (브라우저 JS. 비교용으로 유지 중)
이식 결과: `front/src/modules/hand/` — MediaPipe를 브라우저에서 직접 돌리므로 웹캠 프레임을 back으로 보내지 않는다.

## 구성

| 파일 | 역할 |
|---|---|
| `fingers.ts` | 손가락 펴짐 판정 (원본 `fingers.js`의 TS 포팅. 로직 동일) |
| `posture.ts` | 자세 안내 `PostureGuard` (원본 `posture.js`의 TS 포팅) |
| `gestures.ts` | 손가락 개수→제스처, 다수결, `HoldStabilizer`(유지 시간), 단어 스냅 `nearestWord`, 좌표 변환 `toViewport`, `HOLD_MS` |
| `index.ts` | `startHandInput(emit, opts)`: 웹캠·MediaPipe·`InputEvent` 방출·정리 |
| `ui/HandPanel.tsx` | 웹캠 미리보기, 자세 안내, 포인터 점, 인식 결과 출력 |

에셋: `@mediapipe/tasks-vision` 1.1.1(고정). wasm은 `postinstall`로 `public/mediapipe/wasm`에 복사(git 제외), 모델 `hand_landmarker.task`는 `public/mediapipe/`에 커밋.

## 손 모양 → 결과

각 모양을 `HOLD_MS`(700ms) 동안 유지해야 확정되고, 확정은 한 번만 일어난다(다른 모양으로 바뀌어야 다시 가능). 최근 7프레임 다수결로 개수를 정한다. 어느 손가락이든 개수만 센다.

| 펴진 손가락 | 현재 phase | 결과 |
|---|---|---|
| 1 (검지) | idle | 포인터가 가까운 단어(60px 이내)로 스냅, 같은 단어 유지 시 `WORD_POINTED` (source: hand) |
| 1 | menu | `MENU_SELECTED` meaning (뜻) |
| 2 | menu | `MENU_SELECTED` explain (해설) |
| 3 | menu | `MENU_SELECTED` search (검색) |
| 4, 5 | 모두 | 이벤트 없음 (화면 출력에는 개수가 표시됨) |
| 0 (주먹) | menu, result | `CANCEL` |
| 0 (주먹) | idle | 이벤트 없음 |
| 그 외 phase 조합 | | 이벤트 없음 (예: result에서 1~3) |

손이 화면 가장자리/너무 멀거나 가까움/인식 흔들림이면 확정이 막히고(화면에 "(대기)") 안내가 뜬다. 손이 사라지면 진행 상태가 초기화된다.

## 화면 출력

"손 인식 켜기" 후 오른쪽 아래 패널: 개수(주먹/N개), 손가락별 ■□, 확신도, 최근 이벤트 5개.

## 검증 현황
- 합성 랜드마크로 0/1/2/3/5개 판정, 유지 시간·스냅·좌표 변환 단위 테스트 (`fingers.test.ts`, `gestures.test.ts`).
- 원본 HTML은 실제 웹캠으로 확인됨. **이식본은 브라우저 실동작 확인 필요** (npm 번들 버전 1.1.1, 포인터 스냅).

## 남은 일
- 이식본 웹캠 확인 후 `hand-test/`(약 26MB) 제거
- 사전 조회 결과(`lookup`)를 메뉴 선택에 연결, 결과 패널 UI
- 조명 환경에서 `TH`(fingers.ts), `GUIDE`(posture.ts), `HOLD_MS` 재튜닝
