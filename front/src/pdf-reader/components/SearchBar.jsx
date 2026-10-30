import { useEffect, useRef } from 'react';

export default function SearchBar({ search }) {
  const inputRef = useRef(null);
  useEffect(() => { if (search.open) inputRef.current?.focus(); }, [search.open]);
  if (!search.open) return null;

  let label = '';
  if (search.term) {
    if (search.searching) label = '검색 중…';
    else if (search.matches.length) label = `${search.index + 1} / ${search.matches.length}`;
    else label = '결과 없음';
  }

  return (
    <div id="searchBar" className="visible">
      <input
        id="searchInput" ref={inputRef} type="search" placeholder="PDF에서 검색..."
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') search.navigate(e.shiftKey ? -1 : 1);
          if (e.key === 'Escape') search.close();
        }}
      />
      <button onClick={() => search.navigate(-1)}>↑</button>
      <button onClick={() => search.navigate(1)}>↓</button>
      <span id="searchStatus">{label}</span>
      <button title="검색 닫기" onClick={search.close}>✕</button>
    </div>
  );
}
