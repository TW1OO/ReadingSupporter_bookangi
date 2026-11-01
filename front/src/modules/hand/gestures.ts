import type { MenuChoice } from '@/shared/events'
import type { FingerName } from './fingers'

export const HOLD_MS = 700 // 튜닝 대상. 웹캠 테스트에서 안정적이었던 값
export const VOTE_N = 7 // 최근 N프레임 다수결로 손 모양을 정한다
export const TILT_DEG = 35 // 엄지를 이만큼 기울이면 후보를 한 칸 옮긴다
export const REARM_DEG = 15 // 이 안으로 돌아와야 다시 옮길 수 있다
export const WAVE_DEG = 45 // 손을 양쪽으로 각각 이만큼 기울이면 닫는다
export const WAVE_MS = 2000 // 양쪽 기울이기가 이 시간 안에 모두 나와야 한다
const ANGLE_SMOOTH = 0.4 // 각도 평활화 (0~1)

export type Shape = 'fist' | 'thumb' | 'confirm' | 'one' | 'two' | 'three' | 'palm' | 'none'

export type Intent =
  | { kind: 'lock' }
  | { kind: 'move'; direction: -1 | 1 }
  | { kind: 'back' }
  | { kind: 'palm' } // 읽는 중 손바닥 유지 (쪽 넘기기)
  | { kind: 'confirm' }
  | { kind: 'menu'; choice: MenuChoice }
  | { kind: 'close' }
  | { kind: 'cancel' }

const MENU: Partial<Record<Shape, MenuChoice>> = { one: 'meaning', two: 'explain', three: 'search' }

// 손가락 펴짐 → 손 모양. thumbOpen: 네 손가락을 접었을 때 엄지가 벌어져 있는가
export function classifyShape(up: Record<FingerName, boolean>, thumbOpen: boolean): Shape {
  const four = [up.index, up.middle, up.ring, up.pinky].join()
  if (four === 'false,false,false,false') return thumbOpen ? 'thumb' : 'fist'
  if (four === 'true,false,false,false') return up.thumb ? 'confirm' : 'one'
  if (four === 'true,true,false,false') return up.thumb ? 'none' : 'two'
  if (four === 'true,true,true,false') return up.thumb ? 'none' : 'three'
  if (four === 'true,true,true,true') return 'palm'
  return 'none'
}

// 세운 자세를 0도로 한 기울기. 양수면 사용자 기준 오른쪽(거울 화면의 오른쪽)이다.
// image 좌표는 좌우 반전 전이라 사용자의 오른쪽이 x가 작은 쪽이다.
export function tiltDeg(from: { x: number; y: number }, to: { x: number; y: number }, aspect: number): number {
  return (Math.atan2(-(to.x - from.x) * aspect, -(to.y - from.y)) * 180) / Math.PI
}

export function majority<T>(arr: T[]): T {
  const c = new Map<T, number>()
  let best = arr[0]
  for (const v of arr) {
    c.set(v, (c.get(v) ?? 0) + 1)
    if (c.get(v)! > c.get(best)!) best = v
  }
  return best
}

// 같은 값을 holdMs 동안 유지하면 한 번만 확정한다. 다른 값으로 바뀌어야 다시 확정 가능.
export class HoldStabilizer<T = number> {
  private cur: T | null = null
  private since = 0
  private fired = false

  constructor(private holdMs = HOLD_MS) {}

  reset() {
    this.cur = null
    this.fired = false
  }

  // 확정된 값을 돌려주고, 아니면 null. blocked 면 진행을 멈추고 처음부터 다시 센다.
  update(value: T, now: number, blocked = false): T | null {
    if (blocked) {
      this.reset()
      return null
    }
    if (value !== this.cur) {
      this.cur = value
      this.since = now
      this.fired = false
      return null
    }
    if (this.fired || now - this.since < this.holdMs) return null
    this.fired = true
    return value
  }
}

export type Phase = 'idle' | 'adjusting' | 'menu' | 'result'

// 프레임별 손 모양·각도 → 할 일. 웹캠 없이 테스트한다.
export class GestureTracker {
  private stab = new HoldStabilizer<Shape>()
  private prevShape: Shape | null = null
  private thumb = 0
  private palm = 0
  private armed = false
  private rightAt = -Infinity
  private leftAt = -Infinity
  private closedByWave = false // 흔들어 닫은 손을 그대로 펴고 있으면 쪽을 넘기지 않는다

  reset() {
    this.stab.reset()
    this.prevShape = null
    this.armed = false
    this.closedByWave = false
    this.rightAt = this.leftAt = -Infinity
  }

  update(
    f: { shape: Shape; thumbDeg: number; palmDeg: number },
    phase: Phase,
    now: number,
    blocked = false,
  ): Intent | null {
    const entered = f.shape !== this.prevShape
    this.prevShape = f.shape
    this.thumb = entered ? f.thumbDeg : this.thumb + (f.thumbDeg - this.thumb) * ANGLE_SMOOTH
    this.palm = entered ? f.palmDeg : this.palm + (f.palmDeg - this.palm) * ANGLE_SMOOTH
    const held = this.stab.update(f.shape, now, blocked)

    if (phase === 'adjusting' && f.shape === 'thumb' && !blocked) {
      if (Math.abs(this.thumb) < REARM_DEG) this.armed = true
      else if (this.armed && Math.abs(this.thumb) >= TILT_DEG) {
        this.armed = false
        return { kind: 'move', direction: this.thumb > 0 ? 1 : -1 }
      }
    } else if (f.shape !== 'thumb') {
      this.armed = false
    }

    if (phase === 'result' && f.shape === 'palm') {
      if (this.palm >= WAVE_DEG) this.rightAt = now
      if (this.palm <= -WAVE_DEG) this.leftAt = now
      if (now - this.rightAt <= WAVE_MS && now - this.leftAt <= WAVE_MS) {
        this.rightAt = this.leftAt = -Infinity
        this.closedByWave = true
        return { kind: 'close' }
      }
    } else if (f.shape !== 'palm') {
      this.rightAt = this.leftAt = -Infinity
      this.closedByWave = false
    }

    if (held === null) return null
    if (held === 'fist') return phase === 'idle' ? null : { kind: 'cancel' }
    if (held === 'thumb') return phase === 'idle' ? { kind: 'lock' } : null
    if (held === 'confirm') return phase === 'adjusting' ? { kind: 'confirm' } : null
    if (held === 'palm') {
      if (phase === 'adjusting') return { kind: 'back' }
      return phase === 'idle' && !this.closedByWave ? { kind: 'palm' } : null
    }
    const choice = MENU[held]
    return choice && (phase === 'menu' || phase === 'result') ? { kind: 'menu', choice } : null
  }
}
