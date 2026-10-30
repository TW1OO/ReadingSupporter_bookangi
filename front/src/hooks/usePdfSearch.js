import { useCallback, useEffect, useMemo, useState } from 'react';

/** 문서 전체 텍스트 검색. 페이지 텍스트는 pageTextsRef에 캐시됩니다. */
export function usePdfSearch({ pdfDoc, pageTextsRef, onStatus }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [index, setIndex] = useState(-1);
  const [searching, setSearching] = useState(false);

  const term = open ? query.trim().toLocaleLowerCase() : '';

  useEffect(() => {
    setMatches([]);
    setIndex(-1);
    setSearching(false);
    if (!term || !pdfDoc) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      onStatus('문서 검색 중…');
      const found = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        if (cancelled) return;
        let text = pageTextsRef.current[i - 1];
        if (text === undefined) {
          try {
            const p = await pdfDoc.getPage(i);
            const c = await p.getTextContent();
            text = c.items.map((item) => item.str).join(' ');
            pageTextsRef.current[i - 1] = text;
          } catch {
            text = '';
          }
        }
        const haystack = text.toLocaleLowerCase();
        let from = 0;
        while ((from = haystack.indexOf(term, from)) !== -1) {
          found.push({ page: i, index: from });
          from += Math.max(1, term.length);
        }
      }
      if (cancelled) return;
      setMatches(found);
      setIndex(found.length ? 0 : -1);
      setSearching(false);
      if (!found.length) onStatus('검색 결과가 없습니다.');
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, pdfDoc]);

  const navigate = useCallback(
    (dir) => {
      if (!matches.length) return;
      setIndex((i) => (i + dir + matches.length) % matches.length);
    },
    [matches.length]
  );

  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const reset = useCallback(() => { setQuery(''); setMatches([]); setIndex(-1); }, []);

  const current = useMemo(() => (index >= 0 ? matches[index] : null), [matches, index]);

  return { open, setOpen, toggle, close, reset, query, setQuery, term, matches, index, current, searching, navigate };
}
