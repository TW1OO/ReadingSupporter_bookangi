import { describe, expect, it } from 'vitest';
import { pageFitScale } from './pageFit.js';

const phoneLandscape = { stageW: 844, stageH: 390, padX: 44, padY: 100, pageW: 595, pageH: 842 };

describe('pageFitScale', () => {
  it('기본은 쪽 전체가 들어오는 배율', () => {
    expect(pageFitScale(phoneLandscape)).toBeCloseTo(290 / 842);
  });
  it('widthOnly 면 높이를 보지 않는다', () => {
    expect(pageFitScale({ ...phoneLandscape, widthOnly: true })).toBeCloseTo(800 / 595);
  });
  it('세로 화면에서는 너비가 먼저 닿는다', () => {
    expect(pageFitScale({ stageW: 390, stageH: 844, padX: 16, padY: 180, pageW: 595, pageH: 842 })).toBeCloseTo(374 / 595);
  });
});
