import { describe, expect, it } from 'vitest'
import { HoldStabilizer, majority, nearestWord, toGesture, toViewport } from './gestures'

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

describe('toGesture', () => {
  it('매핑', () => {
    expect(toGesture(0)).toEqual({ kind: 'fist' })
    expect(toGesture(2)).toEqual({ kind: 'menu', choice: 'explain' })
    expect(toGesture(5)).toEqual({ kind: 'none' })
  })
})

describe('majority', () => {
  it('튀는 프레임 무시', () => expect(majority([2, 2, 3, 2, 2, 1, 2])).toBe(2))
})

describe('nearestWord', () => {
  const rects = [
    { id: 'a', left: 0, top: 0, right: 50, bottom: 20 },
    { id: 'b', left: 60, top: 0, right: 110, bottom: 20 },
  ]
  it('안쪽/가까운 단어로 스냅', () => {
    expect(nearestWord(rects, 20, 10)).toBe('a')
    expect(nearestWord(rects, 56, 10)).toBe('b')
  })
  it('멀면 null', () => expect(nearestWord(rects, 500, 500)).toBeNull())
})

describe('toViewport', () => {
  it('거울 반전 + 가장자리 보정', () => {
    expect(toViewport(0.5, 0.5, 1000, 800)).toEqual({ x: 500, y: 400 })
    expect(toViewport(0, 0.5, 1000, 800).x).toBe(1000)
    expect(toViewport(0.95, 0, 1000, 800).x).toBe(0)
  })
})
