import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './oneEuro';
import { DwellDetector } from './dwell';
import { distanceToRect, groupLineRects, pickNearest } from './regionMapper';
import { buildPoints, gradeFromError, percentile, summarizeValidation } from './calibration';

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
    expect(pts).toHaveLength(9);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(960);
      expect(p.y).toBeGreaterThanOrEqual(40);
      expect(p.y).toBeLessThanOrEqual(560);
    }
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
  it('일정한 쏠림은 bias로 잡히고 보정하면 오차가 줄어든다', () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      samples.push({ targetX: 500, targetY: 300, gazeX: 540 + (i % 2) * 6, gazeY: 270 });
    }
    const r = summarizeValidation(samples);
    expect(r.bias.dx).toBeCloseTo(43, 0);
    expect(r.bias.dy).toBeCloseTo(-30, 0);
    expect(r.meanErrorAfterBiasPx).toBeLessThan(r.meanErrorPx);
    expect(r.biasWorthApplying).toBe(true);
  });
});
