const MIN_DISTANCE_PX = 60;
const MAX_DURATION_MS = 600;

// 손가락 이동 → 넘길 쪽 방향. 왼쪽으로 밀면 다음 쪽(1), 오른쪽으로 밀면 이전 쪽(-1), 스와이프가 아니면 0.
// 세로 스크롤과 천천히 끄는 글자 선택을 쪽 넘기기로 오해하지 않게 짧고 가로로 뚜렷한 움직임만 받는다.
export function swipeDirection(dx, dy, ms) {
  if (ms > MAX_DURATION_MS || Math.abs(dx) < MIN_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * 2) return 0;
  return dx < 0 ? 1 : -1;
}
