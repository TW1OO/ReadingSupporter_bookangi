// 손가락 펴짐 판정 — 어느 손가락이든 "몇 개 펴졌는지"만 센다.
//
// image : MediaPipe landmarks (화면 2D). 보이는 그대로라 손바닥/손등 상관없이 믿을 만하다. → 주 판정
// world : MediaPipe worldLandmarks (3D). 각도 계산엔 좋지만 깊이가 추측이라
//         손등을 보일 때 크게 틀린다. → 2D가 애매할 때만 보조로 사용

type P = { x: number; y: number; z?: number }
type V = { x: number; y: number; z: number }
const sub = (a: P, b: P): V => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const len = (v: V) => Math.hypot(v.x, v.y, v.z);
const dist = (a: P, b: P) => len(sub(a, b));
const cos = (u: V, v: V) => (u.x * v.x + u.y * v.y + u.z * v.z) / (len(u) * len(v) + 1e-9);


interface FingerMeasure { reach: number; line2: number; straight3d: number; knuckle3d: number }
export interface ThumbMeasure {
  lat: number; clear: number; width: number; line2: number; away3d: number; side3d: number
}
export type Measures = Record<Exclude<FingerName, 'thumb'>, FingerMeasure> & { thumb: ThumbMeasure }
export interface FingersResult { up: Record<FingerName, boolean>; m: Measures; count: number }

// ───────── 조정값 ─────────
// On 을 넘어야 "펴짐", Off 아래로 떨어져야 "접힘"으로 바뀐다 (경계값 근처 떨림 방지).
export const TH = {
  // [2D 주 판정] 손가락
  reachOn: 0.55,  reachOff: 0.45,   // 화면에서 손가락 뿌리→끝 길이 ÷ 손바닥 길이. 펴면 0.7~1.1, 쥐면 0.1~0.4
  line2On: 0.85,  line2Off: 0.75,   // 화면에서 손가락이 얼마나 일자인지 (1 = 일자)
  // [3D 보조] 2D 길이가 애매할 때(손가락이 약간 카메라 쪽으로 기울었을 때)
  reachMin3d: 0.4, straight3d: 0.92, knuckle3d: 0.6,
  // 엄지
  latOn: 0.45,    latOff: 0.4,      // [2D] 엄지 끝이 손바닥 중심선에서 옆으로 벗어난 정도 ÷ 손바닥 길이
  fistLatOn: 0.6, fistLatOff: 0.52, // [2D] 나머지 네 손가락이 다 접혔을 때 엄지 기준 (주먹 옆에 붙인 엄지는 0.3~0.45)
  thumbLine: 0.8,                   // [2D] 엄지가 일자인지
  clearOn: 0.3,   clearOff: 0.22,   // [2D] 엄지 끝 ↔ 가장 가까운 다른 손가락 관절 거리 ÷ 손바닥 길이
                                    //      접힌 손가락 위에 얹거나 검지 옆에 붙이면 0.1~0.2
  edgeWidth: 0.4,                   // [2D] 손바닥 폭 ÷ 길이가 이보다 작으면 "손을 옆으로 세운 상태"
  edgeSide3d: -0.2,                 // 옆으로 세웠을 때 3D 방향이 이보다 작으면(손바닥 쪽으로 확실히 접힘) 엄지 끔
  thumbAwayOn: 0.95, thumbSideOn: 0.5, latMin3d: 0.28,  // [3D 보조] 손이 옆으로 돌아 2D가 눌렸을 때
};
const REACH_SCALE: Record<string, number> = { index: 1, middle: 1, ring: 0.95, pinky: 0.8 };   // 새끼는 원래 짧음

export const NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
export type FingerName = (typeof NAMES)[number]

const CHAIN: Record<string, number[]> = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };

// aspect: 영상 가로/세로 비율 (image 좌표는 0~1 비율이라 가로를 보정해야 실제 비율 거리가 나옴)
export function measure(world: P[], image: P[], aspect = 640 / 480): Measures {
  const w = world;
  const p = image.map((q) => ({ x: q.x * aspect, y: q.y, z: 0 }));
  const palm = dist(p[0], p[9]) + 1e-9;               // 손바닥 길이 (화면)

  const m = {} as Measures
  for (const [name, [a, b, c, d]] of Object.entries(CHAIN)) {
    ;(m as any)[name] = {
      reach: dist(p[a], p[d]) / palm / REACH_SCALE[name],
      line2: dist(p[a], p[d]) / (dist(p[a], p[b]) + dist(p[b], p[c]) + dist(p[c], p[d]) + 1e-9),
      straight3d: dist(w[a], w[d]) / (dist(w[a], w[b]) + dist(w[b], w[c]) + dist(w[c], w[d])),
      knuckle3d: cos(sub(w[a], w[0]), sub(w[d], w[a])),
    };
  }
  // 손바닥 중심선(손목→중지 뿌리)에서 엄지 끝이 옆으로 얼마나 벗어났나
  const ax = sub(p[9], p[0]), tv = sub(p[4], p[0]);
  const lateral = Math.abs(ax.x * tv.y - ax.y * tv.x) / (len(ax) + 1e-9) / palm;
  // 엄지 끝에서 가장 가까운 다른 손가락 관절까지 거리
  const others = [6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20];
  const clear = Math.min(...others.map((j) => dist(p[4], p[j]))) / palm;
  m.thumb = {
    lat: lateral,
    clear,
    width: dist(p[5], p[17]) / palm,   // 손바닥 폭 (작으면 손을 옆으로 세운 것)
    line2: dist(p[2], p[4]) / (dist(p[2], p[3]) + dist(p[3], p[4]) + 1e-9),
    away3d: dist(w[4], w[17]) / dist(w[2], w[17]),
    side3d: cos(sub(w[4], w[2]), sub(w[5], w[17])),
  };
  return m;
}

// prev: 직전 프레임의 펴짐 상태 (경계값 떨림 방지용)
export function fingersUp(
  world: P[],
  image: P[],
  prev: Partial<Record<FingerName, boolean>> = {},
  aspect?: number,
): FingersResult {
  const m = measure(world, image, aspect);
  const up = {} as Record<FingerName, boolean>
  for (const name of NAMES.slice(1) as Exclude<FingerName, 'thumb'>[]) {
    const f = m[name];
    const by2d = prev[name]
      ? f.reach > TH.reachOff && f.line2 > TH.line2Off
      : f.reach > TH.reachOn && f.line2 > TH.line2On;
    const by3d = f.reach > TH.reachMin3d && f.straight3d > TH.straight3d && f.knuckle3d > TH.knuckle3d;
    up[name] = by2d || by3d;
  }
  const t = m.thumb;
  // 나머지 손가락이 다 접혔으면(주먹 계열) 엄지를 더 엄격하게 본다
  const fist = !up.index && !up.middle && !up.ring && !up.pinky;
  const on = fist ? TH.fistLatOn : TH.latOn, off = fist ? TH.fistLatOff : TH.latOff;
  const t2d = prev.thumb ? t.lat > off && t.line2 > TH.thumbLine - 0.1 && t.clear > TH.clearOff
                         : t.lat > on && t.line2 > TH.thumbLine && t.clear > TH.clearOn;
  const t3d = !fist && t.lat > TH.latMin3d && t.clear > TH.clearOff
              && t.away3d > TH.thumbAwayOn && t.side3d > TH.thumbSideOn;
  // 손을 옆으로 세우면 2D '옆' 값이 실제론 손바닥 앞쪽 방향이라 믿을 수 없음 → 3D 방향도 확인
  const edgeOn = t.width < TH.edgeWidth;
  up.thumb = (t2d || t3d) && (!edgeOn || t.side3d > TH.edgeSide3d);
  return { up, m, count: NAMES.filter((n) => up[n]).length };
}

// 손이 화면 가장자리에 걸렸는지 (걸리면 MediaPipe가 손가락을 놓치기 쉬움)
export function nearEdge(image: P[], margin = 0.03) {
  return image.some((q) => q.x < margin || q.x > 1 - margin || q.y < margin || q.y > 1 - margin);
}
