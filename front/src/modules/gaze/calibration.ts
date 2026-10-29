/** 보정(13점) 좌표 생성 + 정확도 측정/등급/편향 보정 계산. 전부 순수 함수. */

import type { PostureDrift } from './framing';

export type Grade = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * 13점: 가장자리 3×3 격자(네 모서리·네 변의 중점·중앙) + 격자 네 칸의 중심.
 * 칸의 중심은 인접한 격자점들의 한가운데라서 안쪽(글이 놓이는 영역)의 빈틈을 채운다.
 */
export const DEFAULT_GRID: ReadonlyArray<readonly [number, number]> = [
  [0.08, 0.1], [0.5, 0.1], [0.92, 0.1],
  [0.08, 0.5], [0.5, 0.5], [0.92, 0.5],
  [0.08, 0.9], [0.5, 0.9], [0.92, 0.9],
  [0.29, 0.3], [0.71, 0.3], [0.29, 0.7], [0.71, 0.7],
];

/** 검증용 점: 보정 점들 사이의 중간 지점. 보정 점과 겹치면 외운 점을 다시 재게 된다. */
export const VALIDATION_GRID: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.3], [0.5, 0.7], [0.3, 0.5], [0.7, 0.5],
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
  /** 샘플마다 목표까지 거리의 평균. 정확도와 떨림이 같이 들어간다. */
  meanErrorPx: number;
  /**
   * 정확도(accuracy): 목표점마다 시선 중앙값 위치와 목표의 거리를 구해 평균. 떨림은 빠진다.
   * 시선 추적 연구에서 보통 "오차"라고 부르는 값이고, 문단/줄 판정에 실제로 쓰이는 것도 이 위치다.
   */
  accuracyPx: number;
  p90ErrorPx: number;
  /** 시선이 평균적으로 목표에서 벗어난 방향 (gaze - target) */
  bias: { dx: number; dy: number };
  grade: Grade;
  /** 보정 중 평균 자세 대비 검증 중 평균 자세의 이동량. 오차와의 상관 진단용 */
  postureDrift?: PostureDrift;
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

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarizeValidation(samples: ValidationSample[]): ValidationResult {
  const n = samples.length;
  if (n === 0) {
    return {
      sampleCount: 0, meanErrorPx: NaN, accuracyPx: NaN, p90ErrorPx: NaN,
      bias: { dx: 0, dy: 0 }, grade: 'poor',
    };
  }
  const errs = samples.map((s) => Math.hypot(s.gazeX - s.targetX, s.gazeY - s.targetY));
  const mean = errs.reduce((a, b) => a + b, 0) / n;
  const dx = samples.reduce((a, s) => a + (s.gazeX - s.targetX), 0) / n;
  const dy = samples.reduce((a, s) => a + (s.gazeY - s.targetY), 0) / n;

  const byTarget = new Map<string, ValidationSample[]>();
  for (const s of samples) {
    const k = `${s.targetX},${s.targetY}`;
    (byTarget.get(k) ?? byTarget.set(k, []).get(k)!).push(s);
  }
  const perTarget = [...byTarget.values()].map((g) =>
    Math.hypot(median(g.map((s) => s.gazeX)) - g[0].targetX, median(g.map((s) => s.gazeY)) - g[0].targetY),
  );

  return {
    sampleCount: n,
    meanErrorPx: mean,
    accuracyPx: perTarget.reduce((a, b) => a + b, 0) / perTarget.length,
    p90ErrorPx: percentile(errs, 90),
    bias: { dx, dy },
    grade: gradeFromError(mean),
  };
}

export const GRADE_LABEL_KO: Record<Grade, string> = {
  excellent: '매우 좋음',
  good: '좋음',
  fair: '보통',
  poor: '낮음',
};
