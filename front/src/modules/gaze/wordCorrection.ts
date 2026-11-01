/**
 * 단어 확정 보정: 확정한 단어를 보고 있다고 보고, 시선과 단어의 차이만큼 좌표를 조금씩 옮긴다.
 * 모델은 다시 학습하지 않는다. 틀린 값이 들어와도 영향이 작고, 다음 보정 때 지워진다.
 * 전부 순수 함수라 웹캠 없이 테스트한다.
 */
export const WORD_CORRECTION = {
  /** 확정 직전 이 시간의 시선을 쓴다 */
  windowMs: 500,
  minSamples: 3,
  /** 이보다 멀면 단어를 안 보고 있었다고 보고 버린다 */
  maxErrorPx: 220,
  /** 시선이 이보다 흩어져 있으면 움직이던 중이라 버린다 (중심에서의 평균 거리) */
  maxSpreadPx: 80,
  /** 한 번에 오차의 이 비율만 반영한다 */
  rate: 0.25,
  /** 누적 보정량 한도 */
  maxOffsetPx: 200,
} as const;

export interface GazeSample {
  x: number;
  y: number;
  t: number;
}

export interface Offset {
  dx: number;
  dy: number;
}

/** 시선 - 단어 차이. 믿을 수 없는 측정이면 null */
export function measureWordError(
  trail: ReadonlyArray<GazeSample>,
  word: { x: number; y: number },
  now: number,
): Offset | null {
  const { windowMs, minSamples, maxErrorPx, maxSpreadPx } = WORD_CORRECTION;
  const recent = trail.filter((p) => now - p.t <= windowMs);
  if (recent.length < minSamples) return null;
  const x = recent.reduce((a, p) => a + p.x, 0) / recent.length;
  const y = recent.reduce((a, p) => a + p.y, 0) / recent.length;
  const spread = recent.reduce((a, p) => a + Math.hypot(p.x - x, p.y - y), 0) / recent.length;
  const dx = x - word.x;
  const dy = y - word.y;
  if (spread > maxSpreadPx || Math.hypot(dx, dy) > maxErrorPx) return null;
  return { dx, dy };
}

/** 현재 보정량에 이번 오차의 일부를 반영한다 */
export function nudgeOffset(offset: Offset, error: Offset): Offset {
  const { rate, maxOffsetPx } = WORD_CORRECTION;
  const dx = offset.dx - error.dx * rate;
  const dy = offset.dy - error.dy * rate;
  const len = Math.hypot(dx, dy);
  const k = len > maxOffsetPx ? maxOffsetPx / len : 1;
  return { dx: dx * k, dy: dy * k };
}
