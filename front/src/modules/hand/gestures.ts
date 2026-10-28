import type { MenuChoice } from '@/shared/events'

export type Gesture = { kind: 'menu'; choice: MenuChoice } | { kind: 'fist' } | { kind: 'none' }

export const HOLD_MS = 700 // 튜닝 대상. 웹캠 테스트에서 안정적이었던 값
export const VOTE_N = 7 // 최근 N프레임 다수결로 손가락 개수를 정한다
export const SMOOTH = 0.35 // 포인터 이동 평활화 (0~1)

export const FINGER_TO_CHOICE: Record<1 | 2 | 3, MenuChoice> = {
  1: 'meaning',
  2: 'explain',
  3: 'search',
}

// 손가락 개수 → 제스처. 4·5개는 메뉴에 없으므로 none.
export function toGesture(count: number): Gesture {
  if (count === 0) return { kind: 'fist' }
  if (count === 1 || count === 2 || count === 3) return { kind: 'menu', choice: FINGER_TO_CHOICE[count] }
  return { kind: 'none' }
}

export function majority(arr: number[]): number {
  const c = new Map<number, number>()
  let best = arr[0]
  for (const v of arr) {
    c.set(v, (c.get(v) ?? 0) + 1)
    if (c.get(v)! > c.get(best)!) best = v
  }
  return best
}

// 같은 개수를 holdMs 동안 유지하면 한 번만 확정한다. 다른 개수로 바뀌어야 다시 확정 가능.
export class HoldStabilizer {
  private cur: number | null = null
  private since = 0
  private fired = false

  constructor(private holdMs = HOLD_MS) {}

  reset() {
    this.cur = null
    this.fired = false
  }

  // 확정된 개수를 돌려주고, 아니면 null. blocked 면 진행을 멈추고 처음부터 다시 센다.
  update(count: number, now: number, blocked = false): number | null {
    if (blocked) {
      this.reset()
      return null
    }
    if (count !== this.cur) {
      this.cur = count
      this.since = now
      this.fired = false
      return null
    }
    if (this.fired || now - this.since < this.holdMs) return null
    this.fired = true
    return count
  }
}

export interface WordRect {
  id: string
  left: number
  top: number
  right: number
  bottom: number
}

// 포인터에서 가장 가까운 단어. maxDist(px) 밖이면 null. 사각형 안이면 거리 0.
export function nearestWord(rects: WordRect[], x: number, y: number, maxDist = 60): string | null {
  let best: string | null = null
  let bestD = maxDist
  for (const r of rects) {
    const dx = Math.max(r.left - x, 0, x - r.right)
    const dy = Math.max(r.top - y, 0, y - r.bottom)
    const d = Math.hypot(dx, dy)
    if (d <= bestD) {
      bestD = d
      best = r.id
    }
  }
  return best
}

// 정규화 랜드마크(0~1, 영상 기준) → 뷰포트 px. 거울 반전하고, 가장자리 margin 은 잘라
// 손이 화면 끝까지 안 가도 전체 화면에 닿게 한다.
export function toViewport(nx: number, ny: number, w: number, h: number, margin = 0.1) {
  const clamp = (v: number) => Math.min(1, Math.max(0, (v - margin) / (1 - 2 * margin)))
  return { x: clamp(1 - nx) * w, y: clamp(ny) * h }
}
