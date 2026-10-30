import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { pdfjsLib } from '../lib/pdf.js';
import { cleanSelection } from '../lib/text.js';

/**
 * 캔버스 + 텍스트 레이어 + 시선 오버레이.
 * ref로 updateGaze({x, y, confidence}) / updateGaze(null)을 노출합니다.
 * (시선 좌표는 프레임마다 들어오므로 React state 대신 DOM을 직접 갱신해 리렌더를 피합니다.)
 */
const PdfViewer = forwardRef(function PdfViewer(
  { pdfDoc, pageNumber, scale, rotation, highlightTerm, stageRef, onOpen, onRendered, onPageText, onSelectText },
  ref
) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const textLayerRef = useRef(null);
  const washRef = useRef(null);
  const pointerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const markedRef = useRef([]);
  const selTimerRef = useRef(0);

  const [items, setItems] = useState([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const cb = useRef({});
  cb.current = { onRendered, onPageText, onSelectText };

  // ---------- 페이지 렌더링 ----------
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    (async () => {
      // 같은 캔버스에 렌더가 겹치지 않도록 이전 작업이 끝나길 기다립니다.
      const prev = renderTaskRef.current;
      if (prev) {
        try { prev.cancel(); } catch { /* noop */ }
        try { await prev.promise; } catch { /* noop */ }
      }
      if (cancelled) return;

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale, rotation });
        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        setSize({ width: viewport.width, height: viewport.height });
        setItems([]);

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        const content = await page.getTextContent();
        if (cancelled) return;

        const next = [];
        content.items.forEach((item, i) => {
          if (!item.str) return;
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          next.push({
            key: i,
            str: item.str,
            left: tx[4],
            top: tx[5] - Math.abs(tx[3]),
            fontSize: Math.max(1, Math.hypot(tx[2], tx[3])),
            fontFamily: item.fontName || 'sans-serif',
          });
        });
        setItems(next);
        cb.current.onPageText?.(pageNumber, content.items.map((it) => it.str).join(' '));
        cb.current.onRendered?.(pageNumber);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      try { renderTaskRef.current?.cancel(); } catch { /* noop */ }
    };
  }, [pdfDoc, pageNumber, scale, rotation]);

  // ---------- 시선 오버레이 ----------
  const clearMarks = () => {
    markedRef.current.forEach((el) => el.classList.remove('gaze-candidate', 'gaze-best'));
    markedRef.current = [];
  };

  useImperativeHandle(ref, () => ({
    updateGaze(point) {
      const wrap = wrapRef.current;
      const pointer = pointerRef.current;
      const wash = washRef.current;
      if (!wrap || !pointer || !wash) return;

      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !wrap.offsetWidth) {
        pointer.style.display = wash.style.display = 'none';
        clearMarks();
        return;
      }

      const { x, y, confidence = 1 } = point;
      const px = Math.max(0, Math.min(wrap.clientWidth, x * wrap.clientWidth));
      const py = Math.max(0, Math.min(wrap.clientHeight, y * wrap.clientHeight));

      pointer.style.display = wash.style.display = 'block';
      pointer.style.left = `${px}px`;
      pointer.style.top = `${py}px`;
      wash.style.left = `${Math.max(0, px - 46)}px`;
      wash.style.top = `${Math.max(0, py - 12)}px`;
      wash.style.width = '92px';
      wash.style.height = '24px';

      const w = wrap.getBoundingClientRect();
      const centers = [];
      let nearest = null;
      let best = Infinity;
      for (const el of textLayerRef.current.children) {
        const r = el.getBoundingClientRect();
        const cx = r.left - w.left + r.width / 2;
        const cy = r.top - w.top + r.height / 2;
        centers.push([el, cx, cy]);
        const d = Math.hypot(cx - px, cy - py);
        if (d < best) { best = d; nearest = [el, cx, cy]; }
      }

      clearMarks();
      if (nearest && best < 110 && confidence >= 0.25) {
        const [bestEl, nx, ny] = nearest;
        bestEl.classList.add('gaze-best');
        markedRef.current.push(bestEl);
        for (const [el, cx, cy] of centers) {
          if (el !== bestEl && Math.hypot(cx - nx, cy - ny) < 95) {
            el.classList.add('gaze-candidate');
            markedRef.current.push(el);
          }
        }
      }
    },
  }), []);

  // ---------- 텍스트 선택 → 단어 팝업 ----------
  useEffect(() => () => clearTimeout(selTimerRef.current), []);

  const handleSelection = () => {
    clearTimeout(selTimerRef.current);
    selTimerRef.current = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const word = cleanSelection(sel.toString());
      if (!word || word.length > 100) return;
      const anchor = sel.anchorNode;
      const el = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
      if (!el || !textLayerRef.current?.contains(el)) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      cb.current.onSelectText?.({ word, rect: { left: rect.left, top: rect.top, bottom: rect.bottom } });
    }, 180);
  };

  return (
    <section id="stage" ref={stageRef}>
      {!pdfDoc && (
        <div className="empty">
          <div className="big-icon">📖</div>
          <h2>읽고 싶은 책을 열어보세요</h2>
          <p>
            PDF를 열면 페이지 위에서 읽기 흐름을 확인할 수 있어요.<br />
            단어를 선택하면 뜻·해설·예시를 보여주는 프론트엔드 데모입니다.
          </p>
          <button className="primary" onClick={onOpen}>PDF 파일 선택</button>
        </div>
      )}

      <div
        id="pageWrap" ref={wrapRef}
        className={pdfDoc ? undefined : 'hidden'}
        style={{ width: size.width, height: size.height }}
      >
        <canvas id="pdfCanvas" ref={canvasRef} />
        <div
          id="textLayer" ref={textLayerRef}
          style={{ width: size.width, height: size.height }}
          onMouseUp={handleSelection}
          onTouchEnd={handleSelection}
          onKeyUp={(e) => (e.key === 'Shift' || e.key.startsWith('Arrow')) && handleSelection()}
        >
          {items.map((it) => (
            <span
              key={it.key}
              data-hit={highlightTerm && it.str.toLocaleLowerCase().includes(highlightTerm) ? '' : undefined}
              style={{ left: it.left, top: it.top, fontSize: it.fontSize, fontFamily: it.fontFamily }}
            >
              {it.str}
            </span>
          ))}
        </div>
        <div className="gaze-wash" ref={washRef} />
        <div className="gaze-pointer" ref={pointerRef} />
      </div>
    </section>
  );
});

export default PdfViewer;
