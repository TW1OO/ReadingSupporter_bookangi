import { useEffect } from 'react';

// 각 화면은 주제별 묶음(heading)과 [제목, 설명] 항목으로 이루어진다.
const CONTENT = {
  help: {
    title: '도움말',
    groups: [
      {
        heading: '시작하기',
        items: [
          ['파일 열기', 'PDF 파일을 끌어다 놓거나 “파일 선택하기”를 누르세요. 단축키는 Ctrl/⌘ + O 입니다.'],
          ['링크로 열기', '뉴스, 위키백과, 나무위키 같은 글 주소를 넣으면 본문 글자만 가져와 책처럼 펼쳐 보여 줍니다. 사진과 사진 설명은 빼고 보여 줍니다. PDF 주소도 열 수 있습니다.'],
          ['시연 자료 열기', '홈의 단추를 누르면 미리 준비한 기사를 바로 엽니다. 인터넷 연결이 필요합니다.'],
        ],
      },
      {
        heading: '시선 보정 (PC·패드)',
        items: [
          ['자세 맞추기', '뷰어에 들어가면 안내 창이 뜹니다. 얼굴을 화면 가운데 점선 원에 맞추고, 밝은 곳에서 손을 오른쪽 아래 상자 안에 들어 주세요. 세 항목에 모두 ✓ 표시가 되면 준비된 것입니다.'],
          ['보정 시작', '손으로 OK 표시(엄지와 검지 끝을 붙이고 나머지 세 손가락을 폄)를 잠시 유지하거나 “시선 보정 시작”을 누르세요.'],
          ['점 바라보기', '화면에 나오는 점 13개를 하나씩 바라보며 손을 4번 폈다 접거나 4번 클릭하세요. 바깥 선이 1/4씩 하얗게 차고, 다 차면 다음 점으로 넘어갑니다. 이어서 나오는 점은 가만히 바라보기만 하면 정확도를 잽니다.'],
          ['나중에 하기', '“나중에”를 누르면 시선 없이 손과 마우스로 읽을 수 있습니다. 왼쪽 읽기 도구의 “시선 보정”으로 언제든 다시 할 수 있습니다.'],
        ],
      },
      {
        heading: '손으로 읽기',
        items: [
          ['문장 지정', '읽다가 시선을 1초 멈추거나 엄지를 들면 문장과 후보 단어가 표시됩니다. 시선 멈춤 지정은 읽기 도구에서 끌 수 있습니다.'],
          ['단어 맞추기', '엄지를 오른쪽으로 35도 기울이면 다음 단어, 왼쪽으로 기울이면 이전 단어로 옮깁니다. 한 번 기울일 때마다 한 칸 움직이고, 엄지를 다시 세워야 다음 칸으로 갈 수 있습니다.'],
          ['문장 바꾸기', '다른 문장의 단어라면 손가락을 모두 펴세요. 엄지를 기울여 문장을 옮기고 엄지+검지로 문장을 정한 뒤 다시 단어를 맞춥니다.'],
          ['확정과 메뉴', '엄지+검지를 들면 단어가 확정됩니다. 손을 바꿔 손가락 1개(검지)는 단어 뜻, 2개(검지+중지)는 문장 해설, 3개는 LLM 검색입니다.'],
          ['닫기와 취소', '결과는 손을 펴고 좌우로 흔들면 닫힙니다. 주먹을 쥐면 어느 단계에서든 취소하고 읽기로 돌아갑니다.'],
          ['쪽 넘기기', '화면 오른쪽 끝을 보며 손바닥을 펴고 잠시 유지하면 다음 쪽, 왼쪽 끝이면 이전 쪽으로 넘어갑니다. 끝을 보는 동안 그쪽 가장자리가 은은하게 빛납니다.'],
        ],
      },
      {
        heading: '마우스·키보드·터치',
        items: [
          ['마우스', '단어를 클릭하면 후보가 잡히고 ←→로 옮겨 Enter로 확정합니다. Backspace는 문장 바꾸기, Esc는 취소입니다. 글을 끌어서 고르면 바로 메뉴가 열립니다.'],
          ['키보드', '메뉴에서 1·2·3으로 고르고 0으로 닫습니다. ← → 키로 쪽을 넘기고 Ctrl/⌘ + F로 문서 안을 검색합니다.'],
          ['터치 (폰·패드)', '단어를 탭하면 아래에 이전·다음·확정 단추가 나옵니다. 확정하면 뜻이 아래에서 올라오고, 바깥을 누르면 닫힙니다. 좌우로 밀면 쪽을 넘깁니다. 폰에서는 카메라를 켜지 않고 터치로만 읽습니다.'],
        ],
      },
      {
        heading: '잘 안 될 때',
        items: [
          ['시선이 어긋나요', '보정할 때와 자세나 거리가 달라지면 오차가 커집니다. 처음 자리로 돌아오거나 다시 보정하세요. 화면이나 패드를 돌린 뒤에는 보정이 다시 필요합니다.'],
          ['손이 인식되지 않아요', '손 전체가 화면 안에 들어오게 하고, 카메라와 너무 가깝거나 멀지 않게 해 주세요. 읽기 도구에서 지금 인식된 손 모양을 볼 수 있습니다.'],
          ['카메라가 켜지지 않아요', '브라우저의 카메라 권한을 허용해 주세요. 카메라는 https 주소나 이 기기(localhost)에서만 쓸 수 있습니다.'],
        ],
      },
    ],
  },
  features: {
    title: '기능/설명',
    groups: [
      {
        heading: '읽기 화면',
        items: [
          ['PDF 뷰어', '쪽 전체가 보이게 맞춰 엽니다. 확대·축소, 회전, 쪽 미리보기, 문서 안 검색, 전체 화면을 지원합니다. 휴대폰 가로 화면에서는 너비에 맞춥니다.'],
          ['웹 글 읽기', '웹 페이지에서 제목과 본문 글자만 뽑아 책처럼 쪽으로 나눕니다. 넓은 화면에서는 양쪽으로 펼치고, 원본 HTML과 스크립트는 실행하지 않습니다.'],
          ['여러 기기', 'PC와 패드에서는 시선과 손으로, 휴대폰에서는 터치로 같은 흐름을 씁니다.'],
        ],
      },
      {
        heading: '시선 추정',
        items: [
          ['어떻게 보나요', '웹캠 영상에서 얼굴의 홍채, 눈꺼풀, 머리 방향을 찾고, 보정 때 모은 값으로 화면의 어느 곳을 보는지 계산합니다. 얼굴을 따라 영상의 일부를 잘라 쓰는 오토 프레이밍으로 조금 움직여도 추적을 이어 갑니다.'],
          ['정확도', '일반 웹캠이라 오차가 약 100px입니다. 그래서 시선은 문장과 후보 단어를 대략 잡는 데 쓰고, 정확한 단어는 손으로 맞춥니다.'],
          ['점점 정확해지기', '단어를 확정할 때마다 그때의 시선과 단어 위치의 차이를 재서 좌표를 조금씩 바로잡습니다. 다른 곳을 보던 때의 값은 버립니다.'],
          ['읽는 위치 표시', '옅은 히트맵이 시선을 따라와 지금 읽는 곳을 보여 줍니다.'],
        ],
      },
      {
        heading: '손 제스처',
        items: [
          ['손 인식', '손의 관절 21곳을 찾아 손가락마다 펴졌는지 판단합니다. 최근 몇 장면의 결과를 함께 보고, 같은 모양을 잠시 유지해야 확정해 흔들림에 따른 오작동을 줄입니다.'],
          ['자세 안내', '손이 화면 끝에 걸리거나 너무 멀거나 가까우면 동작을 멈추고 바로잡는 방법을 알려 줍니다.'],
        ],
      },
      {
        heading: '단어 도움',
        items: [
          ['단어 뜻 해석', '한국어 형태소 분석으로 활용형을 원형으로 되돌린 뒤(예: “읽었다” → “읽다”) 우리말샘 사전에서 뜻을 찾습니다. 영어나 외래어는 DeepL 번역을 먼저 시도합니다.'],
          ['문장 해설·LLM 검색', '서버에서 동작하는 로컬 LLM이 단어가 쓰인 문장을 바탕으로 해설과 예문을 만듭니다.'],
        ],
      },
      {
        heading: '개인정보',
        items: [
          ['기기 안에서 처리', '웹캠 영상과 열어 본 문서는 이 기기 안에서만 처리하며 서버로 보내지 않습니다.'],
          ['서버로 보내는 것', '뜻과 해설을 찾을 때 선택한 단어와 그 단어가 있는 문장만 서버로 보냅니다. 영어·외래어 단어는 번역을 위해 DeepL로도 전달됩니다.'],
          ['링크로 열기', '입력한 주소의 페이지를 서버가 대신 받아 옵니다. 로그인이 필요한 페이지는 열 수 없습니다.'],
        ],
      },
    ],
  },
  credits: {
    title: '출처',
    groups: [
      {
        heading: '시선·손 인식',
        items: [
          ['MediaPipe Tasks Vision', 'Google · Apache License 2.0 · @mediapipe/tasks-vision 1.1.1 — 브라우저에서 영상 인식 모델을 실행'],
          ['MediaPipe Face Landmarker', 'Google · Apache License 2.0 — 얼굴·홍채 랜드마크와 머리 방향. 시선 추정에 사용'],
          ['MediaPipe Hand Landmarker', 'Google · Apache License 2.0 — 손 관절 21곳 랜드마크. 손 제스처 인식에 사용'],
        ],
      },
      {
        heading: '언어·사전',
        items: [
          ['Kiwi (kiwipiepy)', 'bab2min · Apache License 2.0 — 한국어 형태소 분석과 원형 복원'],
          ['우리말샘', '국립국어원 · 오픈 API — 단어 뜻. 사전 내용은 CC BY-SA 2.0 KR'],
          ['DeepL API', 'DeepL SE — 영어·외래어 단어 번역. DeepL API 이용 약관을 따름'],
          ['EXAONE 3.5', 'LG AI연구원 · EXAONE AI Model License — 문장 해설과 LLM 검색에 쓰는 로컬 언어 모델'],
          ['llama.cpp · llama-cpp-python', 'MIT License — 로컬 LLM 실행'],
        ],
      },
      {
        heading: '화면·문서',
        items: [
          ['PDF.js', 'Mozilla · Apache License 2.0 · pdfjs-dist 4.10.38 — PDF 렌더링과 글자 위치'],
          ['Readability', 'Mozilla · Apache License 2.0 — 웹 글 본문 추출'],
          ['Noto Sans KR · Noto Serif KR', 'Google Fonts · SIL Open Font License 1.1 — 화면과 본문 글꼴'],
          ['React · Vite', 'Meta · Vite 팀 · MIT License — 화면과 개발 환경'],
          ['FastAPI · Pydantic · Uvicorn · HTTPX', 'MIT, BSD 3-Clause License — 서버'],
        ],
      },
      {
        heading: '읽은 글',
        items: [
          ['웹 글의 저작권', '링크로 연 글의 저작권은 각 원문 사이트와 저작자에게 있으며, 글 아래에 출처를 표시합니다. 위키백과는 CC BY-SA 4.0, 나무위키는 CC BY-NC-SA 2.0 KR을 따릅니다.'],
          ['시연 자료', '부산일보 기사 — 원문에서 그때그때 불러와 보여 주며 저장하지 않습니다.'],
        ],
      },
    ],
  },
};

export default function InfoModal({ section, onClose }) {
  useEffect(() => {
    if (!section) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [section, onClose]);

  const content = CONTENT[section];
  if (!content) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={content.title}>
        <div className="modal-head">
          <h2>{content.title}</h2>
          <button aria-label="닫기" onClick={onClose}>✕</button>
        </div>
        {content.groups.map((group) => (
          <section key={group.heading} className="modal-group">
            <h3>{group.heading}</h3>
            <dl>
              {group.items.map(([term, desc]) => (
                <div key={term}><dt>{term}</dt><dd>{desc}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
