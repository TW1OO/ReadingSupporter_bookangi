import { describe, expect, it } from 'vitest'
import { GestureTracker, HOLD_MS, HoldStabilizer, classifyShape, majority, tiltDeg, type Intent, type Phase, type Shape } from './gestures'

describe('HoldStabilizer', () => {
  it('유지 시간 후 한 번만 확정', () => {
    const s = new HoldStabilizer(100)
    expect(s.update(2, 0)).toBeNull()
    expect(s.update(2, 50)).toBeNull()
    expect(s.update(2, 120)).toBe(2)
    expect(s.update(2, 300)).toBeNull()
  })
  it('모양이 바뀌면 다시 센다', () => {
    const s = new HoldStabilizer(100)
    s.update(1, 0)
    s.update(2, 80)
    expect(s.update(2, 150)).toBeNull()
    expect(s.update(2, 190)).toBe(2)
  })
  it('blocked 면 진행 초기화', () => {
    const s = new HoldStabilizer(100)
    s.update(1, 0)
    expect(s.update(1, 200, true)).toBeNull()
    expect(s.update(1, 210)).toBeNull()
  })
})

describe('majority', () => {
  it('튀는 프레임 무시', () => expect(majority([2, 2, 3, 2, 2, 1, 2])).toBe(2))
  it('문자열도 처리', () => expect(majority(['a', 'b', 'a'])).toBe('a'))
})

describe('classifyShape', () => {
  const up = (thumb: boolean, index: boolean, middle: boolean, ring: boolean, pinky: boolean) => ({ thumb, index, middle, ring, pinky })
  it.each<[string, ReturnType<typeof up>, boolean, Shape]>([
    ['주먹', up(false, false, false, false, false), false, 'fist'],
    ['엄지', up(false, false, false, false, false), true, 'thumb'],
    ['엄지+검지', up(true, true, false, false, false), false, 'confirm'],
    ['검지', up(false, true, false, false, false), false, 'one'],
    ['검지+중지', up(false, true, true, false, false), false, 'two'],
    ['검지+중지+약지', up(false, true, true, true, false), false, 'three'],
    ['다 폄', up(true, true, true, true, true), false, 'palm'],
    ['엄지+검지+중지', up(true, true, true, false, false), false, 'none'],
    ['새끼만', up(false, false, false, false, true), false, 'none'],
  ])('%s', (_n, u, open, shape) => expect(classifyShape(u, open)).toBe(shape))
})

describe('tiltDeg', () => {
  const base = { x: 0.5, y: 0.5 }
  it('위로 세우면 0도', () => expect(tiltDeg(base, { x: 0.5, y: 0.3 }, 1)).toBeCloseTo(0))
  it('사용자 오른쪽(영상에서 x가 작은 쪽)은 양수', () => {
    expect(tiltDeg(base, { x: 0.3, y: 0.5 }, 1)).toBeCloseTo(90)
    expect(tiltDeg(base, { x: 0.7, y: 0.5 }, 1)).toBeCloseTo(-90)
  })
  it('화면 비율을 보정한다', () => expect(tiltDeg(base, { x: 0.4, y: 0.4 }, 2)).toBeCloseTo(63.43, 1))
})

// 일정 간격 프레임을 넣고 나온 의도를 모은다
function drive(frames: { shape: Shape; thumbDeg?: number; palmDeg?: number; ms?: number }[], phase: Phase, t = new GestureTracker()) {
  const out: Intent[] = []
  let now = 0
  for (const f of frames) {
    const end = now + (f.ms ?? 33)
    for (; now < end; now += 33) {
      const i = t.update({ shape: f.shape, thumbDeg: f.thumbDeg ?? 0, palmDeg: f.palmDeg ?? 0 }, phase, now)
      if (i) out.push(i)
    }
  }
  return out
}
const HOLD = HOLD_MS + 100

describe('GestureTracker', () => {
  it('읽는 중 엄지를 유지하면 시선 위치 지정을 요청한다', () => {
    expect(drive([{ shape: 'thumb', ms: HOLD }], 'idle')).toEqual([{ kind: 'lock' }])
    expect(drive([{ shape: 'thumb', ms: 200 }], 'idle')).toEqual([])
  })
  it('엄지 35도: 오른쪽은 뒤(다음), 왼쪽은 앞(이전)', () => {
    expect(drive([{ shape: 'thumb', ms: 100 }, { shape: 'thumb', thumbDeg: 70, ms: 200 }], 'adjusting')).toEqual([{ kind: 'move', direction: 1 }])
    expect(drive([{ shape: 'thumb', ms: 100 }, { shape: 'thumb', thumbDeg: -70, ms: 200 }], 'adjusting')).toEqual([{ kind: 'move', direction: -1 }])
  })
  it('35도 미만은 움직이지 않는다', () => {
    expect(drive([{ shape: 'thumb', ms: 100 }, { shape: 'thumb', thumbDeg: 30, ms: 500 }], 'adjusting')).toEqual([])
  })
  it('기울인 채로 있으면 한 칸만, 가운데로 돌아와야 다시 움직인다', () => {
    const r = drive(
      [
        { shape: 'thumb', ms: 100 },
        { shape: 'thumb', thumbDeg: 70, ms: 400 },
        { shape: 'thumb', thumbDeg: 0, ms: 300 },
        { shape: 'thumb', thumbDeg: 70, ms: 400 },
      ],
      'adjusting',
    )
    expect(r).toEqual([{ kind: 'move', direction: 1 }, { kind: 'move', direction: 1 }])
  })
  it('15도 안으로 돌아오지 않으면 다시 움직이지 않는다 (떨림 방지)', () => {
    const r = drive(
      [
        { shape: 'thumb', ms: 100 },
        { shape: 'thumb', thumbDeg: 45, ms: 400 },
        { shape: 'thumb', thumbDeg: 25, ms: 400 },
        { shape: 'thumb', thumbDeg: 45, ms: 400 },
      ],
      'adjusting',
    )
    expect(r).toEqual([{ kind: 'move', direction: 1 }])
  })
  it('기울인 자세로 시작하면 가운데를 거치기 전에는 움직이지 않는다', () => {
    expect(drive([{ shape: 'thumb', thumbDeg: 70, ms: 400 }], 'adjusting')).toEqual([])
  })
  it('조정 중 엄지+검지는 확정, 손 펴기는 문장 단위로 전환', () => {
    expect(drive([{ shape: 'confirm', ms: HOLD }], 'adjusting')).toEqual([{ kind: 'confirm' }])
    expect(drive([{ shape: 'palm', ms: HOLD }], 'adjusting')).toEqual([{ kind: 'back' }])
  })
  it('확정 손 모양이 메뉴에서 바로 선택으로 이어지지 않는다', () => {
    expect(drive([{ shape: 'confirm', ms: HOLD }], 'menu')).toEqual([])
  })
  it('메뉴: 1·2·3 선택, 조정 중에는 무시', () => {
    expect(drive([{ shape: 'one', ms: HOLD }], 'menu')).toEqual([{ kind: 'menu', choice: 'meaning' }])
    expect(drive([{ shape: 'two', ms: HOLD }], 'result')).toEqual([{ kind: 'menu', choice: 'explain' }])
    expect(drive([{ shape: 'three', ms: HOLD }], 'menu')).toEqual([{ kind: 'menu', choice: 'search' }])
    expect(drive([{ shape: 'two', ms: HOLD }], 'adjusting')).toEqual([])
  })
  it('주먹: 읽는 중이 아니면 언제나 취소', () => {
    for (const p of ['adjusting', 'menu', 'result'] as const) {
      expect(drive([{ shape: 'fist', ms: HOLD }], p)).toEqual([{ kind: 'cancel' }])
    }
    expect(drive([{ shape: 'fist', ms: HOLD }], 'idle')).toEqual([])
  })
  it('결과 화면에서 손을 펴고 양쪽 45도로 흔들면 닫는다', () => {
    const r = drive(
      [
        { shape: 'palm', palmDeg: 0, ms: 100 },
        { shape: 'palm', palmDeg: 60, ms: 300 },
        { shape: 'palm', palmDeg: -60, ms: 400 },
      ],
      'result',
    )
    expect(r).toEqual([{ kind: 'close' }])
  })
  it('한쪽만 기울이거나 흔들기가 너무 느리면 닫지 않는다', () => {
    expect(drive([{ shape: 'palm', palmDeg: 60, ms: 500 }], 'result')).toEqual([])
    const slow = drive(
      [
        { shape: 'palm', palmDeg: 60, ms: 300 },
        { shape: 'palm', palmDeg: 0, ms: 2500 },
        { shape: 'palm', palmDeg: -60, ms: 400 },
      ],
      'result',
    )
    expect(slow).toEqual([])
  })
  it('읽는 중 손바닥을 유지하면 쪽 넘기기를 요청하고, 내렸다 펴야 다시 요청한다', () => {
    expect(drive([{ shape: 'palm', ms: HOLD }], 'idle')).toEqual([{ kind: 'palm' }])
    expect(drive([{ shape: 'palm', ms: 300 }], 'idle')).toEqual([])
    expect(drive([{ shape: 'palm', ms: HOLD * 3 }], 'idle')).toEqual([{ kind: 'palm' }])
    const again = drive([{ shape: 'palm', ms: HOLD }, { shape: 'fist', ms: 100 }, { shape: 'palm', ms: HOLD }], 'idle')
    expect(again).toEqual([{ kind: 'palm' }, { kind: 'palm' }])
  })
  it('흔들어 닫은 손을 펴고 있어도 쪽이 넘어가지 않는다', () => {
    const t = new GestureTracker()
    const closed = drive([{ shape: 'palm', palmDeg: 60, ms: 200 }, { shape: 'palm', palmDeg: -60, ms: 300 }], 'result', t)
    expect(closed).toEqual([{ kind: 'close' }])
    let now = 600
    const after = []
    for (; now < 3000; now += 33) {
      const i = t.update({ shape: 'palm', thumbDeg: 0, palmDeg: 0 }, 'idle', now)
      if (i) after.push(i)
    }
    expect(after).toEqual([])
  })
  it('다른 화면에서는 흔들어도 닫지 않는다', () => {
    const wave = [{ shape: 'palm' as const, palmDeg: 60, ms: 300 }, { shape: 'palm' as const, palmDeg: -60, ms: 400 }]
    expect(drive(wave, 'menu')).toEqual([])
  })
})
