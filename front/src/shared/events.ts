// 손/시선/마우스 모듈은 서로를 모른다. 모두 InputEvent만 state로 보낸다.
export type MenuChoice = 'meaning' | 'explain' | 'search'

// 조정 대상 단어. 문서 순서대로 나열하며 sentence 는 문장 번호다.
export interface TargetWord {
  id: string
  sentence: number
}

export type InputEvent =
  | { type: 'WORD_POINTED'; wordId: string; source: 'mouse' }
  | { type: 'TARGET_LOCKED'; words: TargetWord[]; index: number; source: 'dwell' | 'thumb' | 'mouse' }
  | { type: 'TARGET_MOVED'; direction: -1 | 1 } // -1: 앞(이전), 1: 뒤(다음)
  | { type: 'TARGET_BACK' } // 단어 조정 → 문장 조정
  | { type: 'TARGET_CONFIRMED' }
  | { type: 'SENTENCE_EXPLAIN' } // 문장 조정 중 그 문장의 해설을 바로 본다
  | { type: 'CLOSE' }
  | { type: 'MENU_SELECTED'; choice: MenuChoice }
  | { type: 'CANCEL' }
  | { type: 'GAZE_PARAGRAPH'; paragraphId: string | null }
