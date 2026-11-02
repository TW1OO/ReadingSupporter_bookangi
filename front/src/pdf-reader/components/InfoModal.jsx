import { useEffect, useState } from 'react';
import { ChevronRight } from './icons.jsx';

// 각 화면은 주제별 묶음(heading)과 [제목, 한 줄 설명] 항목으로 이루어진다. 한눈에 읽히도록 설명은 한 줄로 쓴다.
const CONTENT = {
  help: {
    title: '도움말',
    accordion: true, // 섹션을 눌러 펼친다
    lead: '시선으로 문장을 고르고, 손으로 단어를 맞춰 뜻을 봅니다.',
    groups: [
      {
        heading: '시작하기',
        items: [
          ['PDF 열기', '끌어다 놓거나 “파일 선택하기” (Ctrl/⌘ + O)'],
          ['링크로 열기', '글 주소를 넣으면 본문만 책처럼 펼쳐 보여 줘요'],
          ['시연 자료', '홈의 “시연 자료 열기”로 바로 시작'],
        ],
      },
      {
        heading: '시선 보정 · PC와 패드',
        items: [
          ['① 자세 맞추기', '얼굴은 점선 원 안에, 손은 오른쪽 아래 상자 안에'],
          ['② 시작', 'OK 손 모양을 잠시 유지하거나 “시선 보정 시작”'],
          ['③ 점 바라보기', '점 13개를 보며 손을 4번씩 펴기 (또는 클릭)'],
          ['건너뛰기', '“나중에”를 누르면 손과 마우스로만 읽어요'],
        ],
      },
      {
        heading: '읽기 동작',
        items: [
          ['시선 1초 멈춤', '문장과 후보 단어 지정'],
          ['엄지 들기', '문장과 후보 단어 지정'],
          ['엄지 기울이기', '왼쪽은 이전 단어, 오른쪽은 다음 단어'],
          ['손가락 모두 펴기', '다른 문장으로 바꾸기'],
          ['엄지 + 검지', '단어 확정'],
          ['손가락 1 · 2 · 3', '단어 뜻 · 문장 해설 · LLM 검색'],
          ['손 펴고 흔들기', '결과 닫기'],
          ['주먹', '언제든 취소'],
          ['화면 끝 보며 손바닥', '쪽 넘기기'],
        ],
      },
      {
        heading: '마우스 · 키보드 · 터치',
        items: [
          ['클릭 · 탭', '단어 지정 → ← → 이동, Enter 확정'],
          ['1 · 2 · 3 / 0', '메뉴 고르기 / 닫기'],
          ['← → · 좌우로 밀기', '쪽 넘기기'],
          ['Ctrl/⌘ + F', '문서 안 검색'],
        ],
      },
      {
        heading: '잘 안 될 때',
        items: [
          ['시선이 어긋나요', '처음 자리로 돌아오거나 다시 보정하세요'],
          ['손이 안 잡혀요', '손 전체가 화면 안에, 너무 가깝거나 멀지 않게'],
          ['카메라가 안 켜져요', '권한을 허용하세요 · https 주소에서만 동작해요'],
        ],
      },
    ],
  },
  features: {
    title: '기능/설명',
    lead: '일반 웹캠만으로 시선과 손을 읽어, 모르는 단어를 바로 찾아 줍니다.',
    groups: [
      {
        heading: '읽기 화면',
        items: [
          ['PDF', '쪽 맞춤 · 확대 · 회전 · 검색'],
          ['웹 글', '본문 글자만 뽑아 책처럼 쪽으로 나눠요'],
          ['여러 기기', 'PC·패드는 시선과 손, 폰은 터치로 읽어요'],
        ],
      },
      {
        heading: '시선 추정',
        items: [
          ['방식', '홍채 · 눈꺼풀 · 머리 방향으로 보는 곳을 계산'],
          ['정확도', '오차 약 100px → 문장은 시선, 단어는 손으로'],
          ['자동 보정', '단어를 확정할 때마다 오차를 조금씩 줄여요'],
          ['히트맵', '지금 읽는 곳을 옅게 표시'],
        ],
      },
      {
        heading: '손 제스처',
        items: [
          ['인식', '손 관절 21곳으로 손가락 모양을 판단'],
          ['안정화', '같은 모양을 잠시 유지해야 동작해요'],
        ],
      },
      {
        heading: '단어 도움',
        items: [
          ['단어 뜻', '원형으로 바꿔(읽었다 → 읽다) 우리말샘에서 찾기'],
          ['영어 · 외래어', 'DeepL 번역을 먼저 보여 줘요'],
          ['해설 · 검색', '서버의 로컬 LLM이 문장에 맞춰 설명'],
        ],
      },
      {
        heading: '개인정보',
        items: [
          ['영상 · 문서', '이 기기 안에서만 처리해요'],
          ['서버로 보내는 것', '고른 단어와 그 문장만 · 영어 단어는 DeepL로도'],
        ],
      },
    ],
  },
  credits: {
    title: '출처',
    lead: '아래 기술과 자료를 사용했습니다.',
    groups: [
      {
        heading: '시선 · 손 인식',
        items: [
          ['MediaPipe Face Landmarker', 'Google · Apache 2.0 · 시선 추정'],
          ['MediaPipe Hand Landmarker', 'Google · Apache 2.0 · 손 제스처 인식'],
          ['MediaPipe Tasks Vision', 'Google · Apache 2.0 · 브라우저 실행 (1.1.1)'],
        ],
      },
      {
        heading: '언어 · 사전',
        items: [
          ['Kiwi (kiwipiepy)', 'bab2min · Apache 2.0 · 형태소 분석, 원형 복원'],
          ['우리말샘', '국립국어원 · CC BY-SA 2.0 KR · 단어 뜻'],
          ['DeepL API', 'DeepL SE · 이용 약관 · 영어·외래어 번역'],
          ['EXAONE 3.5', 'LG AI연구원 · EXAONE AI Model License · 해설'],
          ['llama.cpp', 'MIT · 로컬 LLM 실행'],
        ],
      },
      {
        heading: '화면 · 문서',
        items: [
          ['PDF.js', 'Mozilla · Apache 2.0 · PDF 표시 (4.10.38)'],
          ['Readability', 'Mozilla · Apache 2.0 · 웹 글 본문 추출'],
          ['Noto Sans · Serif KR', 'Google Fonts · OFL 1.1 · 글꼴'],
          ['React · Vite', 'MIT · 화면과 개발 환경'],
          ['FastAPI 외', 'MIT · BSD 3-Clause · 서버'],
        ],
      },
      {
        heading: '읽은 글',
        items: [
          ['웹 글', '저작권은 원문 사이트에 있고, 글 아래에 출처를 표시해요'],
          ['시연 자료', '부산일보 기사 · 원문에서 불러오며 저장하지 않아요'],
        ],
      },
    ],
  },
};

function ItemList({ items }) {
  return (
    <dl>
      {items.map(([term, desc]) => (
        <div key={term}><dt>{term}</dt><dd>{desc}</dd></div>
      ))}
    </dl>
  );
}

export default function InfoModal({ section, onClose }) {
  const [openIndex, setOpenIndex] = useState(0); // 펼친 섹션. 한 번에 하나만 연다
  useEffect(() => setOpenIndex(0), [section]);
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
        <p className="modal-lead">{content.lead}</p>
        {content.groups.map((group, i) => {
          if (!content.accordion) {
            return (
              <section key={group.heading} className="modal-group">
                <h3>{group.heading}</h3>
                <ItemList items={group.items} />
              </section>
            );
          }
          const open = openIndex === i;
          const panelId = `info-${section}-${i}`;
          return (
            <section key={group.heading} className={`modal-fold${open ? ' open' : ''}`}>
              <button
                className="modal-fold-head"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? -1 : i)}
              >
                <span>{group.heading}</span>
                <ChevronRight size={18} />
              </button>
              {open && <div id={panelId} className="modal-fold-body"><ItemList items={group.items} /></div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
