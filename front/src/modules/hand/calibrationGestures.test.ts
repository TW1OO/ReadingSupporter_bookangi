import { describe, expect, it } from 'vitest'
import { CalibrationGestureTracker, HOLD_MS, PALM_CLICK_MS, PALM_REARM_MS, classifyShape, type Shape } from './gestures'

const OK_UP = { thumb: false, index: false, middle: true, ring: true, pinky: true }

// 같은 모양을 ms 동안 보여 주고, 그동안 나온 제스처를 돌려준다
function feed(t: CalibrationGestureTracker, clock: { now: number }, shape: Shape, ms: number) {
  const out = []
  for (const end = clock.now + ms; clock.now <= end; clock.now += 30) {
    const g = t.update(shape, clock.now)
    if (g) out.push(g)
  }
  return out
}

describe('OK 표시 판정', () => {
  it('엄지와 검지가 맞닿고 나머지 세 손가락이 펴지면 ok', () => {
    expect(classifyShape(OK_UP, false, true)).toBe('ok')
    expect(classifyShape({ ...OK_UP, index: true }, false, true)).toBe('ok')
  })
  it('맞닿지 않으면 ok 가 아니다', () => {
    expect(classifyShape({ ...OK_UP, index: true, thumb: true }, false, false)).toBe('palm')
  })
  it('세 손가락이 접혀 있으면 ok 가 아니다', () => {
    expect(classifyShape({ ...OK_UP, middle: false }, false, true)).toBe('none')
  })
})

describe('CalibrationGestureTracker', () => {
  it('OK 표시는 유지해야 한 번만 나온다', () => {
    const t = new CalibrationGestureTracker()
    const clock = { now: 0 }
    expect(feed(t, clock, 'ok', HOLD_MS - 100)).toEqual([])
    expect(feed(t, clock, 'ok', 2000)).toEqual(['ok'])
  })
  it('손을 펼 때마다 한 번씩 클릭된다', () => {
    const t = new CalibrationGestureTracker()
    const clock = { now: 0 }
    feed(t, clock, 'fist', PALM_REARM_MS + 30)
    expect(feed(t, clock, 'palm', 1000)).toEqual(['palm'])
    feed(t, clock, 'fist', PALM_REARM_MS + 30)
    expect(feed(t, clock, 'palm', PALM_CLICK_MS + 30)).toEqual(['palm'])
  })
  it('처음부터 펴고 있던 손은 세지 않는다', () => {
    const t = new CalibrationGestureTracker()
    expect(feed(t, { now: 0 }, 'palm', 1000)).toEqual([])
  })
  it('잠깐 흔들려 접힌 것으로는 다시 클릭되지 않는다', () => {
    const t = new CalibrationGestureTracker()
    const clock = { now: 0 }
    feed(t, clock, 'none', PALM_REARM_MS + 30)
    feed(t, clock, 'palm', PALM_CLICK_MS + 30)
    feed(t, clock, 'none', PALM_REARM_MS / 2)
    expect(feed(t, clock, 'palm', 1000)).toEqual([])
  })
})
