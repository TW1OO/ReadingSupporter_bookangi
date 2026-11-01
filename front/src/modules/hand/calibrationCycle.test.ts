import { describe, expect, it } from 'vitest'
import type { FingersResult } from './fingers'
import { CalibrationGestureTracker, VOTE_N, majority, type Shape } from './gestures'
import { PostureGuard } from './posture'

// 화면 가운데의 적당한 크기 손 (가장자리·거리 문제 없음)
const LM = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
LM[0] = { x: 0.5, y: 0.7 }
LM[9] = { x: 0.5, y: 0.4 }

const fingers = (count: number) => ({ count, m: { thumb: { width: 1 } } }) as unknown as FingersResult

// 접고 펴는 동안 손가락이 하나씩 움직이므로 개수가 차례로 바뀐다
const CYCLE = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]

function run(useBlocked: boolean) {
  const guard = new PostureGuard()
  const tracker = new CalibrationGestureTracker()
  const votes: Shape[] = []
  let clicks = 0
  let blockedFrames = 0
  // 처음 손을 들기 전 상태에서 시작해 30fps 로 여섯 번 접었다 편다
  for (let f = 0; f < CYCLE.length * 6; f++) {
    const count = CYCLE[(f + 14) % CYCLE.length]
    const now = f * 33
    const g = guard.update(LM, fingers(count), 0.95, 16 / 9, now)
    if (g.blocked) blockedFrames++
    votes.push(count === 5 ? 'palm' : count === 0 ? 'fist' : 'none')
    if (votes.length > VOTE_N) votes.shift()
    const shape = majority(votes)
    const off = useBlocked ? g.blocked : g.outOfRange
    if (tracker.update(off ? 'none' : shape, now)) clicks++
  }
  return { clicks, blockedFrames }
}

describe('보정 중 손을 접었다 펴기를 반복할 때', () => {
  it('흔들림 차단을 그대로 쓰면 첫 뒤로 클릭을 놓친다 (원인 재현)', () => {
    const { clicks, blockedFrames } = run(true)
    expect(blockedFrames).toBeGreaterThan(0)
    expect(clicks).toBeLessThan(6)
  })
  it('화면 범위만 보면 펼 때마다 클릭된다', () => {
    expect(run(false).clicks).toBe(6)
  })
})
