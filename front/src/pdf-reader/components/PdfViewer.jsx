import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../lib/pdf.js';
import { cleanSelection } from '../lib/text.js';
import { layoutTextItem } from '../lib/textLayout.js';
import { buildWords, isNewBlock, nearestWordIndex, sentenceText } from '../lib/pdfWords.js';

/**
 * 캔버스 + 텍스트 레이어.
 * 각 텍스트 조각은 data-gaze-paragraph 를 달아 시선 모듈이 줄 수준으로 추정할 수 있게 합니다.
 * ref로 targetAt(x, y) / wordInfo(id)를 노출합니다. 단어 조정(docs/INTERACTION.md)에 쓰입니다.
 */
const PdfViewer = forwardRef(function PdfViewer(
  { pdfDoc, pageNumber, scale, rotation, highlightTerm, gazeRegionId, target, stageRef, onOpen, onRendered, onPageText, onSelectText, onClickPoint },
  ref
) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const markedRef = useRef([]);
  const selTimerRef = useRef(0);
  const wordsRef = useRef(null); // { words, rects } 페이지 기준 좌표. 글자가 바뀔 때만 다시 잰다
  const candidateRef = useRef(null);

  const [items, setItems] = useState([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const cb = useRef({});
  cb.current = { onRendered, onPageText, onSelectText, onClickPoint };

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

  // ---------- 단어 위치 ----------
  const measureWords = () => {
    if (wordsRef.current) return wordsRef.current;
    const wrap = wrapRef.current.getBoundingClientRect();
    const els = Array.from(textLayerRef.current.children);
    const boxes = els.map((el) => el.getBoundingClientRect());
    const words = buildWords(els.map((el, i) => ({ text: el.textContent, newBlock: isNewBlock(boxes[i - 1], boxes[i]) })));
    const range = document.createRange();
    const rects = words.map((w) => {
      const node = els[w.span].firstChild;
      range.setStart(node, w.start);
      range.setEnd(node, w.end);
      const r = range.getBoundingClientRect();
      return { left: r.left - wrap.left, top: r.top - wrap.top, right: r.right - wrap.left, bottom: r.bottom - wrap.top };
    });
    wordsRef.current = { words, rects };
    return wordsRef.current;
  };

  useImperativeHandle(ref, () => ({
    // 화면 좌표에서 가장 가까운 단어를 후보로. 글자가 없거나 maxDist 보다 멀면 null
    targetAt(x, y, maxDist) {
      if (!wrapRef.current || !textLayerRef.current) return null;
      const { words, rects } = measureWords();
      const wrap = wrapRef.current.getBoundingClientRect();
      const index = nearestWordIndex(rects, x - wrap.left, y - wrap.top, maxDist);
      if (index < 0) return null;
      return { words: words.map((w) => ({ id: w.id, sentence: w.sentence })), index };
    },
    wordInfo(id) {
      if (!wrapRef.current || !textLayerRef.current) return null;
      const { words, rects } = measureWords();
      const i = words.findIndex((w) => w.id === id);
      if (i < 0) return null;
      const wrap = wrapRef.current.getBoundingClientRect();
      return {
        id,
        word: words[i].word,
        context: sentenceText(words, words[i].sentence),
        rect: { left: rects[i].left + wrap.left, right: rects[i].right + wrap.left, top: rects[i].top + wrap.top, bottom: rects[i].bottom + wrap.top },
      };
    },
  }), []);

  // ---------- 후보 단어·문장 강조 ----------
  const marks = (() => {
    if (!target || !wordsRef.current) return null;
    const cand = target.words[target.index];
    const { words, rects } = wordsRef.current;
    const at = words.findIndex((w) => w.id === cand?.id);
    if (at < 0) return null;
    return {
      word: rects[at],
      sentence: rects.filter((_, i) => words[i].sentence === words[at].sentence),
      level: target.level,
    };
  })();
  useEffect(() => {
    candidateRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [target?.index, target?.level]);

  // ---------- 텍스트 선택 → 단어 팝업 ----------
  useEffect(() => () => clearTimeout(selTimerRef.current), []);

  const handleSelection = (point) => {
    clearTimeout(selTimerRef.current);
    selTimerRef.current = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        if (point) cb.current.onClickPoint?.(point);
        return;
      }
      const word = cleanSelection(sel.toString());
      if (!word || word.length > 100) return;
      const anchor = sel.anchorNode;
      const el = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
      if (!el || !textLayerRef.current?.contains(el)) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      cb.current.onSelectText?.({ word, context: el.textContent, rect: { left: rect.left, top: rect.top, bottom: rect.bottom } });
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
          onMouseUp={(e) => handleSelection({ x: e.clientX, y: e.clientY })}
          onTouchEnd={() => handleSelection()}
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
        {marks && marks.sentence.map((r, i) => (
          <div
            key={i}
            className={`target-sentence${marks.level === 'sentence' ? ' active' : ''}`}
            style={{ left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top }}
          />
        ))}
        {marks && marks.level === 'word' && (
          <div
            ref={candidateRef}
            className="target-word"
            style={{ left: marks.word.left, top: marks.word.top, width: marks.word.right - marks.word.left, height: marks.word.bottom - marks.word.top }}
          />
        )}
      </div>
    </section>
  );
});

export default PdfViewer;
