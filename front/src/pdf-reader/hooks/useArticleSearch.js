import { useCallback, useEffect, useMemo, useState } from 'react';

/** 웹 글 검색. usePdfSearch 와 같은 모양으로 돌려줘 같은 검색창을 쓴다. */
export function useArticleSearch(article) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const term = open ? query.trim().toLocaleLowerCase() : '';
  const matches = useMemo(() => {
    if (!term || !article) return [];
    return article.blocks.flatMap((b, block) => (b.text.toLocaleLowerCase().includes(term) ? [{ block }] : []));
  }, [term, article]);
  useEffect(() => setIndex(0), [matches]);

  const navigate = useCallback(
    (dir) => { if (matches.length) setIndex((i) => (i + dir + matches.length) % matches.length); },
    [matches.length]
  );
  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const reset = useCallback(() => { setQuery(''); setIndex(0); }, []);

  return { open, setOpen, toggle, close, reset, query, setQuery, term, matches, index, current: matches[index] ?? null, searching: false, navigate };
}
