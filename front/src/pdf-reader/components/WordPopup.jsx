import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { lookupWord } from '../lib/dictionary.js';

const TABS = [
  { id: 'meaning', label: '뜻', key: '1' },
  { id: 'explanation', label: '해설', key: '2' },
  { id: 'examples', label: '예시', key: '3' },
];

export default function WordPopup({ selection, stageRef, onClose, gestureChoice = null }) {
  const ref = useRef(null);
  const [tab, setTab] = useState('meaning');

  useEffect(() => {
    if (gestureChoice === 1 || gestureChoice === 11) setTab('meaning');
    if (gestureChoice === 2 || gestureChoice === 22) setTab('explanation');
    if (gestureChoice === 3 || gestureChoice === 33) setTab('examples');
  }, [gestureChoice]);
  const [entry, setEntry] = useState(null);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 360 });
  const [copied, setCopied] = useState('idle'); // idle | done | fail

  // 단어 조회
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setTab('meaning');
    setEntry(null);
    lookupWord(selection.word)
      .then((e) => !cancelled && setEntry(e))
      .catch(() => !cancelled && setEntry({ error: true }));
    return () => { cancelled = true; };
  }, [selection]);

  // 선택 영역 근처에 배치 (아래 우선, 공간이 없으면 위)
  useLayoutEffect(() => {
    if (!selection || !ref.current) return;
    const margin = 12;
    const width = Math.min(360, window.innerWidth - margin * 2);
    const height = ref.current.offsetHeight || 250;
    const { rect } = selection;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    let top = rect.bottom + 10;
    if (top + height > window.innerHeight - margin) top = rect.top - height - 10;
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
    setPos({ left, top, width });
  }, [selection, entry, tab]);

  // 바깥 클릭 / Esc 로 닫기 (PDF 영역 클릭은 새 선택을 위해 유지)
  useEffect(() => {
    if (!selection) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !stageRef.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose();
      // 숫자 0 → 단어 설명창 닫기, 1·2·3 → 뜻·해설·예시
      // 입력창 입력 중이거나 조합키가 눌린 경우는 제외합니다.
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input, textarea')) return;
      if (e.key === '0') return onClose();
      const t = TABS.find((x) => x.key === e.key);
      if (t) setTab(t.id);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [selection, stageRef, onClose]);

  if (!selection) return null;
  const { word } = selection;

  const copyWord = async () => {
    try {
      await navigator.clipboard.writeText(word);
      setCopied('done');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied('idle'), 1200);
  };
  const searchWeb = () =>
    window.open(`https://www.google.com/search?q=${encodeURIComponent(`"${word}" 뜻 예문`)}`, '_blank', 'noopener');

  let body;
  if (!entry) {
    body = <p className="popup-loading">뜻과 예문을 찾는 중…</p>;
  } else if (entry.error) {
    body = '사전 뜻을 가져오지 못했어요. 웹 검색으로 더 확인할 수 있습니다.';
  } else if (tab === 'meaning') {
    body = <p>1. {entry.part ? `[${entry.part}] ` : ''}{entry.meaning}</p>;
  } else if (tab === 'explanation') {
    body = entry.explanation
      ? <p className="example">“{entry.explanation}”</p>
      : '등록된 해설이 없어요. 웹 검색에서 찾아보세요.';
  } else {
    body = entry.examples?.length
      ? entry.examples.slice(0, 5).map((ex, i) => <p key={i} className="example">“{ex}”</p>)
      : '등록된 예문이 없어요. 웹 검색에서 예문을 찾아보세요.';
  }

  return (
    <div
      ref={ref} className="word-popup" role="dialog" aria-label="선택 단어 정보"
      style={{ left: pos.left, top: pos.top, width: pos.width }}
    >
      <div className="popup-head">
        <div>
          <div className="popup-word">{word}</div>
          <div className="popup-meta">
            {entry && !entry.error
              ? [entry.part, entry.lemma && entry.lemma !== word ? `원형: ${entry.lemma}` : ''].filter(Boolean).join(' · ')
              : ''}
          </div>
        </div>
        <button className="popup-close" aria-label="닫기" onClick={onClose}>✕</button>
      </div>

      <div className="popup-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} title={`${t.label} (${t.key}번 키)`}>
            {t.key} {t.label}
          </button>
        ))}
      </div>

      <div className="popup-content">{body}</div>

      <div className="popup-actions">
        <button onClick={searchWeb}>검색어 복사/검색 ↗</button>
        <button onClick={copyWord}>
          {copied === 'done' ? '복사됨 ✓' : copied === 'fail' ? '복사 권한 없음' : '단어 복사'}
        </button>
      </div>
    </div>
  );
}
