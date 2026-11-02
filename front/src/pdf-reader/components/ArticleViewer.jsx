import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { cleanSelection } from '../lib/text.js';
import { buildWords, nearestWordIndex, sentenceText } from '../lib/pdfWords.js';
import { columnGap, isSpread } from '../lib/articleLayout.js';
import { usePointerTap } from '../hooks/usePointerTap.js';

/**
 * 웹 글을 책처럼 양쪽 펼침으로 보여 주는 화면. PdfViewer 와 같은 ref(targetAt, wordInfo)를 노출합니다.
 * 원본 HTML 을 넣지 않고 글자만 그립니다. 글자 크기와 줄 간격은 시선 인식을 위해 화면 종류별로 고정입니다.
 */
const ArticleViewer = forwardRef(function ArticleViewer(
  { article, page, gazeRegionId, target, highlightTerm, stageRef, onPageCount, onSelectText, onClickPoint },
  ref
) {
  const clipRef = useRef(null);
  const flowRef = useRef(null);
  const wordsRef = useRef(null);
  const selTimerRef = useRef(0);
  const [layout, setLayout] = useState({ stride: 1, spread: true, version: 0 });

  const cb = useRef({});
  cb.current = { onPageCount, onSelectText, onClickPoint };

  // ---------- 쪽 나누기 ----------
  useLayoutEffect(() => {
    const clip = clipRef.current;
    const flow = flowRef.current;
    if (!clip || !flow) return undefined;
    const measure = () => {
      const w = clip.clientWidth;
      if (!w) return;
      const spread = isSpread(w, clip.clientHeight);
      const gap = columnGap(w);
      flow.style.columnCount = spread ? '2' : '1';
      flow.style.columnGap = `${gap}px`;
      const stride = w + gap; // 한 화면(양쪽)을 넘기는 거리
      const end = flow.querySelector('[data-end]');
      const offset = end.getBoundingClientRect().left - flow.getBoundingClientRect().left;
      wordsRef.current = null;
      setLayout((l) => ({ stride, spread, version: l.version + 1 }));
      cb.current.onPageCount?.(Math.max(1, Math.floor(offset / stride) + 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(clip);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [article]);

  useLayoutEffect(() => {
    if (flowRef.current) flowRef.current.style.transform = `translateX(${-(page - 1) * layout.stride}px)`;
    wordsRef.current = null;
  }, [page, layout]);

  // ---------- 단어 위치 ----------
  const measureWords = () => {
    if (wordsRef.current) return wordsRef.current;
    const clip = clipRef.current.getBoundingClientRect();
    const els = Array.from(flowRef.current.querySelectorAll('.article-block'));
    const words = buildWords(els.map((el, i) => ({ text: el.textContent, newBlock: i > 0 })));
    const range = document.createRange();
    const rects = words.map((w) => {
      const node = els[w.span].firstChild;
      range.setStart(node, w.start);
      range.setEnd(node, w.end);
      const r = range.getBoundingClientRect();
      return { left: r.left - clip.left, top: r.top - clip.top, right: r.right - clip.left, bottom: r.bottom - clip.top };
    });
    // 지금 펼친 쪽에 보이는 단어만 후보가 된다
    const seen = rects.map((r) => r.right > 0 && r.left < clip.width && r.right > r.left);
    wordsRef.current = { words, rects, seen };
    return wordsRef.current;
  };

  useImperativeHandle(ref, () => ({
    targetAt(x, y, maxDist) {
      if (!clipRef.current) return null;
      const { words, rects, seen } = measureWords();
      const shown = words.map((_, i) => i).filter((i) => seen[i]);
      const clip = clipRef.current.getBoundingClientRect();
      const at = nearestWordIndex(shown.map((i) => rects[i]), x - clip.left, y - clip.top, maxDist);
      if (at < 0) return null;
      return { words: shown.map((i) => ({ id: words[i].id, sentence: words[i].sentence })), index: at };
    },
    // 몇 번째 블록이 몇 쪽에 있는가 (검색 결과로 이동)
    pageOfBlock(i) {
      const el = flowRef.current?.querySelector(`[data-gaze-paragraph="a${i}"]`);
      if (!el) return null;
      const offset = el.getBoundingClientRect().left - flowRef.current.getBoundingClientRect().left;
      const w = clipRef.current.clientWidth;
      return Math.floor(offset / (w + columnGap(w))) + 1;
    },
    wordInfo(id) {
      if (!clipRef.current) return null;
      const { words, rects } = measureWords();
      const i = words.findIndex((w) => w.id === id);
      if (i < 0) return null;
      const clip = clipRef.current.getBoundingClientRect();
      return {
        id,
        word: words[i].word,
        context: sentenceText(words, words[i].sentence),
        rect: { left: rects[i].left + clip.left, right: rects[i].right + clip.left, top: rects[i].top + clip.top, bottom: rects[i].bottom + clip.top },
      };
    },
  }), []);

  // ---------- 후보 단어·문장 강조 ----------
  const marks = (() => {
    if (!target || !wordsRef.current) return null;
    const { words, rects, seen } = wordsRef.current;
    const at = words.findIndex((w) => w.id === target.words[target.index]?.id);
    if (at < 0) return null;
    return {
      word: rects[at],
      sentence: rects.filter((_, i) => seen[i] && words[i].sentence === words[at].sentence),
      level: target.level,
    };
  })();

  // ---------- 시선 강조: 시선이 머무는 문단 ----------
  useEffect(() => {
    const el = gazeRegionId && flowRef.current?.querySelector(`[data-gaze-paragraph="${gazeRegionId}"]`);
    if (!el) return undefined;
    el.classList.add('gaze-best');
    return () => el.classList.remove('gaze-best');
  }, [gazeRegionId]);

  // ---------- 클릭·드래그 ----------
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
      if (!el || !flowRef.current?.contains(el)) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      cb.current.onSelectText?.({ word, context: el.textContent, rect: { left: rect.left, top: rect.top, bottom: rect.bottom } });
    }, 180);
  };
  const tap = usePointerTap(handleSelection);

  return (
    <section id="stage" ref={stageRef}>
      <div className="article-paper">
        <div className="article-clip" ref={clipRef}>
          <div className="article-flow" ref={flowRef} {...tap}>
            <h1 className="article-block block-title" data-gaze-paragraph="a-title">{article.title}</h1>
            <p className="article-source">{article.source ?? article.siteName}</p>
            {article.blocks.map((b, i) => (
              <div key={i} className={`article-block block-${b.type}${highlightTerm && b.text.toLocaleLowerCase().includes(highlightTerm) ? ' search-hit' : ''}`} data-gaze-paragraph={`a${i}`}>{b.text}</div>
            ))}
            <span data-end />
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
              className="target-word"
              style={{ left: marks.word.left, top: marks.word.top, width: marks.word.right - marks.word.left, height: marks.word.bottom - marks.word.top }}
            />
          )}
        </div>
      </div>
    </section>
  );
});

export default ArticleViewer;
