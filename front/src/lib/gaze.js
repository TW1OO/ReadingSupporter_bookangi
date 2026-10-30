// 눈꺼풀 대비 홍채 위치로 시선을 추정합니다.
// 화면 매핑은 근사치이므로 카메라·자세·디스플레이에 맞춘 보정(calibration)이 필요합니다.
function eyeRatio(pts, iris, outer, inner, upper, lower) {
  const p = pts[iris], a = pts[outer], b = pts[inner], u = pts[upper], l = pts[lower];
  if (!p || !a || !b || !u || !l) return null;
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(u.y, l.y), maxY = Math.max(u.y, l.y);
  const dx = Math.max(0.001, maxX - minX);
  const dy = Math.max(0.001, maxY - minY);
  return { x: (p.x - minX) / dx, y: (p.y - minY) / dy };
}

/** @returns {{x:number,y:number}|null} 0..1 정규화 좌표 */
export function estimateGaze(pts) {
  const right = eyeRatio(pts, 468, 33, 133, 159, 145);
  const left = eyeRatio(pts, 473, 362, 263, 386, 374);
  if (!right || !left) return null;
  const rx = (right.x + left.x) / 2;
  const ry = (right.y + left.y) / 2;
  return {
    x: Math.max(0, Math.min(1, (rx - 0.2) / 0.6)),
    y: Math.max(0, Math.min(1, (ry - 0.18) / 0.64)),
  };
}

export function smoothPoint(prev, next, alpha = 0.28) {
  return prev
    ? { x: prev.x + alpha * (next.x - prev.x), y: prev.y + alpha * (next.y - prev.y) }
    : next;
}
