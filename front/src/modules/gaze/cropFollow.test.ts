import { describe, expect, it } from 'vitest';
import { DEFAULT_CROP, centerCrop, cropToFull, followFace } from './cropFollow';

const W = 1280;
const H = 720;

describe('centerCrop', () => {
  it('640×640 중 480처럼 한 변이 짧은 변의 75%인 정사각형', () => {
    expect(centerCrop(640, 640)).toEqual({ sx: 80, sy: 80, side: 480 });
    expect(centerCrop(W, H)).toEqual({ sx: 370, sy: 90, side: 540 });
  });
});

describe('followFace', () => {
  it('얼굴이 한쪽으로 가면 창이 따라가 수렴한다', () => {
    let c = centerCrop(W, H);
    const face = { x: 400, y: 300 };
    for (let i = 0; i < 60; i++) c = followFace(c, face, W, H);
    // 데드존 안에 들어오면 멈추므로 남는 오차는 데드존 폭 이내다
    expect(Math.abs(c.sx + c.side / 2 - face.x)).toBeLessThanOrEqual(DEFAULT_CROP.deadZone * c.side);
  });

  it('원본 밖으로 나가지 않는다', () => {
    let c = centerCrop(W, H);
    for (let i = 0; i < 200; i++) c = followFace(c, { x: 5, y: 5 }, W, H);
    expect(c.sx).toBeGreaterThanOrEqual(0);
    expect(c.sy).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 400; i++) c = followFace(c, { x: W, y: H }, W, H);
    expect(c.sx + c.side).toBeLessThanOrEqual(W);
    expect(c.sy + c.side).toBeLessThanOrEqual(H);
  });

  it('데드존 안의 미세한 움직임에는 창이 가만히 있다', () => {
    const c0 = centerCrop(W, H);
    const near = { x: c0.sx + c0.side / 2 + c0.side * DEFAULT_CROP.deadZone * 0.5, y: c0.sy + c0.side / 2 };
    const c1 = followFace(c0, near, W, H);
    expect(c1).toEqual(c0);
  });

  it('얼굴이 없으면 원본 중앙으로 천천히 돌아온다 (한 번에 튀지 않는다)', () => {
    let c = { sx: 0, sy: 0, side: 540 };
    const once = followFace(c, null, W, H);
    expect(once.sx).toBeGreaterThan(0);
    expect(once.sx).toBeCloseTo(0.03 * 370, 5); // 중앙까지 거리의 recenter(3%)만큼만
    for (let i = 0; i < 400; i++) c = followFace(c, null, W, H);
    expect(Math.abs(c.sx - (W - c.side) / 2)).toBeLessThan(2);
  });

  it('창 크기는 변하지 않는다', () => {
    const c = followFace(centerCrop(W, H), { x: 100, y: 100 }, W, H);
    expect(c.side).toBe(540);
  });
});

describe('cropToFull', () => {
  it('창 안의 좌표를 원본 정규화 좌표로 되돌린다', () => {
    const c = { sx: 370, sy: 90, side: 540 };
    expect(cropToFull({ x: 0, y: 0 }, c, W, H)).toEqual({ x: 370 / W, y: 90 / H });
    const m = cropToFull({ x: 0.5, y: 0.5 }, c, W, H);
    expect(m.x).toBeCloseTo(0.5, 6);
    expect(m.y).toBeCloseTo(0.5, 6);
  });
});
