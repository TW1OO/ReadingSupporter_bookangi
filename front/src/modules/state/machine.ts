import type { InputEvent, MenuChoice } from '@/shared/events'

export interface State {
  phase: 'idle' | 'menu' | 'result'
  wordId: string | null
  choice: MenuChoice | null
  gazeParagraphId: string | null
}

export const initialState: State = {
  phase: 'idle',
  wordId: null,
  choice: null,
  gazeParagraphId: null,
}

// 순수 함수: 웹캠/DOM 없이 테스트 가능해야 한다.
export function reduce(state: State, ev: InputEvent): State {
  switch (ev.type) {
    case 'WORD_POINTED':
      return { ...state, phase: 'menu', wordId: ev.wordId, choice: null }
    // 결과 화면에서도 1/2/3으로 탭을 바꿀 수 있다.
    case 'MENU_SELECTED':
      return state.phase === 'idle' ? state : { ...state, phase: 'result', choice: ev.choice }
    case 'CANCEL':
      return { ...state, phase: 'idle', wordId: null, choice: null }
    case 'GAZE_PARAGRAPH':
      return { ...state, gazeParagraphId: ev.paragraphId }
  }
}
