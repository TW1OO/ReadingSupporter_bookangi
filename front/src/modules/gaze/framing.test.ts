import { describe, expect, it } from 'vitest';
import { averagePoses, checkDrift, checkFraming, extractPose, postureDrift, type Pose } from './framing';
import type { Landmark } from './linearGaze';

const GOOD: Pose = { x: 0.5, y: 0.5, size: 0.4, yaw: 0, pitch: 0 };
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('checkFraming', () => {
  it('중앙의 적당한 거리면 통과', () => {
    expect(checkFraming(GOOD)).toEqual({ ok: true, hints: [] });
  });
  it('얼굴이 없으면 안내', () => {
    expect(checkFraming(null).ok).toBe(false);
  });
  it('위치/거리/방향을 각각 안내한다', () => {
    expect(checkFraming({ ...GOOD, x: 0.1 }).hints[0]).toContain('왼쪽');
    expect(checkFraming({ ...GOOD, x: 0.9 }).hints[0]).toContain('오른쪽');
    expect(checkFraming({ ...GOOD, size: 0.05 }).hints[0]).toContain('가까이');
    expect(checkFraming({ ...GOOD, size: 0.9 }).hints[0]).toContain('떨어져');
    expect(checkFraming({ ...GOOD, yaw: 0.7 }).hints[0]).toContain('정면');
  });
  it('노트북 웹캠 팔 길이 자세(크기 0.2, 고개 15° 숙임)는 통과한다', () => {
    expect(checkFraming({ x: 0.5, y: 0.5, size: 0.2, yaw: 0, pitch: (15 * Math.PI) / 180 }).ok).toBe(true);
  });
  it('여러 문제는 모두 안내한다', () => {
    expect(checkFraming({ ...GOOD, x: 0.1, size: 0.05 }).hints).toHaveLength(2);
  });
});

describe('drift', () => {
  it('같은 자세면 0이고 통과', () => {
    const d = postureDrift(GOOD, GOOD);
    expect(d).toEqual({ pos: 0, size: 0, angle: 0 });
    expect(checkDrift(d).ok).toBe(true);
  });
  it('거리 변화는 비율로 본다 (가까워지나 멀어지나 같다)', () => {
    const near = postureDrift(GOOD, { ...GOOD, size: 0.4 * 1.2 }).size;
    const far = postureDrift(GOOD, { ...GOOD, size: 0.4 / 1.2 }).size;
    expect(near).toBeCloseTo(far, 6);
    expect(checkDrift({ pos: 0, size: near, angle: 0 }).ok).toBe(false);
  });
  it('허용 범위를 넘으면 해당 항목만 안내', () => {
    const c = checkDrift(postureDrift(GOOD, { ...GOOD, x: 0.6 }));
    expect(c.ok).toBe(false);
    expect(c.hints).toHaveLength(1);
    expect(c.hints[0]).toContain('자리');
  });
});

describe('extractPose / averagePoses', () => {
  const lm = (): Landmark[] => {
    const a: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    a[234] = { x: 0.3, y: 0.5 };
    a[454] = { x: 0.7, y: 0.5 };
    return a;
  };
  it('볼 폭이 size, 코끝이 x,y', () => {
    const p = extractPose(lm(), IDENTITY)!;
    expect(p.size).toBeCloseTo(0.4, 6);
    expect(p.x).toBe(0.5);
  });
  it('행렬이 없으면 null', () => {
    expect(extractPose(lm(), undefined)).toBeNull();
  });
  it('평균', () => {
    const m = averagePoses([GOOD, { ...GOOD, x: 0.6 }])!;
    expect(m.x).toBeCloseTo(0.55, 6);
    expect(averagePoses([])).toBeNull();
  });
});
