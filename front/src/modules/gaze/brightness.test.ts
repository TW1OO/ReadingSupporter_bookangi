import { describe, expect, it } from 'vitest';
import { isBrightEnough, isInHandBox, meanLuma } from './brightness';

describe('meanLuma', () => {
  it('흰색은 255, 검은색은 0', () => {
    expect(meanLuma([255, 255, 255, 255])).toBeCloseTo(255);
    expect(meanLuma([0, 0, 0, 255])).toBe(0);
  });
  it('여러 픽셀을 평균 낸다', () => {
    expect(meanLuma([255, 255, 255, 255, 0, 0, 0, 255])).toBeCloseTo(127.5);
  });
  it('비어 있으면 0', () => expect(meanLuma([])).toBe(0));
});

describe('isBrightEnough', () => {
  it('어두우면 false', () => {
    expect(isBrightEnough(30)).toBe(false);
    expect(isBrightEnough(120)).toBe(true);
  });
});

describe('isInHandBox', () => {
  it('오른쪽 아래만 true', () => {
    expect(isInHandBox({ x: 0.8, y: 0.7 })).toBe(true);
    expect(isInHandBox({ x: 0.3, y: 0.7 })).toBe(false);
    expect(isInHandBox({ x: 0.8, y: 0.2 })).toBe(false);
    expect(isInHandBox(null)).toBe(false);
  });
});
