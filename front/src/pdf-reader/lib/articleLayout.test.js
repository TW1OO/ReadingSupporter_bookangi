import { describe, expect, it } from 'vitest';
import { columnGap, isSpread } from './articleLayout.js';

describe('isSpread', () => {
  it('패드 가로 화면은 양쪽으로 펼친다', () => expect(isSpread(960, 600)).toBe(true));
  it('패드 세로 화면은 한쪽만 보여 준다', () => {
    expect(isSpread(656, 840)).toBe(false);
    expect(isSpread(912, 1200)).toBe(false);
  });
  it('좁은 화면은 가로여도 한쪽만 보여 준다', () => expect(isSpread(700, 300)).toBe(false));
});

describe('columnGap', () => {
  it('패드 폭에서는 간격을 줄인다', () => {
    expect(columnGap(960)).toBe(64);
    expect(columnGap(1140)).toBe(104);
  });
});
