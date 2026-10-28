/** 보정(9점) 좌표 생성 + 정확도 측정/등급/편향 보정 계산. 전부 순수 함수. */

export type Grade = 'excellent' | 'good' | 'fair' | 'poor';

export const DEFAULT_GRID: ReadonlyArray<readonly [number, number]> = [
  [0.08, 0.1], [0.5, 0.1], [0.92, 0.1],
  [0.08, 0.5], [0.5, 0.5], [0.92, 0.5],
  [0.08, 0.9], [0.5, 0.9], [0.92, 0.9],
];

/** 검증용 점: 보정 점과 겹치지 않게 안쪽 5점 */
export const VALIDATION_GRID: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7],
];

export interface TargetPoint {
  id: number;
  x: number;
  y: number;
}

export function buildPoints(
  width: number,
  height: number,
  grid: ReadonlyArray<readonly [number, number]> = DEFAULT_GRID,
  marginPx = 40,
): TargetPoint[] {
  return grid.map(([fx, fy], id) => ({
    id,
    x: Math.round(Math.min(width - marginPx, Math.max(marginPx, fx * width))),
    y: Math.round(Math.min(height - marginPx, Math.max(marginPx, fy * height))),
  }));
}

export interface ValidationSample {
  targetX: number;
  targetY: number;
  gazeX: number;
  gazeY: number;
}

export interface ValidationResult {
  sampleCount: number;
  meanErrorPx: number;
  p90ErrorPx: number;
  /** 시선이 평균적으로 목표에서 벗어난 방향 (gaze - target) */
  bias: { dx: number; dy: number };
  /** bias를 빼서 보정했을 때 예상 평균 오차 */
  meanErrorAfterBiasPx: number;
  grade: Grade;
  /** bias 보정을 적용할 가치가 있는가 */
  biasWorthApplying: boolean;
}

export function gradeFromError(meanPx: number): Grade {
  if (meanPx < 70) return 'excellent';
  if (meanPx < 110) return 'good';
  if (meanPx < 170) return 'fair';
  return 'poor';
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

export function summarizeValidation(samples: ValidationSample[]): ValidationResult {
  const n = samples.length;
  if (n === 0) {
    return {
      sampleCount: 0, meanErrorPx: NaN, p90ErrorPx: NaN,
      bias: { dx: 0, dy: 0 }, meanErrorAfterBiasPx: NaN,
      grade: 'poor', biasWorthApplying: false,
    };
  }
  const errs = samples.map((s) => Math.hypot(s.gazeX - s.targetX, s.gazeY - s.targetY));
  const mean = errs.reduce((a, b) => a + b, 0) / n;
  const dx = samples.reduce((a, s) => a + (s.gazeX - s.targetX), 0) / n;
  const dy = samples.reduce((a, s) => a + (s.gazeY - s.targetY), 0) / n;
  const errsAfter = samples.map((s) =>
    Math.hypot(s.gazeX - dx - s.targetX, s.gazeY - dy - s.targetY),
  );
  const meanAfter = errsAfter.reduce((a, b) => a + b, 0) / n;
  return {
    sampleCount: n,
    meanErrorPx: mean,
    p90ErrorPx: percentile(errs, 90),
    bias: { dx, dy },
    meanErrorAfterBiasPx: meanAfter,
    grade: gradeFromError(mean),
    // 편향이 크지 않고(오탐 방지), 오차가 의미 있게 줄 때만
    biasWorthApplying: Math.hypot(dx, dy) < 160 && meanAfter < mean - 8,
  };
}

export const GRADE_LABEL_KO: Record<Grade, string> = {
  excellent: '매우 좋음',
  good: '좋음',
  fair: '보통',
  poor: '낮음',
};
