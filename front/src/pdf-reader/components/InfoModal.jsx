import { useEffect } from 'react';

const CONTENT = {
  help: {
    title: '도움말',
    items: [
      ['파일 열기', 'PDF 파일을 끌어다 놓거나 “파일 선택하기”를 누르세요. (Ctrl/⌘ + O)'],
      ['링크로 열기', '뉴스, 위키독스, 나무위키 같은 글 주소를 넣으면 본문만 가져와 책처럼 펼쳐 보여 줍니다. 그림은 표시하지 않습니다. PDF 주소도 열 수 있습니다.'],
      ['단어 선택', '시선이 1초 머물거나 엄지를 들면 후보 단어가 표시됩니다. 엄지를 좌우로 기울여 옮기고 엄지+검지로 확정합니다. 다른 문장이면 손을 펴서 문장을 바꿉니다. 시선 없이 쓸 때는 단어를 클릭하고 ←→, Enter, Backspace를 씁니다.'],
      ['시선 보조', '왼쪽 패널의 “시선 보정”으로 보정을 마치면 지금 읽는 줄을 강조합니다. 단어 선택은 손이나 마우스로 합니다.'],
      ['메뉴·닫기', '확정 후 손가락(또는 키보드) 1=단어 뜻 해석, 2=문장 해설, 3=LLM 검색. 손을 펴고 좌우로 흔들면 닫고, 주먹이나 0 키로 취소합니다.'],
      ['이동·검색', '화면 왼쪽·오른쪽 끝을 보면서 손바닥을 펴고 유지하면 쪽을 넘깁니다. ← → 키로도 넘기고, Ctrl/⌘ + F 로 문서 안을 검색합니다.'],
    ],
  },
  features: {
    title: '기능/설명',
    items: [
      ['PDF 뷰어', '페이지 단위로 읽습니다. 확대·회전·검색·전체 화면을 지원합니다.'],
      ['시선 기반 읽기 보조', '웹캠 시선은 오차가 커서 보정 후 줄 수준으로만 강조합니다.'],
      ['단어 도움', '선택한 단어를 원형으로 복원해 우리말샘 사전에서 뜻을 찾아 보여줍니다.'],
      ['프라이버시', '웹캠 영상과 문서는 이 기기 안에서만 처리됩니다. 선택한 단어와 그 단어가 있는 줄만 뜻·해설 조회를 위해 서버로 보내며, 링크로 열기는 해당 주소에서 파일을 내려받습니다.'],
    ],
  },
  credits: {
    title: '출처',
    items: [
      ['PDF.js', 'Mozilla · Apache License 2.0 — PDF 렌더링'],
      ['MediaPipe Tasks Vision', 'Google · Apache License 2.0 — Face Landmarker 기반 시선 추정'],
      ['Readability', 'Mozilla · Apache License 2.0 — 웹 글 본문 추출'],
      ['Kiwi · 우리말샘', '한국어 형태소 분석(kiwipiepy) · 국립국어원 우리말샘 — 원형 복원과 사전 뜻'],
      ['React · Vite', 'MIT License — UI 및 개발 환경'],
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
        <dl>
          {content.items.map(([term, desc]) => (
            <div key={term}><dt>{term}</dt><dd>{desc}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}
