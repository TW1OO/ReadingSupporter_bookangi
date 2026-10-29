import { describe, expect, it } from 'vitest';
import { BLINK_OPEN, FEATURE_DIM, FEATURE_MIN_STD, LinearGazeModel, extractFeatures, type Landmark } from './linearGaze';

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** 정면 얼굴을 흉내 낸 478점. irisDx/irisDy는 눈 너비 대비 홍채 이동량, lid는 눈 뜬 정도. */
function face(irisDx = 0, irisDy = 0, lid = 0.02): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  lm[33] = { x: 0.40, y: 0.42 }; // 오른눈 바깥
  lm[133] = { x: 0.46, y: 0.42 }; // 오른눈 안쪽
  lm[263] = { x: 0.60, y: 0.42 };
  lm[362] = { x: 0.54, y: 0.42 };
  lm[159] = { x: 0.43, y: 0.42 - lid }; lm[145] = { x: 0.43, y: 0.42 + lid };
  lm[386] = { x: 0.57, y: 0.42 - lid }; lm[374] = { x: 0.57, y: 0.42 + lid };
  lm[468] = { x: 0.43 + irisDx * 0.06, y: 0.42 + irisDy * 0.06 };
  lm[473] = { x: 0.57 + irisDx * 0.06, y: 0.42 + irisDy * 0.06 };
  return lm;
}

// 4×4 column-major 단위행렬 = 정면, 이동 없음
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const W = 640;
const H = 480;

describe('extractFeatures', () => {
  it('홍채가 오른쪽/아래로 가면 along/perp가 커진다', () => {
    const c = extractFeatures(face(0, 0), IDENTITY, W, H)!.vec;
    const r = extractFeatures(face(0.3, 0), IDENTITY, W, H)!.vec;
    const d = extractFeatures(face(0, 0.3), IDENTITY, W, H)!.vec;
    expect(c).toHaveLength(FEATURE_DIM);
    expect(r[0]).toBeGreaterThan(c[0]);
    expect(r[2]).toBeGreaterThan(c[2]);
    expect(d[1]).toBeGreaterThan(c[1]);
    expect(d[3]).toBeGreaterThan(c[3]);
  });

  it('머리 자세는 변환 행렬에서 읽는다', () => {
    const M = [...IDENTITY];
    M[8] = Math.sin(0.3); // yaw 0.3rad
    M[10] = Math.cos(0.3);
    M[14] = -40;
    const v = extractFeatures(face(), M, W, H)!.vec;
    expect(v[4]).toBeCloseTo(0.3, 5);
    expect(v[9]).toBe(-40);
  });

  it('눈을 뜬 정도로 깜빡임을 구분한다', () => {
    expect(extractFeatures(face(0, 0, 0.02), IDENTITY, W, H)!.open).toBeGreaterThan(BLINK_OPEN);
    expect(extractFeatures(face(0, 0, 0.001), IDENTITY, W, H)!.open).toBeLessThan(BLINK_OPEN);
  });

  it('홍채 랜드마크나 변환 행렬이 없으면 null', () => {
    expect(extractFeatures(face().slice(0, 468), IDENTITY, W, H)).toBeNull();
    expect(extractFeatures(face(), undefined, W, H)).toBeNull();
  });
});

describe('눈꺼풀 기준 특징', () => {
  it('홍채가 아래로 갈수록 눈꺼풀 기준 위치(lidPos)가 커진다', () => {
    const up = extractFeatures(face(0, -0.2), IDENTITY, W, H)!.vec;
    const mid = extractFeatures(face(0, 0), IDENTITY, W, H)!.vec;
    const down = extractFeatures(face(0, 0.2), IDENTITY, W, H)!.vec;
    expect(up[10]).toBeLessThan(mid[10]);
    expect(mid[10]).toBeLessThan(down[10]);
    expect(mid[10]).toBeCloseTo(0.5, 1);
  });

  it('모든 특징의 하한 배열 길이가 특징 수와 맞는다', () => {
    expect(FEATURE_MIN_STD).toHaveLength(FEATURE_DIM);
  });
});

describe('LinearGazeModel', () => {
  it('선형 관계를 복원한다 (노이즈 포함)', () => {
    const rnd = rng(3);
    const truth = (f: number[]) => ({ x: 0.5 + 4 * f[0], y: 0.5 + 3 * f[1] });
    const make = (n: number) =>
      Array.from({ length: n }, () => {
        const f = Array.from({ length: FEATURE_DIM }, () => (rnd() - 0.5) * 0.2);
        const t = truth(f);
        return { features: f, x: t.x + (rnd() - 0.5) * 0.01, y: t.y + (rnd() - 0.5) * 0.01 };
      });
    const m = new LinearGazeModel(1.0);
    expect(m.fit(make(60))).toBe(true);
    const errs = make(40).map((s) => {
      const p = m.predict(s.features)!;
      return Math.hypot(p.x - s.x, p.y - s.y);
    });
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThan(0.03);
  });

  it('샘플이 모자라면 적합하지 않는다', () => {
    const m = new LinearGazeModel();
    const few = Array.from({ length: 5 }, (_, i) => ({
      features: Array.from({ length: FEATURE_DIM }, () => i),
      x: i,
      y: i,
    }));
    expect(m.fit(few)).toBe(false);
    expect(m.trained).toBe(false);
    expect(m.predict(few[0].features)).toBeNull();
  });

  it('값이 변하지 않는 특징이 있어도 터지지 않는다', () => {
    const rnd = rng(9);
    const s = Array.from({ length: 30 }, () => {
      const f = Array.from({ length: FEATURE_DIM }, () => 0.5);
      f[0] = rnd();
      return { features: f, x: f[0], y: 0.5 };
    });
    const m = new LinearGazeModel();
    expect(m.fit(s)).toBe(true);
    const p = m.predict(s[0].features)!;
    expect(Math.abs(p.x - s[0].x)).toBeLessThan(0.05);
  });

  it('표준편차 하한이 거의 상수인 자세 특징의 증폭을 막는다', () => {
    const rnd = rng(5);
    const mk = (poseShift: number) => {
      const f = Array.from({ length: FEATURE_DIM }, () => 0);
      f[0] = rnd() * 0.1;
      f[9] = 30 + poseShift + (rnd() - 0.5) * 0.02; // tz: 보정 중엔 거의 안 움직임
      return f;
    };
    const train = Array.from({ length: 40 }, () => {
      const f = mk(0);
      return { features: f, x: 0.5 + 3 * f[0], y: 0.5 };
    });
    const test = mk(1.5); // 검증 때 머리가 1.5cm 가까워짐
    const loose = new LinearGazeModel(1.0);
    const floored = new LinearGazeModel(1.0, FEATURE_MIN_STD);
    loose.fit(train);
    floored.fit(train);
    const truth = 0.5 + 3 * test[0];
    expect(Math.abs(floored.predict(test)!.x - truth)).toBeLessThan(
      Math.abs(loose.predict(test)!.x - truth),
    );
  });

  it('특징에 신호가 없으면 교차검증이 큰 lambda를 골라 새 위치에서 덜 틀린다', () => {
    const rnd = rng(11);
    // 점마다 다른 값을 유지하지만 화면 위치와는 무관한 특징(머리 자세 노이즈)만 있는 경우
    const sample = (tx: number, ty: number, pose: number[], tag: string) => ({
      features: pose.map((v) => v + (rnd() - 0.5) * 0.1),
      x: tx,
      y: ty,
      group: tag,
    });
    // 모델 일반 성질을 보는 테스트라 특징 수는 고정(10). 특징 수가 점 수(9)보다 크게 늘면 노이즈가 우연히 위치와 맞아떨어질 수 있다.
    const poseAt = () => Array.from({ length: 10 }, () => (rnd() - 0.5) * 2);
    const grid = [0.1, 0.5, 0.9];
    const train = grid.flatMap((gx) =>
      grid.flatMap((gy) => {
        const pose = poseAt();
        return Array.from({ length: 5 }, () => sample(gx, gy, pose, `${gx},${gy}`));
      }),
    );
    const test = Array.from({ length: 40 }, () =>
      sample(rnd() * 0.8 + 0.1, rnd() * 0.8 + 0.1, poseAt(), 't'),
    );
    const err = (m: LinearGazeModel) =>
      test.reduce((a, s) => {
        const p = m.predict(s.features)!;
        return a + Math.hypot(p.x - s.x, p.y - s.y);
      }, 0) / test.length;
    const plain = new LinearGazeModel(1.0, [], false);
    const cv = new LinearGazeModel(1.0, [], true);
    plain.fit(train);
    cv.fit(train);
    expect(cv.usedLambda).toBeGreaterThan(1);
    expect(err(cv)).toBeLessThan(err(plain));
  });

  it('신호가 뚜렷하면 교차검증도 작은 lambda를 유지한다', () => {
    const rnd = rng(4);
    const grid = [0.1, 0.5, 0.9];
    const train = grid.flatMap((gx) =>
      grid.flatMap((gy) =>
        Array.from({ length: 5 }, () => ({
          features: [gx + (rnd() - 0.5) * 0.02, gy + (rnd() - 0.5) * 0.02, ...new Array(FEATURE_DIM - 2).fill(0)],
          x: gx,
          y: gy,
          group: `${gx},${gy}`,
        })),
      ),
    );
    const cv = new LinearGazeModel(1.0, FEATURE_MIN_STD, true);
    expect(cv.fit(train)).toBe(true);
    expect(cv.usedLambda).toBeLessThanOrEqual(10);
    expect(cv.predict([0.3, 0.7, ...new Array(FEATURE_DIM - 2).fill(0)])!.x).toBeCloseTo(0.3, 1);
  });

  it('2차항 모델은 비선형 관계를 선형 모델보다 잘 맞춘다', () => {
    const rnd = rng(21);
    const truth = (u: number) => 0.5 + 2 * u + 8 * u * u; // 포화되는 비선형
    const mk = (n: number, tag: string) =>
      Array.from({ length: n }, (_, i) => {
        const u = (rnd() - 0.5) * 0.4;
        const f = new Array<number>(FEATURE_DIM).fill(0);
        f[0] = u;
        return { features: f, x: truth(u), y: 0.5, group: `${tag}${i % 12}` };
      });
    const train = mk(60, 'a');
    const test = mk(40, 't');
    const err = (m: LinearGazeModel) =>
      test.reduce((a, s) => a + Math.abs(m.predict(s.features)!.x - s.x), 0) / test.length;
    const lin = new LinearGazeModel(1.0, FEATURE_MIN_STD, true, 0);
    const poly = new LinearGazeModel(1.0, FEATURE_MIN_STD, true, 4);
    expect(lin.fit(train)).toBe(true);
    expect(poly.fit(train)).toBe(true);
    expect(err(poly)).toBeLessThan(err(lin) * 0.5);
  });

  it('점을 보지 않고 누른 클릭(이상치)을 버리고 다시 적합한다', () => {
    const rnd = rng(31);
    const grid = [0.1, 0.5, 0.9];
    const sample = (gx: number, gy: number, lie = false) => {
      const f = new Array<number>(FEATURE_DIM).fill(0);
      f[0] = gx + (rnd() - 0.5) * 0.01;
      f[1] = gy + (rnd() - 0.5) * 0.01;
      // lie: 화면 반대편을 보면서 클릭했다(특징은 반대편, 라벨은 목표점)
      if (lie) [f[0], f[1]] = [1 - gx, 1 - gy];
      return { features: f, x: gx, y: gy, group: `${gx},${gy}` };
    };
    const clean = grid.flatMap((gx) => grid.flatMap((gy) => [0, 1, 2, 3].map(() => sample(gx, gy))));
    const dirty = [...clean, sample(0.1, 0.1, true), sample(0.9, 0.5, true), sample(0.5, 0.9, true)];
    const test = [0.3, 0.7].flatMap((gx) => [0.3, 0.7].map((gy) => sample(gx, gy)));
    const err = (m: LinearGazeModel) =>
      test.reduce((a, s) => {
        const p = m.predict(s.features)!;
        return a + Math.hypot(p.x - s.x, p.y - s.y);
      }, 0) / test.length;

    const ref = new LinearGazeModel(1.0, [], true);
    ref.fit(clean);
    const robust = new LinearGazeModel(1.0, [], true);
    robust.fit(dirty);
    expect(robust.trimmed).toBeGreaterThanOrEqual(3);
    expect(err(robust)).toBeLessThan(err(ref) + 0.01); // 깨끗한 데이터로 학습한 것과 거의 같다
  });

  it('깨끗한 데이터에서는 거의 버리지 않는다 (최대 15%)', () => {
    const rnd = rng(8);
    const s = Array.from({ length: 60 }, (_, i) => {
      const f = new Array<number>(FEATURE_DIM).fill(0);
      f[0] = rnd();
      f[1] = rnd();
      return { features: f, x: f[0] + (rnd() - 0.5) * 0.01, y: f[1], group: `g${i % 12}` };
    });
    const m = new LinearGazeModel(1.0, [], true);
    m.fit(s);
    expect(m.trimmed).toBeLessThanOrEqual(Math.floor(60 * 0.15));
  });
});
