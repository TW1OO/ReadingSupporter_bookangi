import { describe, expect, it } from 'vitest';
import { WORD_CORRECTION, measureWordError, nudgeOffset } from './wordCorrection';

const NOW = 1000;
const at = (x: number, y: number, t = NOW) => [{ x, y, t: t - 40 }, { x, y, t: t - 20 }, { x, y, t }];

describe('measureWordError', () => {
  it('시선과 단어의 차이를 잰다', () => {
    expect(measureWordError(at(130, 240), { x: 100, y: 200 }, NOW)).toEqual({ dx: 30, dy: 40 });
  });
  it('샘플이 적으면 버린다', () => {
    expect(measureWordError(at(130, 240).slice(0, 2), { x: 100, y: 200 }, NOW)).toBeNull();
  });
  it('오래된 시선은 쓰지 않는다', () => {
    expect(measureWordError(at(130, 240, 0), { x: 100, y: 200 }, NOW)).toBeNull();
  });
  it('단어에서 너무 멀면 버린다', () => {
    expect(measureWordError(at(600, 200), { x: 100, y: 200 }, NOW)).toBeNull();
  });
  it('시선이 움직이는 중이면 버린다', () => {
    const moving = [{ x: 0, y: 200, t: 960 }, { x: 100, y: 200, t: 980 }, { x: 300, y: 200, t: 1000 }];
    expect(measureWordError(moving, { x: 130, y: 200 }, NOW)).toBeNull();
  });
});

describe('nudgeOffset', () => {
  it('오차의 일부만 반대 방향으로 옮긴다', () => {
    expect(nudgeOffset({ dx: 0, dy: 0 }, { dx: 40, dy: -80 })).toEqual({ dx: -10, dy: 20 });
  });
  it('같은 오차가 반복되면 차츰 줄어든다', () => {
    let offset = { dx: 0, dy: 0 };
    const trueBias = 100;
    for (let i = 0; i < 10; i++) offset = nudgeOffset(offset, { dx: trueBias + offset.dx, dy: 0 });
    expect(Math.abs(trueBias + offset.dx)).toBeLessThan(10);
  });
  it('누적 보정량은 한도를 넘지 않는다', () => {
    const o = nudgeOffset({ dx: -WORD_CORRECTION.maxOffsetPx, dy: 0 }, { dx: 100, dy: 0 });
    expect(Math.hypot(o.dx, o.dy)).toBeCloseTo(WORD_CORRECTION.maxOffsetPx);
  });
});
