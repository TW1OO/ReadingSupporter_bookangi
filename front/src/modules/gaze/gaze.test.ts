import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './oneEuro';
import { DwellDetector } from './dwell';
import { distanceToRect, groupLineRects, pickNearest } from './regionMapper';
import { VALIDATION_GRID, buildPoints, formatReport, gradeFromError, percentile, summarizeValidation } from './calibration';

const OPTS = { minDurationMs: 700, maxDispersionPx: 140, releaseRadiusPx: 180, windowMs: 2000 };

describe('OneEuroFilter', () => {
  it('떨림을 줄인다', () => {
    const f = new OneEuroFilter({ minCutoff: 0.6, beta: 0.006, dCutoff: 1 });
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 80;
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 120; i++) {
      const v = 500 + rnd();
      raw.push(v);
      out.push(f.filter(v, i * 33));
    }
    const sd = (a: number[]) => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
    };
    expect(sd(out.slice(30))).toBeLessThan(sd(raw.slice(30)) * 0.6);
  });

  it('큰 이동에는 빠르게 따라간다', () => {
    const f = new OneEuroFilter({ minCutoff: 0.6, beta: 0.006, dCutoff: 1 });
    for (let i = 0; i < 30; i++) f.filter(100, i * 33);
    let v = 0;
    for (let i = 30; i < 45; i++) v = f.filter(900, i * 33);
    expect(v).toBeGreaterThan(800);
  });
});

describe('DwellDetector', () => {
  const feed = (d: DwellDetector, from: number, to: number, x: number, y: number) => {
    const out = [];
    for (let t = from; t <= to; t += 33) out.push(d.push({ x: x + (t % 3), y, t }));
    return out.filter(Boolean);
  };

  it('700ms 이상 머무르면 한 번만 발화한다', () => {
    const d = new DwellDetector(OPTS);
    const events = feed(d, 0, 1500, 300, 200);
    expect(events).toHaveLength(1);
    expect(events[0]!.durationMs).toBeGreaterThanOrEqual(700);
  });

  it('짧게 지나가면 발화하지 않는다', () => {
    const d = new DwellDetector(OPTS);
    expect(feed(d, 0, 400, 300, 200)).toHaveLength(0);
  });

  it('멀리 이동하면 다시 무장된다', () => {
    const d = new DwellDetector(OPTS);
    expect(feed(d, 0, 1000, 300, 200)).toHaveLength(1);
    expect(feed(d, 1033, 2500, 800, 500)).toHaveLength(1);
  });
});

describe('regionMapper', () => {
  const r = { left: 100, top: 100, right: 300, bottom: 200 };
  it('거리 계산', () => {
    expect(distanceToRect(150, 150, r)).toBe(0);
    expect(distanceToRect(350, 150, r)).toBe(50);
    expect(distanceToRect(303, 204, r)).toBe(5);
  });
  it('허용 거리 안에서 가장 가까운 것을 고른다', () => {
    const items = [
      { id: 'a', rect: r },
      { id: 'b', rect: { left: 100, top: 260, right: 300, bottom: 340 } },
    ];
    expect(pickNearest(items, 200, 235, 70)?.item.id).toBe('b'); // a까지 35px, b까지 25px
  });
  it('허용 거리를 넘으면 null', () => {
    expect(pickNearest([{ rect: r }], 600, 600, 70)).toBeNull();
  });
  it('단어 rect를 줄 단위로 묶는다', () => {
    const rects = [
      { left: 10, top: 10, right: 50, bottom: 30 },
      { left: 55, top: 11, right: 90, bottom: 31 },
      { left: 10, top: 40, right: 60, bottom: 60 },
    ];
    const lines = groupLineRects(rects);
    expect(lines).toHaveLength(2);
    expect(lines[0].right).toBe(90);
  });
});

describe('calibration', () => {
  it('점이 화면 안쪽 여백을 지킨다', () => {
    const pts = buildPoints(1000, 600);
    expect(pts).toHaveLength(13);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(960);
      expect(p.y).toBeGreaterThanOrEqual(40);
      expect(p.y).toBeLessThanOrEqual(560);
    }
  });
  it('검증 점은 보정 점과 겹치지 않고 충분히 떨어져 있다', () => {
    const cal = buildPoints(1000, 600);
    const val = buildPoints(1000, 600, VALIDATION_GRID);
    for (const v of val) {
      const nearest = Math.min(...cal.map((c) => Math.hypot(c.x - v.x, c.y - v.y)));
      expect(nearest).toBeGreaterThan(100);
    }
  });
  it('격자 네 칸의 중심 점은 인접 격자점의 한가운데다', () => {
    const pts = buildPoints(1000, 600, undefined, 0);
    const at = (x: number, y: number) => pts.find((p) => p.x === x && p.y === y);
    expect(at(290, 180)).toBeDefined(); // (0.08,0.1)·(0.5,0.5) 사이 칸의 중심
    expect(at(710, 420)).toBeDefined();
  });
  it('등급 경계', () => {
    expect(gradeFromError(50)).toBe('excellent');
    expect(gradeFromError(100)).toBe('good');
    expect(gradeFromError(150)).toBe('fair');
    expect(gradeFromError(250)).toBe('poor');
  });
  it('percentile', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
  });
  it('일정한 쏠림은 bias로 잡힌다', () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      samples.push({ targetX: 500, targetY: 300, gazeX: 540 + (i % 2) * 6, gazeY: 270 });
    }
    const r = summarizeValidation(samples);
    expect(r.bias.dx).toBeCloseTo(43, 0);
    expect(r.bias.dy).toBeCloseTo(-30, 0);
  });
  it('정확도는 점별 중앙 위치 기준이라 떨림이 빠진다', () => {
    // 목표 바로 위에서 좌우로 ±60px 떨리는 시선: 샘플별 오차는 60px이지만 중앙 위치는 목표와 같다
    const samples = Array.from({ length: 20 }, (_, i) => ({
      targetX: 500, targetY: 300, gazeX: 500 + (i % 2 ? 60 : -60), gazeY: 300,
    }));
    const r = summarizeValidation(samples);
    expect(r.meanErrorPx).toBeCloseTo(60, 6);
    expect(r.accuracyPx).toBeCloseTo(0, 6);
  });
  it('정확도는 목표점마다 구해 평균한다', () => {
    const samples = [
      ...Array.from({ length: 5 }, () => ({ targetX: 100, targetY: 100, gazeX: 130, gazeY: 140 })), // 50px
      ...Array.from({ length: 50 }, () => ({ targetX: 500, targetY: 300, gazeX: 510, gazeY: 300 })), // 10px
    ];
    expect(summarizeValidation(samples).accuracyPx).toBeCloseTo(30, 6); // 샘플 수가 아니라 점 단위 평균
  });
});

describe('formatReport', () => {
  const v = (acc: number, mean: number, dx: number, dy: number) => ({
    sampleCount: 140, meanErrorPx: mean, accuracyPx: acc, p90ErrorPx: mean * 1.6,
    bias: { dx, dy }, grade: 'good' as const,
  });
  const report = {
    mode: 'retrain' as const,
    before: { ...v(95.4, 120.2, 12.3, 40.6), postureDrift: { pos: 0.0041, size: 0.0022, angle: 0.0113 } },
    after: v(70.1, 98.7, 3, -8),
    viewport: { w: 1920, h: 1065 },
    at: new Date(2026, 9, 30, 14, 5),
  };

  it('붙여넣기 좋은 여러 줄 텍스트: 머리말, 검증1, 검증2, 변화, 자세', () => {
    const lines = formatReport(report).split('\n');
    expect(lines[0]).toBe('[시선 보정 결과] 2026-10-30 14:05 · 마무리: 재학습 · 화면 1920x1065');
    expect(lines[1]).toBe('검증1(마무리 전): 정확도 95px · 평균 오차 120px · 90% 192px · 쏠림 x 12 y 41 · 샘플 140');
    expect(lines[2]).toContain('검증2(마무리 후): 정확도 70px');
    expect(lines[3]).toBe('변화: 정확도 -25px · 평균 오차 -21px'); // 표시값 99 - 120
    expect(lines[4]).toBe('자세 이동: 위치 0.004 · 거리 0.002 · 각도 0.011');
  });

  it('쏠림 보정 방식이면 머리말에 표시되고, 자세 정보가 없으면 그 줄은 빠진다', () => {
    const text = formatReport({ ...report, mode: 'bias', before: v(95, 120, 0, 0) });
    expect(text).toContain('마무리: 쏠림 보정');
    expect(text.split('\n')).toHaveLength(4);
  });

  it('잴 수 없었던 값은 - 로 쓴다', () => {
    const empty = { ...v(NaN, NaN, 0, 0), sampleCount: 0 };
    expect(formatReport({ ...report, after: empty })).toContain('검증2(마무리 후): 정확도 - · 평균 오차 -');
  });
});
