import { describe, expect, it } from 'vitest'
import { candidateId, initialState, reduce, type State } from './machine'
import type { InputEvent, TargetWord } from '@/shared/events'

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

// 문장 0: a b c / 문장 1: d e / 문장 2: f
const WORDS: TargetWord[] = [
  { id: 'a', sentence: 0 },
  { id: 'b', sentence: 0 },
  { id: 'c', sentence: 0 },
  { id: 'd', sentence: 1 },
  { id: 'e', sentence: 1 },
  { id: 'f', sentence: 2 },
]
const run = (evs: InputEvent[], from: State = initialState) => evs.reduce(reduce, from)
const lock = (index: number): InputEvent => ({ type: 'TARGET_LOCKED', words: WORDS, index, source: 'thumb' })
const next: InputEvent = { type: 'TARGET_MOVED', direction: 1 }
const prev: InputEvent = { type: 'TARGET_MOVED', direction: -1 }
const back: InputEvent = { type: 'TARGET_BACK' }
const confirm: InputEvent = { type: 'TARGET_CONFIRMED' }

describe('제스처 단어 조정 흐름', () => {
  it('전체 흐름: 문장 지정 → 조정 → 확정 → 메뉴 → 결과 → 닫기', () => {
    let s = run([lock(1), next])
    expect(s.phase).toBe('adjusting')
    expect(candidateId(s)).toBe('c')
    s = reduce(s, confirm)
    expect(s).toMatchObject({ phase: 'menu', wordId: 'c', target: null })
    s = reduce(s, { type: 'MENU_SELECTED', choice: 'explain' })
    expect(s).toMatchObject({ phase: 'result', choice: 'explain' })
    expect(reduce(s, { type: 'CLOSE' })).toMatchObject({ phase: 'idle', wordId: null, choice: null })
  })
  it('단어 이동은 문장을 넘어가고 양 끝에서 멈춘다', () => {
    expect(candidateId(run([lock(2), next]))).toBe('d')
    expect(candidateId(run([lock(0), prev]))).toBe('a')
    expect(candidateId(run([lock(5), next]))).toBe('f')
  })
  it('손 펴기 후에는 문장 단위로 움직이고, 확정하면 단어 조정으로 돌아간다', () => {
    expect(candidateId(run([lock(1), back, next]))).toBe('d')
    expect(candidateId(run([lock(4), back, prev]))).toBe('d')
    expect(candidateId(run([lock(3), back, prev]))).toBe('a')
    expect(candidateId(run([lock(5), back, next]))).toBe('f')
    const s = run([lock(1), back, next, confirm])
    expect(s).toMatchObject({ phase: 'adjusting', target: { level: 'word' } })
    expect(candidateId(reduce(s, next))).toBe('e')
  })
  it('주먹은 조정 중에도 취소한다', () => {
    expect(run([lock(1), { type: 'CANCEL' }])).toMatchObject({ phase: 'idle', target: null })
  })
  it('잘못된 단계의 이벤트는 무시한다', () => {
    expect(reduce(initialState, next)).toBe(initialState)
    expect(reduce(initialState, confirm)).toBe(initialState)
    expect(reduce(initialState, { type: 'CLOSE' })).toBe(initialState)
    expect(reduce(initialState, lock(99))).toBe(initialState)
    const adjusting = run([lock(1)])
    expect(reduce(adjusting, { type: 'MENU_SELECTED', choice: 'meaning' })).toBe(adjusting)
    expect(reduce(adjusting, lock(0))).toBe(adjusting)
    const menu = run([lock(1), confirm])
    expect(reduce(menu, { type: 'CLOSE' })).toBe(menu)
  })
})

describe('문장 해설', () => {
  const explain: InputEvent = { type: 'SENTENCE_EXPLAIN' }
  it('문장 조정 중에는 그 문장의 해설을 바로 연다', () => {
    const s = run([lock(1), back, next, explain])
    expect(s).toMatchObject({ phase: 'result', choice: 'explain', scope: 'sentence', wordId: 'd', target: null })
  })
  it('단어 조정 중에는 무시한다', () => {
    const s = run([lock(1)])
    expect(reduce(s, explain)).toBe(s)
  })
  it('문장 해설에서는 다른 메뉴로 바뀌지 않고, 닫으면 단어 범위로 돌아간다', () => {
    const s = run([lock(1), back, explain])
    expect(reduce(s, { type: 'MENU_SELECTED', choice: 'meaning' })).toBe(s)
    expect(reduce(s, { type: 'CLOSE' })).toMatchObject({ phase: 'idle', scope: 'word' })
    expect(run([lock(1), back, explain, { type: 'CANCEL' }, lock(2), confirm])).toMatchObject({ phase: 'menu', scope: 'word' })
  })
})
