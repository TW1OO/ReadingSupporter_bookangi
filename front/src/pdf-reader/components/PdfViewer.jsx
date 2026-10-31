import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../lib/pdf.js';
import { cleanSelection } from '../lib/text.js';
import { layoutTextItem, splitWords } from '../lib/textLayout.js';

/**
 * 캔버스 + 텍스트 레이어.
 * ref로 getWordRects() / wordInfo(id)를 노출합니다 (손 포인팅 스냅용).
 * 각 텍스트 조각은 data-gaze-paragraph 를 달아 시선 모듈이 줄 수준으로 추정할 수 있게 합니다.
 */
const PdfViewer = forwardRef(function PdfViewer(
  { pdfDoc, pageNumber, scale, rotation, highlightTerm, gazeRegionId, stageRef, onOpen, onRendered, onPageText, onSelectText },
  ref
) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const markedRef = useRef([]);
  const selTimerRef = useRef(0);
  const wordsRef = useRef(null); // 페이지 기준 단어 위치 캐시 (손 포인터가 프레임마다 읽는다)

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
          next.push({ key: i, str: item.str, ...layoutTextItem(item, tx, content.styles[item.fontName], viewport.scale) });
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

  // ---------- 텍스트 레이어 정렬 ----------
  // 대체 글꼴은 PDF 글꼴과 폭이 달라서, 조각마다 실제 글자 폭에 맞게 늘이거나 줄입니다.
  useLayoutEffect(() => {
    wordsRef.current = null;
    const spans = Array.from(textLayerRef.current?.children ?? []);
    spans.forEach((el) => { el.style.transform = ''; });
    const natural = spans.map((el) => el.offsetWidth);
    spans.forEach((el, i) => {
      const it = items[i];
      if (!it) return;
      const rotate = it.angle ? `rotate(${it.angle}rad) ` : '';
      const fit = natural[i] > 0 && it.width > 0 ? `scaleX(${it.width / natural[i]})` : '';
      el.style.transform = rotate + fit;
    });
  }, [items]);

  // ---------- 시선 강조: 시선이 머무는 줄 ----------
  useEffect(() => {
    const layer = textLayerRef.current;
    if (!layer || !gazeRegionId) return undefined;
    const hit = Array.from(layer.children).find((el) => el.dataset.gazeParagraph === gazeRegionId);
    if (!hit) return undefined;
    const r = hit.getBoundingClientRect();
    const cy = (r.top + r.bottom) / 2;
    const line = Array.from(layer.children).filter((el) => {
      const o = el.getBoundingClientRect();
      return cy >= o.top && cy <= o.bottom;
    });
    line.forEach((el) => el.classList.add('gaze-best'));
    return () => line.forEach((el) => el.classList.remove('gaze-best'));
  }, [gazeRegionId, items]);

  // ---------- 손 포인팅용 단어 위치 ----------
  const measureWords = () => {
    const out = [];
    const wrap = wrapRef.current.getBoundingClientRect();
    const range = document.createRange();
    Array.from(textLayerRef.current.children).forEach((el, spanIndex) => {
      const node = el.firstChild;
      if (!node) return;
      for (const { start, end } of splitWords(node.textContent)) {
        range.setStart(node, start);
        range.setEnd(node, end);
        const r = range.getBoundingClientRect();
        if (r.width && r.height) {
          out.push({ id: `${spanIndex}:${start}:${end}`, left: r.left - wrap.left, top: r.top - wrap.top, right: r.right - wrap.left, bottom: r.bottom - wrap.top });
        }
      }
    });
    return out;
  };

  useImperativeHandle(ref, () => ({
    // 뷰포트 좌표의 단어 사각형들 (스크롤 위치만 더하면 되므로 측정은 한 번만 합니다)
    getWordRects() {
      if (!wrapRef.current || !textLayerRef.current) return [];
      wordsRef.current ??= measureWords();
      const { left, top } = wrapRef.current.getBoundingClientRect();
      return wordsRef.current.map((w) => ({ id: w.id, left: w.left + left, top: w.top + top, right: w.right + left, bottom: w.bottom + top }));
    },
    wordInfo(id) {
      const [spanIndex, start, end] = id.split(':').map(Number);
      const node = textLayerRef.current?.children[spanIndex]?.firstChild;
      if (!node) return null;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const r = range.getBoundingClientRect();
      return { word: node.textContent.slice(start, end), rect: { left: r.left, top: r.top, bottom: r.bottom } };
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
              data-gaze-paragraph={`p${pageNumber}-${it.key}`}
              style={{ left: it.left, top: it.top, fontSize: it.fontSize, fontFamily: it.fontFamily }}
            >
              {it.str}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
});

export default PdfViewer;
