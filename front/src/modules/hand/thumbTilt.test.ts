import { describe, expect, it } from 'vitest'
import type { FingersResult } from './fingers'
import { GestureTracker } from './gestures'
import { PostureGuard } from './posture'

// 화면 가운데의 적당한 크기 손 (가장자리·거리 문제 없음)
const LM = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
LM[0] = { x: 0.5, y: 0.7 }
LM[9] = { x: 0.5, y: 0.4 }
const fingers = (count: number) => ({ count, m: { thumb: { width: 1 } } }) as unknown as FingersResult

// 엄지를 세운 자세(0도)에서 오른쪽으로 45도까지 기울인다. 그동안 손 모양 다수결은 '엄지'로 유지되지만,
// 엄지가 펴졌는지 판정은 각도에 따라 흔들려 손가락 개수가 0과 1 사이를 오간다고 가정한다.
function tilt(useOutOfRange: boolean) {
  const guard = new PostureGuard()
  const tracker = new GestureTracker()
  const moves: number[] = []
  for (let f = 0; f < 40; f++) {
    const now = f * 33
    const deg = f < 10 ? 0 : Math.min(45, (f - 10) * 3)
    const g = guard.update(LM, fingers(f % 2), 0.95, 16 / 9, now)
    const intent = tracker.update({ shape: 'thumb', thumbDeg: deg, palmDeg: 0 }, 'adjusting', now, g.blocked, useOutOfRange ? g.outOfRange : undefined)
    if (intent?.kind === 'move') moves.push(intent.direction)
  }
  return moves
}

describe('엄지 기울이기와 흔들림 차단', () => {
  it('손가락 개수가 흔들리면 흔들림 차단 때문에 움직이지 않는다 (원인 재현)', () => {
    expect(tilt(false)).toEqual([])
  })
  it('기울이기는 화면 범위만 보면 한 칸 움직인다', () => {
    expect(tilt(true)).toEqual([1])
  })
})
