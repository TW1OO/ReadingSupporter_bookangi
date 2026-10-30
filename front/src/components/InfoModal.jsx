import { useEffect } from 'react';

const CONTENT = {
  help: {
    title: '도움말',
    items: [
      ['파일 열기', 'PDF 파일을 끌어다 놓거나 “파일 선택하기”를 누르세요. 공개된 파일 주소를 입력해 열 수도 있습니다. (Ctrl/⌘ + O)'],
      ['단어 선택', '본문의 단어를 드래그하면 뜻·해설·예시 팝업이 열립니다. 팝업에서는 1·2·3 키로 탭을 바꿀 수 있어요.'],
      ['시선 추적', '왼쪽 패널의 “추적 시작”을 누르면 카메라 권한을 요청합니다. 시선 보정 전에는 추정 위치가 부정확할 수 있습니다.'],
      ['이동·검색', '← → 키로 페이지를 넘기고, Ctrl/⌘ + F 로 문서 안을 검색합니다.'],
    ],
  },
  features: {
    title: '기능/설명',
    items: [
      ['PDF 뷰어', '페이지 단위로 읽습니다. 확대·회전·검색·전체 화면을 지원합니다.'],
      ['시선 기반 읽기 보조', '웹캠으로 홍채 위치를 추정해 지금 읽는 부분을 강조합니다.'],
      ['단어 도움', '선택한 단어를 원형으로 복원해 우리말샘 사전에서 뜻을 찾아 보여줍니다.'],
      ['프라이버시', '웹캠 영상과 문서는 이 기기 안에서만 처리됩니다. 선택한 단어만 사전 조회를 위해 서버로 보내며, 링크로 열기는 해당 주소에서 파일을 내려받습니다.'],
    ],
  },
  credits: {
    title: '출처',
    items: [
      ['PDF.js', 'Mozilla · Apache License 2.0 — PDF 렌더링'],
      ['MediaPipe Tasks Vision', 'Google · Apache License 2.0 — Face Landmarker 기반 시선 추정'],
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
