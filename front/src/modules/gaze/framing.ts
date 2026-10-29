/**
 * 카메라 프레이밍: 사용자가 보정 때와 같은 자세(위치/거리/고개 방향)를 유지하도록 돕는다.
 * 시선 회귀는 보정 때 본 자세 근처에서만 믿을 수 있어서, 자세가 벗어나면 오차가 커진다.
 * 전부 순수 함수라 웹캠 없이 테스트한다.
 */
import { headPose, type Landmark } from './linearGaze';

/** 영상 기준 얼굴 자세. x,y,size는 0~1(영상 너비/높이 대비), yaw/pitch는 rad. */
export interface Pose {
  x: number; // 코끝 가로 위치
  y: number; // 코끝 세로 위치
  size: number; // 양 볼 사이 폭 (클수록 카메라에 가깝다)
  yaw: number;
  pitch: number;
}

export interface PostureDrift {
  /** 얼굴 중심 이동량(영상 대비 비율) */
  pos: number;
  /** 얼굴 크기 변화율 |ln(현재/기준)| (거리 변화) */
  size: number;
  /** 고개 방향 변화(rad) */
  angle: number;
}

/**
 * 임계값은 초기 추정치다. 보정 결과(posture drift 로그)와 오차를 같이 보며 조정한다.
 * - ABS: 보정을 시작해도 되는 자세 범위
 * - REL: 시작 때 기준 자세에서 이만큼 벗어나면 경고
 */
export const FRAMING = {
  // 절대 기준은 "극단적으로 벗어난 경우"만 막는다. 노트북 웹캠 팔 길이(약 50cm)에서 얼굴 폭이 0.2 안팎이고,
  // 카메라가 위에 있으면 화면을 볼 때 pitch가 10~20°라서 엄격하게 잡으면 맞출 수가 없다.
  // 자세가 "일정하게 유지되는가"는 시작 때를 기준으로 하는 상대 기준(REL)이 맡는다.
  ABS: { xy: [0.25, 0.75], size: [0.14, 0.65], angle: 0.5 },
  REL: { pos: 0.06, size: 0.1, angle: 0.12 },
} as const;

const IDX = { nose: 1, cheekR: 234, cheekL: 454 };

/** 화면에 보여 줄 자세 수치(디버그/튜닝용). */
export function describePose(p: Pose | null): string {
  if (!p) return '얼굴 없음';
  const deg = (r: number) => Math.round((r * 180) / Math.PI);
  return `x ${p.x.toFixed(2)} · y ${p.y.toFixed(2)} · 크기 ${p.size.toFixed(2)} · 좌우 ${deg(p.yaw)}° · 상하 ${deg(p.pitch)}°`;
}

/** @returns 홍채/변환 행렬이 없으면 null */
export function extractPose(
  lm: ReadonlyArray<Landmark> | undefined,
  M: ArrayLike<number> | undefined,
): Pose | null {
  if (!lm || lm.length <= IDX.cheekL || !M) return null;
  const nose = lm[IDX.nose];
  const size = Math.abs(lm[IDX.cheekL].x - lm[IDX.cheekR].x);
  const hp = headPose(M);
  const p = { x: nose.x, y: nose.y, size, yaw: hp.yaw, pitch: hp.pitch };
  return Object.values(p).every(Number.isFinite) && size > 1e-6 ? p : null;
}

export function averagePoses(poses: ReadonlyArray<Pose>): Pose | null {
  if (!poses.length) return null;
  const n = poses.length;
  const sum = poses.reduce(
    (a, p) => ({ x: a.x + p.x, y: a.y + p.y, size: a.size + p.size, yaw: a.yaw + p.yaw, pitch: a.pitch + p.pitch }),
    { x: 0, y: 0, size: 0, yaw: 0, pitch: 0 },
  );
  return { x: sum.x / n, y: sum.y / n, size: sum.size / n, yaw: sum.yaw / n, pitch: sum.pitch / n };
}

export interface FramingCheck {
  ok: boolean;
  /** 사용자에게 보여 줄 안내. ok면 비어 있다. */
  hints: string[];
}

/**
 * 보정을 시작해도 되는 자세인가.
 * 방향 안내는 거울처럼 보이는 미리보기 기준으로 사용자가 움직일 방향이다.
 * (영상 가로 x가 작으면 사용자가 카메라 기준 자기 오른쪽에 있으니 왼쪽으로 가야 한다.)
 */
export function checkFraming(p: Pose | null): FramingCheck {
  if (!p) return { ok: false, hints: ['얼굴이 인식되지 않습니다'] };
  const { xy, size, angle } = FRAMING.ABS;
  const hints: string[] = [];
  if (p.x < xy[0]) hints.push('조금 왼쪽으로 이동해 주세요');
  else if (p.x > xy[1]) hints.push('조금 오른쪽으로 이동해 주세요');
  if (p.y < xy[0]) hints.push('조금 낮춰 주세요');
  else if (p.y > xy[1]) hints.push('조금 높여 주세요');
  if (p.size < size[0]) hints.push('카메라에 조금 더 가까이 와 주세요');
  else if (p.size > size[1]) hints.push('카메라에서 조금 떨어져 주세요');
  if (Math.hypot(p.yaw, p.pitch) > angle) hints.push('화면 정면을 바라봐 주세요');
  return { ok: hints.length === 0, hints };
}

export function postureDrift(ref: Pose, cur: Pose): PostureDrift {
  return {
    pos: Math.hypot(cur.x - ref.x, cur.y - ref.y),
    size: Math.abs(Math.log(cur.size / ref.size)),
    angle: Math.hypot(cur.yaw - ref.yaw, cur.pitch - ref.pitch),
  };
}

/** 기준 자세에서 허용 범위를 벗어났는가. */
export function checkDrift(d: PostureDrift): FramingCheck {
  const hints: string[] = [];
  if (d.pos > FRAMING.REL.pos) hints.push('처음 자리로 돌아와 주세요');
  if (d.size > FRAMING.REL.size) hints.push('처음과 같은 거리를 유지해 주세요');
  if (d.angle > FRAMING.REL.angle) hints.push('고개를 처음처럼 정면으로 해 주세요');
  return { ok: hints.length === 0, hints };
}
