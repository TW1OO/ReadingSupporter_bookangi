import { describe, expect, it } from 'vitest'
import { fingersUp } from './fingers'

// 위를 향한 손의 합성 랜드마크. ext = [엄지, 검지, 중지, 약지, 새끼] 펴짐 여부.
function hand(ext: boolean[]) {
  const L = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.8, z: 0 }))
  L[1] = { x: 0.46, y: 0.76, z: 0 }
  L[2] = { x: 0.43, y: 0.72, z: 0 }
  if (ext[0]) {
    L[3] = { x: 0.38, y: 0.68, z: 0 }
    L[4] = { x: 0.33, y: 0.65, z: 0 }
  } else {
    L[3] = { x: 0.45, y: 0.66, z: 0 }
    L[4] = { x: 0.48, y: 0.64, z: 0 }
  }
  const base: [number, number, number][] = [
    [5, 0.44, 1],
    [9, 0.5, 2],
    [13, 0.56, 3],
    [17, 0.62, 4],
  ]
  for (const [b, x, i] of base) {
    L[b] = { x, y: 0.6, z: 0 }
    if (ext[i]) {
      L[b + 1] = { x, y: 0.53, z: 0 }
      L[b + 2] = { x, y: 0.47, z: 0 }
      L[b + 3] = { x, y: 0.41, z: 0 }
    } else {
      L[b + 1] = { x, y: 0.54, z: 0 }
      L[b + 2] = { x, y: 0.6, z: 0 }
      L[b + 3] = { x: x + 0.005, y: 0.64, z: 0 }
    }
  }
  const W = L.map((p) => ({ x: p.x * 0.2, y: p.y * 0.2, z: 0 }))
  return fingersUp(W, L, {}, 4 / 3)
}

describe('fingersUp', () => {
  it.each([
    ['주먹', [false, false, false, false, false], 0],
    ['검지', [false, true, false, false, false], 1],
    ['검지+중지', [false, true, true, false, false], 2],
    ['세 손가락', [false, true, true, true, false], 3],
    ['활짝', [true, true, true, true, true], 5],
  ])('%s → %i개', (_n, ext, count) => {
    expect(hand(ext as boolean[]).count).toBe(count)
  })
})
