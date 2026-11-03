# Book항이 (ReadingSupporter_bookangi)

시선(아이트래킹)과 손동작(핸드트래킹)으로 전자책 속 모르는 단어를 찾아 주는 한국어 독서 보조 서비스입니다.
2026 DevDay(동아대 소프트웨어혁신센터) AI·SW 기초 트랙 출품작이며, 팀 Book항이(6명)가 만듭니다.

**바로 사용하기: https://bookangi-btu04.apps.dauai.org/**

PC와 패드에서는 Chrome으로 접속해 카메라를 허용하면 시선과 손으로 읽을 수 있고, 휴대폰에서는 터치로 읽습니다.

## 사용 흐름
1. PDF를 열거나 웹 글 주소를 입력하면 뷰어가 열리고, 시선 보정 안내와 손 인식이 시작됩니다.
2. OK 표시를 하고, 점 13개를 바라보며 손을 4번씩 펴서(또는 클릭해서) 시선을 보정합니다.
3. 글을 읽다가 시선을 1초 멈추거나 엄지를 들면 문장과 후보 단어가 잡힙니다.
4. 엄지를 기울여 단어를 맞추고, 엄지+검지로 확정합니다.
5. 손가락 1은 단어 뜻, 2는 문장 해설, 3은 LLM 검색입니다.
6. 손을 펴고 좌우로 흔들면 결과가 닫히고, 주먹은 언제든 취소입니다.

시선 오차가 약 100px로 커서, 시선은 문장과 후보를 대략 잡는 데만 쓰고 정확한 단어는 제스처로 고릅니다. 시선을 쓸 수 없으면 마우스와 키보드로 대신할 수 있습니다. 자세한 기준은 [docs/INTERACTION.md](docs/INTERACTION.md)에 있습니다.

## 실행

### 배포 사이트
설치 없이 **https://bookangi-btu04.apps.dauai.org/** 에서 바로 쓸 수 있습니다.

| 주소 | 화면 |
|---|---|
| [/](https://bookangi-btu04.apps.dauai.org/) | PDF·웹 글 리더 (기본) |
| [/?gaze](https://bookangi-btu04.apps.dauai.org/?gaze) | 시선 단독 실험 화면 |
| [/?llm](https://bookangi-btu04.apps.dauai.org/?llm) | 로컬 LLM 테스트 화면 |
| [/?legacy](https://bookangi-btu04.apps.dauai.org/?legacy) | 초기 샘플 화면 |

- HTTPS 주소라 Chrome에서 카메라를 허용하면 시선과 손 인식을 쓸 수 있습니다.
- 처음 접속하면 브라우저가 카메라 권한을 묻습니다. 부스 PC와 패드에서는 미리 허용해 두세요.

### 로컬에서 실행
개발하거나 배포 사이트를 쓸 수 없을 때 씁니다. Node.js와 Python이 필요하고, 카메라는 Chrome에서 `localhost` 또는 HTTPS 주소로 접속할 때만 쓸 수 있습니다.

```bash
# 프론트 (http://localhost:5173)
cd front
npm install
npm run dev:full    # Vite + 프록시(8001). 링크로 글·PDF를 열 때 필요
npm run dev         # Vite만. 파일로만 열 때

# 백엔드 (http://localhost:8000)
cd back
python -m venv .venv
.venv/Scripts/activate        # macOS·Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # 키 입력
uvicorn app.main:app --reload
```

로컬에서도 같은 주소 뒤에 `/?gaze`, `/?llm`, `/?legacy`를 붙여 각 화면을 엽니다.

## 테스트
```bash
cd front && npm run typecheck && npm test && npm run build
cd back && pytest
```

## 구조
```
front/
  src/pdf-reader/      리더 화면 (components, hooks, lib)
  src/modules/hand/    손 인식과 제스처 판정 (브라우저 MediaPipe)
  src/modules/gaze/    시선 추정, 보정, 오토 프레이밍 (브라우저 MediaPipe)
  src/modules/state/   입력 상태 머신 (순수 함수)
  src/shared/          모듈 간 계약 (InputEvent, API 형식, 카메라 설정)
  server/              글·PDF를 받아 오는 프록시
back/
  app/routers/         lookup, explain, gaze metrics API
  app/services/        사전, 번역, 형태소, 해설(LLM 자리)
docs/                  설계 문서
```
웹캠 영상은 브라우저에서만 처리하고 서버로 보내지 않습니다. 구조와 규칙은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 보세요.

## 설정
키는 `back/.env`에만 두고 커밋하지 않습니다.

| 변수 | 용도 |
|---|---|
| `DICT_API_KEY` | 우리말샘 사전 조회 |
| `DEEPL_API_KEY` | 영단어·외래어 번역 |
| `CORS_ORIGINS` | 허용할 프론트 주소 |

## 서버 배포
- **HTTPS 필수:** HTTP 주소에서는 브라우저가 카메라를 막아 시선과 손 인식이 동작하지 않습니다.
- **경로 연결:** `/api/pdf-proxy`와 `/api/page-proxy`는 `front/server/pdf-proxy.js`(8001)로, 나머지 `/api`는 FastAPI(8000)로 보냅니다. 개발 중에는 Vite가 맡지만([vite.config.ts](front/vite.config.ts)), 배포할 때는 웹 서버에서 직접 설정해야 합니다.
- **프록시 공개 범위:** 프록시는 외부 주소를 대신 받아 오며 지금은 로컬 전용입니다. 공개하려면 인증과 호출 제한을 넣어야 합니다.
- **빌드:** `npm run build`가 MediaPipe wasm을 복사한 뒤 `front/dist`를 만듭니다.

## 문서
| 문서 | 내용 |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 모듈 구조와 설계 규칙 |
| [INTERACTION](docs/INTERACTION.md) | 입력 흐름과 제스처 기준 |
| [PDF_READER](docs/PDF_READER.md) | 리더 화면, 웹 글 읽기, 알려진 한계 |
| [HAND_PORTING](docs/HAND_PORTING.md) | 손 인식 모듈 구성과 튜닝 값 |
| [STAGES](docs/STAGES.md) | 개발 단계와 진행 상황 |
| [BRANCHING](docs/BRANCHING.md) | 브랜치와 커밋 규칙 |

## 일정
행사 2026-11-04 10:00~15:00, S06-607호. 리허설 11-03.
