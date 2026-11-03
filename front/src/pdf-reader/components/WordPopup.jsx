import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { explainWord, lookupWord } from '../lib/dictionary.js';
import { isPhone } from '../lib/device.js';

const TABS = [
  { id: 'meaning', label: '단어 뜻 해석', key: '1' },
  { id: 'explain', label: '문장 해설', key: '2' },
  { id: 'search', label: 'LLM 검색', key: '3' },
];

// 탭은 state(MenuChoice)가 결정합니다. 손가락·키보드·클릭 모두 onChoice 로 같은 이벤트를 보냅니다.
export default function WordPopup({ selection, stageRef, onClose, choice, onChoice }) {
  const ref = useRef(null);
  const tab = choice;
  const [entry, setEntry] = useState(null);
  const [ai, setAi] = useState({}); // { sentence, search } 탭을 처음 열 때 하나씩 불러옵니다
  const [pos, setPos] = useState({ left: 0, top: 0, width: 360 });
  const [copied, setCopied] = useState('idle'); // idle | done | fail

  const sentence = selection?.scope === 'sentence'; // 문장 해설: 사전 조회 없이 해설만 보여 준다

  // 선택이 바뀌면 이전 LLM 결과를 비운다
  useEffect(() => { setAi({}); }, [selection]);

  // 단어 조회
  useEffect(() => {
    if (!selection || sentence) return;
    let cancelled = false;
    setEntry(null);
    lookupWord(selection.word, selection.context)
      .then((e) => !cancelled && setEntry(e))
      .catch(() => !cancelled && setEntry({ error: true }));
    return () => { cancelled = true; };
  }, [selection, sentence]);

  // 로컬 LLM. 느릴 수 있어 뜻과 따로, 탭을 열 때만 그 탭 몫을 요청합니다.
  // explain 탭 → 문장 해설(60자), search 탭 → LLM 검색(200자). 같은 선택에서 같은 모드는 한 번만 부릅니다.
  const mode = sentence || tab === 'explain' ? 'sentence' : tab === 'search' ? 'search' : null;
  const needAi = !!selection && !!mode && (sentence || (!!entry && !entry.error));
  const aiRequested = useRef({ selection: null, modes: new Set() });
  useEffect(() => {
    if (!needAi) return;
    const req = aiRequested.current;
    if (req.selection !== selection) { req.selection = selection; req.modes = new Set(); }
    if (req.modes.has(mode)) return;
    req.modes.add(mode);
    const base = sentence
      ? { surface: selection.word, context: selection.word }
      : { surface: selection.word, lemma: entry.lemma, meaning: entry.meaning, context: selection.context };
    explainWord({ ...base, mode }).then((r) => {
      if (aiRequested.current.selection === selection) setAi((prev) => ({ ...prev, [mode]: r }));
    });
  }, [needAi, mode, selection, entry, sentence]);

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
  }, [selection, entry, tab, ai]);

  // 바깥 클릭 / Esc 로 닫기 (PDF 영역 클릭은 새 선택을 위해 유지)
  useEffect(() => {
    if (!selection) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target) && !stageRef.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose();
      // 숫자 0 → 단어 설명창 닫기, 1·2·3 → 메뉴
      // 입력창 입력 중이거나 조합키가 눌린 경우는 제외합니다.
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input, textarea')) return;
      if (e.key === '0') return onClose();
      const t = TABS.find((x) => x.key === e.key);
      if (t) onChoice(t.id);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [selection, stageRef, onClose, onChoice]);

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
    window.open(`https://www.google.com/search?q=${encodeURIComponent(sentence ? word : `"${word}" 뜻 예문`)}`, '_blank', 'noopener');

  let body;
  if (sentence) {
    body = !ai.sentence
      ? <p className="popup-loading">문장 해설을 준비하는 중…</p>
      : ai.sentence.explanation
        ? <p className="example">{ai.sentence.explanation}</p>
        : '문장 해설을 불러오지 못했어요. 로컬 LLM이 켜져 있는지 확인해 주세요.';
  } else if (!tab) {
    body = <p className="popup-loading">{isPhone() ? '위에서 볼 내용을 고르세요.' : '손가락 1·2·3으로 메뉴를 고르세요. 주먹으로 취소합니다.'}</p>;
  } else if (!entry) {
    body = <p className="popup-loading">뜻과 예문을 찾는 중…</p>;
  } else if (entry.error) {
    body = '사전 뜻을 가져오지 못했어요. 웹 검색으로 더 확인할 수 있습니다.';
  } else if (tab === 'meaning') { //1103 태완 수정.(뜻이 최대 6개까지 나오도록 수정. 뜻이 3개 나올 경우, 3개까지만 나오게끔 하였으나, 확인 필요함.)
    const meanings = (entry.meanings ?? [])
      .filter((meaning) => typeof meaning === 'string' && meaning.trim())
      .slice(0, 6);

    body = meanings.length > 0
      ? meanings.map((meaning, i) => (
          <p key={i}>
            {i + 1}. {i === 0 && entry.part ? `[${entry.part}] ` : ''}
            {meaning}
          </p>
        ))
      : <p>사전에서 뜻을 찾지 못했어요.</p>;
  } else if (tab === 'explain') {
    body = !ai.sentence
      ? <p className="popup-loading">문장 해설을 준비하는 중…</p>
      : ai.sentence.explanation
        ? <p className="example">{ai.sentence.explanation}</p>
        : '문장 해설을 불러오지 못했어요. 웹 검색에서 찾아보세요.';
  } else {
    body = !ai.search
      ? <p className="popup-loading">LLM 검색 중…</p>
      : ai.search.search
        ? <p className="example" style={{ whiteSpace: 'pre-wrap' }}>{ai.search.search}</p>
        : 'LLM 검색을 불러오지 못했어요. 웹 검색에서 찾아보세요.';
  }

  return (
    <>
    {/* 휴대폰 시트의 바깥을 누르면 닫는다. 글자로 전달되어 새 단어가 잡히지 않게 막는다 (styles.css) */}
    <div className="word-sheet-backdrop" onClick={onClose} aria-hidden="true" />
    <div
      ref={ref} className="word-popup" role="dialog" aria-label="선택 단어 정보"
      style={{ left: pos.left, top: pos.top, width: pos.width }}
    >
      <div className="popup-head">
        <div>
          <div className={sentence ? 'popup-sentence' : 'popup-word'}>{word}</div>
          <div className="popup-meta">
            {sentence ? '문장 해설' : entry && !entry.error
              ? [entry.part, entry.lemma && entry.lemma !== word ? `원형: ${entry.lemma}` : ''].filter(Boolean).join(' · ')
              : ''}
          </div>
        </div>
        <button className="popup-close" aria-label="닫기" onClick={onClose}>✕</button>
      </div>

      {!sentence && <div className="popup-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => onChoice(t.id)} title={`${t.label} (${t.key}번 키)`}>
            {t.key} {t.label}
          </button>
        ))}
      </div>}

      <div className="popup-content">{body}</div>

      <div className="popup-actions">
        <button onClick={searchWeb}>검색어 복사/검색 ↗</button>
        <button onClick={copyWord}>
          {copied === 'done' ? '복사됨 ✓' : copied === 'fail' ? '복사 권한 없음' : sentence ? '문장 복사' : '단어 복사'}
        </button>
      </div>
    </div>
    </>
  );
}
