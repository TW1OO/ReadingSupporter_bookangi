import { describe, expect, it } from 'vitest';
import { layoutTextItem } from './textLayout.js';

describe('layoutTextItem', () => {
  it('가로 글자: 기준선에서 ascent 만큼 올리고 폭은 배율을 반영', () => {
    const l = layoutTextItem({ width: 100, height: 14 }, [14, 0, 0, 14, 60, 200], { ascent: 0.75, fontFamily: 'serif' }, 2);
    expect(l).toMatchObject({ left: 60, top: 200 - 14 * 0.75, fontSize: 14, angle: 0, width: 200, fontFamily: 'serif' });
  });
  it('90도 회전 페이지: 각도를 반영해 옆으로 민다', () => {
    const l = layoutTextItem({ width: 50, height: 10 }, [0, 10, -10, 0, 300, 40], { ascent: 1 }, 1);
    expect(l.angle).toBeCloseTo(Math.PI / 2);
    expect(l.left).toBeCloseTo(310);
    expect(l.top).toBeCloseTo(40);
  });
  it('글꼴 정보가 없으면 기본값', () => {
    const l = layoutTextItem({ width: 10, height: 10 }, [10, 0, 0, 10, 0, 100], undefined, 1);
    expect(l.fontFamily).toBe('sans-serif');
    expect(l.top).toBeCloseTo(92);
  });
});
