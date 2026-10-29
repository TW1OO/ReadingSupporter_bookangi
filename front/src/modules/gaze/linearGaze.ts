/**
 * MediaPipe Face Landmarker(홍채 포함 478점) 랜드마크 -> 특징 벡터 -> 선형(ridge) 회귀 -> 화면 좌표.
 * 전부 순수 함수/클래스라 웹캠 없이 테스트한다.
 */

export interface Landmark {
  x: number; // 0~1 (이미지 너비 기준)
  y: number; // 0~1 (이미지 높이 기준)
}

export const FEATURE_NAMES = [
  'irisU_r', 'irisV_r', 'irisU_l', 'irisV_l', // 눈 좌표계에서의 홍채 오프셋(눈 폭 대비)
  'yaw', 'pitch', 'roll', 'tx', 'ty', 'tz', // 얼굴 변환 행렬에서 뽑은 머리 자세/위치
  // 눈꺼풀 기준: 카메라가 화면 위에 있어 눈을 내리깔면 눈꺼풀이 홍채를 가려 모서리 기준 세로 위치만으로는 신호가 약해진다.
  'lidPos_r', 'lidPos_l', 'eyeOpen',
] as const;

export const FEATURE_DIM = FEATURE_NAMES.length;

/**
 * 표준화할 때 쓰는 특징별 표준편차 하한. 보정 중 머리를 거의 안 움직이면 자세 특징의 표준편차가
 * 0에 가까워지고, 표준화가 그 작은 떨림을 증폭해서 검증 때 머리가 조금만 달라져도 예측이 크게 틀어진다.
 * 홍채 오프셋은 눈 폭 대비, yaw/pitch/roll은 rad, tx/ty/tz는 cm 단위.
 */
export const FEATURE_MIN_STD = [0.01, 0.01, 0.01, 0.01, 0.05, 0.05, 0.05, 2, 2, 3, 0.05, 0.05, 0.02];

/** 눈 뜬 정도(눈꺼풀 거리/눈 폭)가 이보다 작으면 깜빡임으로 보고 프레임을 버린다. */
export const BLINK_OPEN = 0.12;

// MediaPipe face mesh 인덱스. R은 사용자의 오른쪽 눈(영상 왼쪽), L은 왼쪽 눈(영상 오른쪽).
const R = { a: 33, b: 133, up: 159, low: 145, iris: 468 };
const L = { a: 263, b: 362, up: 386, low: 374, iris: 473 };

interface EyeIdx { a: number; b: number; up: number; low: number; iris: number }

function eyeFeatures(lm: ReadonlyArray<Landmark>, idx: EyeIdx, w: number, h: number) {
  const p = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
  let a = p(idx.a);
  let b = p(idx.b);
  if (a.x > b.x) [a, b] = [b, a]; // 영상 기준으로 항상 왼→오 축
  const c = p(idx.iris);
  const u = p(idx.up);
  const l = p(idx.low);
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const width = Math.hypot(ex, ey) || 1;
  const ux = ex / width;
  const uy = ey / width;
  const dx = c.x - (a.x + b.x) / 2;
  const dy = c.y - (a.y + b.y) / 2;
  // 눈 세로 축(perp) 위에서 위/아래 눈꺼풀과 홍채의 위치
  const perpOf = (q: { x: number; y: number }) => -(q.x - (a.x + b.x) / 2) * uy + (q.y - (a.y + b.y) / 2) * ux;
  const pu = perpOf(u);
  const pl = perpOf(l);
  const span = pl - pu;
  return {
    along: (dx * ux + dy * uy) / width,
    perp: (-dx * uy + dy * ux) / width,
    open: Math.hypot(u.x - l.x, u.y - l.y) / width,
    // 0=위눈꺼풀, 1=아래눈꺼풀. 눈이 거의 감기면 의미가 없어서 0.5로 둔다.
    lidPos: span > 1e-6 ? (perpOf(c) - pu) / span : 0.5,
  };
}

/** M: facialTransformationMatrixes[0].data (4×4, column-major) */
export function headPose(M: ArrayLike<number>) {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    yaw: Math.atan2(M[8], M[10]),
    pitch: Math.asin(clamp(-M[9])),
    roll: Math.atan2(M[1], M[5]),
    tx: M[12], ty: M[13], tz: M[14],
  };
}

/**
 * @param w,h video 픽셀 크기 (비율을 살리려고 정규화 좌표에 곱한다)
 * @returns vec: 회귀 입력, open: 눈 뜬 정도(깜빡임 판정용)
 */
export function extractFeatures(
  lm: ReadonlyArray<Landmark> | undefined,
  M: ArrayLike<number> | undefined,
  w: number,
  h: number,
): { vec: number[]; open: number } | null {
  if (!lm || lm.length < 478 || !M) return null; // 홍채 랜드마크(468~477)와 변환 행렬이 필요
  const r = eyeFeatures(lm, R, w, h);
  const l = eyeFeatures(lm, L, w, h);
  const hp = headPose(M);
  const open = (r.open + l.open) / 2;
  const vec = [
    r.along, r.perp, l.along, l.perp,
    hp.yaw, hp.pitch, hp.roll, hp.tx, hp.ty, hp.tz,
    r.lidPos, l.lidPos, open,
  ];
  return vec.every(Number.isFinite) ? { vec, open } : null;
}

/** 정규방정식 A·W = B 를 가우스 소거(부분 피벗)로 푼다. A는 n×n, B는 n×m. */
function solve(A: number[][], B: number[][]): number[][] | null {
  const n = A.length;
  const m = B[0].length;
  const M = A.map((row, i) => [...row, ...B[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      if (k === 0) continue;
      for (let j = c; j < n + m; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row.slice(n).map((v) => v / M[i][i]));
}

export interface TrainSample {
  features: number[];
  x: number;
  y: number;
  /** 같은 목표점에서 모은 샘플끼리 묶는 키. 교차검증에서 한 묶음을 통째로 뺀다. */
  group?: string;
}

interface Params {
  mean: number[];
  std: number[];
  w: number[][]; // (d+1)×2, 마지막 행이 절편
}

/** CV로 고르는 후보 lambda. 보정 점 위치가 9개뿐이라 자유도가 많아 보통 큰 값이 이긴다. */
export const LAMBDA_CANDIDATES = [1, 3, 10, 30, 100, 300, 1000];
/** 묶음이 이 수 이상 있어야 교차검증을 한다. 그보다 적으면 기본 lambda를 쓴다. */
const MIN_GROUPS_FOR_CV = 4;
/** 묶음이 너무 많으면(암묵 클릭 학습) 비용 때문에 직전에 고른 lambda를 재사용한다. */
const MAX_GROUPS_FOR_CV = 24;

/**
 * 로버스트 적합: 1차 적합 뒤 잔차가 중앙값의 TRIM_K배(최소 TRIM_MIN)를 넘는 샘플을 버리고 다시 적합한다.
 * 점을 보지 않고 누른 클릭, 클릭 순간의 깜빡임/곁눈질 같은 잘못된 보정 샘플이 모델 전체를 끌고 가는 것을 막는다.
 * 한 번에 최대 TRIM_MAX_FRAC만 버린다(정상 샘플까지 깎아 내지 않도록).
 */
const TRIM_K = 2.5;
const TRIM_MIN = 0.02; // 정규화 좌표. 1920px 화면에서 약 38px
const TRIM_MAX_FRAC = 0.15;

/**
 * 표준화 + ridge 선형 회귀. 특징 -> (x, y).
 * 목표 좌표는 0~1로 정규화해서 넣는다. px 단위로 넣으면 lambda가 사실상 0이 되어 규제가 사라진다.
 * 절편은 규제하지 않는다. 샘플이 모자라거나 특이행렬이면 fit이 false를 돌려준다.
 *
 * 보정 점이 9곳뿐이라 특징(10개)이 많으면 점들을 그대로 외워 버린다(학습 오차는 작은데 새 위치에서 크게 틀림).
 * 그래서 `cv`가 켜져 있으면 목표점 묶음 단위 leave-one-group-out으로 lambda를 고른다.
 * 마지막으로 잔차가 튀는 샘플을 걸러 다시 적합한다(로버스트 적합).
 */
export class LinearGazeModel {
  private params: Params | null = null;
  private chosenLambda: number;
  private trimmedCount = 0;

  /**
   * @param polyCount 앞쪽 몇 개 특징(홍채 오프셋)의 2차항(제곱·교차)을 추가할지. 0이면 선형.
   */
  constructor(
    private readonly lambda = 1.0,
    private readonly minStd: ReadonlyArray<number> = [],
    private readonly cv = true,
    private readonly polyCount = 0,
  ) {
    this.chosenLambda = lambda;
  }

  /** 특징 확장: 원래 특징 + (앞 polyCount개의 2차항). */
  private expand(f: ReadonlyArray<number>): number[] {
    const out = [...f];
    const k = Math.min(this.polyCount, f.length);
    for (let i = 0; i < k; i++) for (let j = i; j < k; j++) out.push(f[i] * f[j]);
    return out;
  }

  /** 확장된 특징의 표준편차 하한. 2차항은 두 원래 하한의 곱을 쓴다. */
  private expandedMinStd(d: number): number[] {
    const out = [...this.minStd];
    while (out.length < d) out.push(0);
    const k = Math.min(this.polyCount, d);
    for (let i = 0; i < k; i++) {
      for (let j = i; j < k; j++) out.push((this.minStd[i] ?? 0) * (this.minStd[j] ?? 0));
    }
    return out;
  }

  get trained() {
    return this.params !== null;
  }

  /** 마지막 fit에서 쓴 lambda (진단용) */
  get usedLambda() {
    return this.chosenLambda;
  }

  /** 마지막 fit에서 이상치로 버린 샘플 수 (진단용) */
  get trimmed() {
    return this.trimmedCount;
  }

  fit(samples: ReadonlyArray<TrainSample>): boolean {
    const n = samples.length;
    if (n === 0) return false;
    if (n < this.expand(samples[0].features).length + 2) return false; // 파라미터 수보다 여유 있게 있어야 한다

    let lambda = this.chosenLambda;
    if (this.cv) {
      const groups = new Map<string, TrainSample[]>();
      samples.forEach((s, i) => {
        const k = s.group ?? `#${i}`;
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
      });
      if (groups.size >= MIN_GROUPS_FOR_CV && groups.size <= MAX_GROUPS_FOR_CV) {
        lambda = this.pickLambda(groups);
      } else if (groups.size < MIN_GROUPS_FOR_CV) {
        lambda = this.lambda;
      }
    }
    let params = this.solve(samples, lambda);
    if (!params) return false;

    // 로버스트 적합: 잔차가 튀는 샘플을 버리고 같은 lambda로 다시 푼다
    this.trimmedCount = 0;
    const res = samples.map((s) => {
      const q = predictWith(params!, this.expand(s.features));
      return Math.hypot(q.x - s.x, q.y - s.y);
    });
    const sorted = [...res].sort((a, b) => a - b);
    const limit = Math.max(TRIM_K * sorted[Math.floor(sorted.length / 2)], TRIM_MIN);
    const maxDrop = Math.floor(n * TRIM_MAX_FRAC);
    const order = res.map((r, i) => [r, i] as const).sort((a, b) => b[0] - a[0]);
    const drop = new Set(order.filter(([r]) => r > limit).slice(0, maxDrop).map(([, i]) => i));
    if (drop.size > 0) {
      const kept = samples.filter((_, i) => !drop.has(i));
      const refit = this.solve(kept, lambda);
      if (refit) {
        params = refit;
        this.trimmedCount = drop.size;
      }
    }

    this.params = params;
    this.chosenLambda = lambda;
    return true;
  }

  private pickLambda(groups: Map<string, TrainSample[]>): number {
    const keys = [...groups.keys()];
    let best = this.lambda;
    let bestErr = Infinity;
    for (const lam of LAMBDA_CANDIDATES) {
      let sum = 0;
      let cnt = 0;
      let failed = false;
      for (const k of keys) {
        const train = keys.filter((o) => o !== k).flatMap((o) => groups.get(o)!);
        const p = this.solve(train, lam);
        if (!p) {
          failed = true;
          break;
        }
        for (const s of groups.get(k)!) {
          const q = predictWith(p, this.expand(s.features));
          sum += Math.hypot(q.x - s.x, q.y - s.y);
          cnt++;
        }
      }
      if (failed || cnt === 0) continue;
      if (sum / cnt < bestErr) {
        bestErr = sum / cnt;
        best = lam;
      }
    }
    return best;
  }

  private solve(samples: ReadonlyArray<TrainSample>, lambda: number): Params | null {
    const n = samples.length;
    const X = samples.map((s) => this.expand(s.features));
    const d = X[0].length;
    if (n < d + 2) return null;
    const floors = this.expandedMinStd(samples[0].features.length);

    const mean = new Array<number>(d).fill(0);
    for (const f of X) f.forEach((v, j) => (mean[j] += v / n));
    const std = new Array<number>(d).fill(0);
    for (const f of X) f.forEach((v, j) => (std[j] += (v - mean[j]) ** 2 / n));
    const sd = std.map((v, j) => Math.max(Math.sqrt(v), floors[j] ?? 0, 1e-6));

    const p = d + 1;
    const AtA = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const AtY = Array.from({ length: p }, () => [0, 0]);
    for (let k = 0; k < n; k++) {
      const s = samples[k];
      const z = X[k].map((v, j) => (v - mean[j]) / sd[j]);
      z.push(1);
      for (let i = 0; i < p; i++) {
        AtY[i][0] += z[i] * s.x;
        AtY[i][1] += z[i] * s.y;
        for (let j = 0; j < p; j++) AtA[i][j] += z[i] * z[j];
      }
    }
    for (let i = 0; i < d; i++) AtA[i][i] += lambda;

    const w = solve(AtA, AtY);
    if (!w || !w.every((r) => r.every(Number.isFinite))) return null;
    return { mean, std: sd, w };
  }

  predict(features: ReadonlyArray<number>): { x: number; y: number } | null {
    if (!this.params) return null;
    const e = this.expand(features);
    if (e.length !== this.params.mean.length) return null;
    return predictWith(this.params, e);
  }

  reset() {
    this.params = null;
    this.chosenLambda = this.lambda;
    this.trimmedCount = 0;
  }
}

function predictWith(p: Params, features: ReadonlyArray<number>): { x: number; y: number } {
  const last = p.w[p.w.length - 1];
  let x = last[0];
  let y = last[1];
  for (let j = 0; j < features.length; j++) {
    const z = (features[j] - p.mean[j]) / p.std[j];
    x += z * p.w[j][0];
    y += z * p.w[j][1];
  }
  return { x, y };
}
