import { useEffect, useRef, useState } from 'react';

const THUMB_CSS_WIDTH = 200; // 화면에 표시되는 대략적인 가로 크기(px). 선명도 계산에만 사용

// 화면에 보일 때만 렌더링해서 페이지가 많은 PDF에서도 가볍게 동작합니다.
export default function Thumbnail({ pdfDoc, pageNumber, total, active, onSelect }) {
  const btnRef = useRef(null);
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = btnRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); io.disconnect(); }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task = null;
    setReady(false);
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        // 큰 썸네일이 흐려지지 않도록 devicePixelRatio를 반영해 렌더링
        const dpr = window.devicePixelRatio || 1;
        const base = page.getViewport({ scale: 1, rotation: 0 });
        const viewport = page.getViewport({ scale: (THUMB_CSS_WIDTH * dpr) / base.width, rotation: 0 });
        const canvas = canvasRef.current;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
        if (!cancelled) setReady(true);
      } catch {
        /* 취소/파기된 렌더는 무시 */
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [visible, pdfDoc, pageNumber]);

  // 현재 페이지 썸네일이 항상 목록 안에 보이도록 스크롤
  useEffect(() => {
    if (active) btnRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <button ref={btnRef} className={`thumb${active ? ' active' : ''}`} onClick={onSelect}>
      <canvas ref={canvasRef} width={1} height={1} style={{ display: ready ? 'block' : 'none' }} />
      <span>{pageNumber}/{total}</span>
    </button>
  );
}
