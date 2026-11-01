import { describe, expect, it } from 'vitest';
import { averageX, gazeEdge } from './gazeEdge.js';

describe('gazeEdge', () => {
  it('양쪽 15%는 끝, 나머지는 가운데', () => {
    expect(gazeEdge(100, 1000)).toBe('left');
    expect(gazeEdge(150, 1000)).toBe('left');
    expect(gazeEdge(151, 1000)).toBeNull();
    expect(gazeEdge(849, 1000)).toBeNull();
    expect(gazeEdge(850, 1000)).toBe('right');
  });
});

describe('averageX', () => {
  it('평균을 낸다', () => {
    expect(averageX([{ x: 100, t: 90 }, { x: 300, t: 100 }], 120, 500)).toBe(200);
  });
  it('최근 시선이 없으면 null', () => {
    expect(averageX([], 100, 500)).toBeNull();
    expect(averageX([{ x: 100, t: 0 }], 1000, 500)).toBeNull();
  });
});
