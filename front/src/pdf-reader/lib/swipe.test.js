import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe.js';

describe('swipeDirection', () => {
  it('왼쪽으로 밀면 다음 쪽, 오른쪽으로 밀면 이전 쪽', () => {
    expect(swipeDirection(-120, 10, 200)).toBe(1);
    expect(swipeDirection(120, -10, 200)).toBe(-1);
  });
  it('짧은 움직임은 무시한다', () => expect(swipeDirection(-30, 0, 100)).toBe(0));
  it('세로 스크롤은 무시한다', () => expect(swipeDirection(-80, 200, 200)).toBe(0));
  it('대각선이 가로로 뚜렷하지 않으면 무시한다', () => expect(swipeDirection(-100, 60, 200)).toBe(0));
  it('천천히 끌면 무시한다', () => expect(swipeDirection(-200, 0, 900)).toBe(0));
});
