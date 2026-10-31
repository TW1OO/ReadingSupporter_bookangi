import { describe, expect, it } from 'vitest'
import { initialState, reduce } from './machine'

describe('state machine', () => {
  it('단어 지정 → 메뉴', () => {
    const s = reduce(initialState, { type: 'WORD_POINTED', wordId: 'w1', source: 'mouse' })
    expect(s.phase).toBe('menu')
  })
  it('주먹(취소) → idle', () => {
    const s = reduce({ ...initialState, phase: 'menu', wordId: 'w1' }, { type: 'CANCEL' })
    expect(s).toMatchObject({ phase: 'idle', wordId: null })
  })
  it('결과 화면에서 탭 전환', () => {
    const s = reduce({ ...initialState, phase: 'result', wordId: 'w1', choice: 'meaning' }, { type: 'MENU_SELECTED', choice: 'explain' })
    expect(s).toMatchObject({ phase: 'result', choice: 'explain' })
  })
  it('idle 에서는 메뉴 선택 무시', () => {
    expect(reduce(initialState, { type: 'MENU_SELECTED', choice: 'meaning' })).toBe(initialState)
  })
})
