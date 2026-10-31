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

/**
 * 마무리 확인용 점: 보정 점과도, 검증 점과도 겹치지 않는 안쪽 4곳.
 * 재학습은 검증 점을 학습에 쓰므로, 마무리 효과는 처음 보는 위치에서 재야 정직하다.
 */
export const RECHECK_GRID: ReadonlyArray<readonly [number, number]> = [
  [0.4, 0.4], [0.6, 0.4], [0.4, 0.6], [0.6, 0.6],
];

/** 검증 뒤 마무리 방식. retrain: 검증 점까지 합쳐 재학습 / bias: 검증에서 잰 쏠림을 좌표에서 뺀다 */
export type FinishMode = 'retrain' | 'bias';

export const FINISH_MODE_LABEL_KO: Record<FinishMode, string> = {
  retrain: '재학습',
  bias: '쏠림 보정',
};

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

/** 한 번의 보정 결과: 마무리 전(검증 1)과 마무리 후(검증 2). */
export interface CalibrationReport {
  mode: FinishMode;
  before: ValidationResult;
  after: ValidationResult;
  viewport: { w: number; h: number };
  at: Date;
}

/** 붙여넣기 좋은 텍스트 (대화창/메모/스프레드시트에 그대로). */
export function formatReport(r: CalibrationReport): string {
  const px = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}px` : '-');
  const line = (label: string, v: ValidationResult) =>
    `${label}: 정확도 ${px(v.accuracyPx)} · 평균 오차 ${px(v.meanErrorPx)} · 90% ${px(v.p90ErrorPx)} · 쏠림 x ${Math.round(v.bias.dx)} y ${Math.round(v.bias.dy)} · 샘플 ${v.sampleCount}`;
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = r.at;
  const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const drift = r.before.postureDrift;
  const lines = [
    `[시선 보정 결과] ${when} · 마무리: ${FINISH_MODE_LABEL_KO[r.mode]} · 화면 ${r.viewport.w}x${r.viewport.h}`,
    line('검증1(마무리 전)', r.before),
    line('검증2(마무리 후)', r.after),
    `변화: 정확도 ${signed(r.before.accuracyPx, r.after.accuracyPx)}px · 평균 오차 ${signed(r.before.meanErrorPx, r.after.meanErrorPx)}px`,
  ];
  if (drift) {
    lines.push(`자세 이동: 위치 ${drift.pos.toFixed(3)} · 거리 ${drift.size.toFixed(3)} · 각도 ${drift.angle.toFixed(3)}`);
  }
  return lines.join('\n');
}

/** 표시된(반올림된) 값끼리의 차이. 텍스트 안의 숫자끼리 항상 맞아떨어지게 한다. */
function signed(from: number, to: number): string {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return '-';
  const d = Math.round(to) - Math.round(from);
  return d > 0 ? `+${d}` : `${d}`;
}

export const GRADE_LABEL_KO: Record<Grade, string> = {
  excellent: '매우 좋음',
  good: '좋음',
  fair: '보통',
  poor: '낮음',
};
