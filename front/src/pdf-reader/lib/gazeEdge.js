export const EDGE_RATIO = 0.15; // 화면 폭의 양쪽 이만큼을 쪽 넘기기 영역으로 본다

// 시선이 화면 왼쪽·오른쪽 끝에 있는가. 오차가 약 100px이라 영역을 넓게 잡는다.
export function gazeEdge(x, width, ratio = EDGE_RATIO) {
  if (x <= width * ratio) return 'left';
  if (x >= width * (1 - ratio)) return 'right';
  return null;
}

// 지나온 시선의 평균 x. 최근 시선이 없으면 null
export function averageX(trail, now, maxAgeMs) {
  if (!trail.length || now - trail[trail.length - 1].t > maxAgeMs) return null;
  return trail.reduce((a, p) => a + p.x, 0) / trail.length;
}
