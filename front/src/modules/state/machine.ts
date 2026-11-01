import type { InputEvent, MenuChoice, TargetWord } from '@/shared/events'

export interface Target {
  words: TargetWord[]
  index: number
  level: 'word' | 'sentence'
}

export interface State {
  phase: 'idle' | 'adjusting' | 'menu' | 'result'
  target: Target | null
  wordId: string | null
  choice: MenuChoice | null
  gazeParagraphId: string | null
}

export const initialState: State = {
  phase: 'idle',
  target: null,
  wordId: null,
  choice: null,
  gazeParagraphId: null,
}

// 지금 후보 단어. 조정 중이 아니면 null.
export function candidateId(state: State): string | null {
  return state.target ? (state.target.words[state.target.index]?.id ?? null) : null
}

// 앞뒤 문장의 첫 단어. 없으면 그대로. 앞으로 갈 때 문장 중간이면 그 문장의 처음으로 간다.
function moveSentence({ words, index }: Target, direction: -1 | 1): number {
  const cur = words[index].sentence
  if (direction === 1) {
    const next = words.findIndex((w, i) => i > index && w.sentence !== cur)
    return next < 0 ? index : next
  }
  let i = index
  while (i > 0 && words[i - 1].sentence === cur) i--
  if (i !== index || i === 0) return i
  const prev = words[i - 1].sentence
  i--
  while (i > 0 && words[i - 1].sentence === prev) i--
  return i
}

// 순수 함수: 웹캠/DOM 없이 테스트 가능해야 한다.
export function reduce(state: State, ev: InputEvent): State {
  switch (ev.type) {
    case 'WORD_POINTED':
      return { ...state, phase: 'menu', target: null, wordId: ev.wordId, choice: null }
    case 'TARGET_LOCKED':
      if (state.phase !== 'idle' || !ev.words[ev.index]) return state
      return { ...state, phase: 'adjusting', target: { words: ev.words, index: ev.index, level: 'word' } }
    case 'TARGET_MOVED': {
      if (state.phase !== 'adjusting' || !state.target) return state
      const t = state.target
      const index =
        t.level === 'sentence'
          ? moveSentence(t, ev.direction)
          : Math.min(t.words.length - 1, Math.max(0, t.index + ev.direction))
      return index === t.index ? state : { ...state, target: { ...t, index } }
    }
    case 'TARGET_BACK':
      if (state.phase !== 'adjusting' || !state.target) return state
      return { ...state, target: { ...state.target, level: 'sentence' } }
    case 'TARGET_CONFIRMED':
      if (state.phase !== 'adjusting' || !state.target) return state
      // 문장을 고른 뒤에는 그 문장의 단어 조정으로 돌아가고, 단어를 고르면 메뉴로 간다.
      if (state.target.level === 'sentence') return { ...state, target: { ...state.target, level: 'word' } }
      return { ...state, phase: 'menu', wordId: candidateId(state), target: null, choice: null }
    // 결과 화면에서도 1/2/3으로 탭을 바꿀 수 있다.
    case 'MENU_SELECTED':
      return state.phase === 'menu' || state.phase === 'result' ? { ...state, phase: 'result', choice: ev.choice } : state
    case 'CLOSE':
      return state.phase === 'result' ? { ...state, phase: 'idle', wordId: null, choice: null } : state
    case 'CANCEL':
      return { ...state, phase: 'idle', target: null, wordId: null, choice: null }
    case 'GAZE_PARAGRAPH':
      return { ...state, gazeParagraphId: ev.paragraphId }
  }
}
