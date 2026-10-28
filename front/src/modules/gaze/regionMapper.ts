import type { GazeRegion, RectLike } from './types';

/* ---------- 순수 함수 (DOM 없이 테스트 가능) ---------- */

export function distanceToRect(x: number, y: number, r: RectLike): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

export function pickNearest<T extends { rect: RectLike }>(
  items: T[],
  x: number,
  y: number,
  tolerance: number,
): { item: T; distance: number } | null {
  let best: { item: T; distance: number } | null = null;
  for (const item of items) {
    const d = distanceToRect(x, y, item.rect);
    if (d <= tolerance && (!best || d < best.distance)) best = { item, distance: d };
  }
  return best;
}

/** 단어 단위 client rect들을 "줄" 단위로 묶는다 (세로 중심이 같은 줄에 속하면 병합). */
export function groupLineRects(rects: RectLike[]): RectLike[] {
  const sorted = rects
    .filter((r) => r.right - r.left > 0 && r.bottom - r.top > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: RectLike[] = [];
  for (const r of sorted) {
    const cy = (r.top + r.bottom) / 2;
    const line = lines.find((l) => cy >= l.top && cy <= l.bottom);
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({ ...r });
    }
  }
  return lines.sort((a, b) => a.top - b.top);
}

export function confidenceFrom(distance: number, tolerance: number): number {
  if (distance <= 0) return 1;
  return Math.max(0, 1 - distance / tolerance) * 0.9;
}

/* ---------- DOM 어댑터 ---------- */

function toRect(r: DOMRect): RectLike {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function lineRectsOf(el: Element): RectLike[] {
  const rects: RectLike[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) rects.push(toRect(r));
  }
  return groupLineRects(rects);
}

/**
 * 시선 좌표(viewport px) → 문단/줄/단어 후보.
 * 뷰어는 문단에 data-gaze-paragraph="p-3", 단어에 data-word-id="p-3-w-12"를 달면 된다.
 */
export function resolveRegion(
  root: ParentNode,
  x: number,
  y: number,
  tolerancePx: number,
): GazeRegion | null {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-gaze-paragraph], [data-paragraph-id]'));
  const items = nodes.map((el) => ({ el, rect: toRect(el.getBoundingClientRect()) }));
  const hit = pickNearest(items, x, y, tolerancePx);
  if (!hit) return null;

  const { el, rect } = hit.item;
  const lines = lineRectsOf(el);
  const lineHit = pickNearest(
    lines.map((rect, index) => ({ rect, index })),
    x,
    y,
    tolerancePx,
  );
  const lineRect = lineHit ? lineHit.item.rect : null;

  let wordIds: string[] = [];
  if (lineRect) {
    const cy = (lineRect.top + lineRect.bottom) / 2;
    wordIds = Array.from(el.querySelectorAll<HTMLElement>('[data-word-id]'))
      .filter((w) => {
        const r = w.getBoundingClientRect();
        return cy >= r.top && cy <= r.bottom;
      })
      .map((w) => w.dataset.wordId!)
      .filter(Boolean);
  }

  return {
    paragraphId: el.dataset.gazeParagraph || el.dataset.paragraphId || el.id || 'unknown',
    paragraphRect: rect,
    lineIndex: lineHit ? lineHit.item.index : null,
    lineRect,
    wordIds,
    confidence: confidenceFrom(hit.distance, tolerancePx),
  };
}
