import { useEffect, useState } from 'react';
import { clamp } from '../lib/pdf.js';

export default function Toolbar({
  hasDoc, page, totalPages, scale,
  onPageChange, onZoomIn, onZoomOut, onFit, onFitHeight, onRotate,
  onToggleSearch, onFullscreen, onPrint, onDownload,
}) {
  const off = !hasDoc;
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);

  const commit = () => {
    const v = Number.parseInt(draft, 10);
    if (!Number.isFinite(v)) return setDraft(String(page));
    const next = clamp(v, 1, totalPages);
    setDraft(String(next));
    onPageChange(next);
  };

  return (
    <div className="toolbar">
      <div className="tool-group">
        <button title="이전 페이지" disabled={off || page <= 1} onClick={() => onPageChange(page - 1)}>←</button>
        <input
          id="pageNumber" type="number" min="1" max={totalPages || undefined}
          aria-label="페이지 번호" disabled={off}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        <span id="totalPages">/ {totalPages}</span>
        <button title="다음 페이지" disabled={off || page >= totalPages} onClick={() => onPageChange(page + 1)}>→</button>
      </div>
      <span className="tool-sep" />
      <div className="tool-group">
        <button title="축소" disabled={off} onClick={onZoomOut}>−</button>
        <span id="zoomLabel">{Math.round(scale * 100)}%</span>
        <button title="확대" disabled={off} onClick={onZoomIn}>＋</button>
        <button id="fitBtn" title="페이지 너비에 맞춤" disabled={off} onClick={onFit}>너비 맞춤</button>
        <button id="fitHeightBtn" title="페이지 높이에 맞춤" disabled={off} onClick={onFitHeight}>높이 맞춤</button>
      </div>
      <span className="tool-sep" />
      <div className="tool-group">
        <button title="90도 회전" disabled={off} onClick={onRotate}>↻</button>
        <button title="문서 검색" disabled={off} onClick={onToggleSearch}>⌕ 검색</button>
        <button title="전체 화면" onClick={onFullscreen}>⛶</button>
        <button title="인쇄" disabled={off} onClick={onPrint}>⎙</button>
        <button title="다운로드" disabled={off} onClick={onDownload}>↓</button>
      </div>
    </div>
  );
}
