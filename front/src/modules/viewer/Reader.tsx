import type { Dispatch } from 'react'
import type { InputEvent } from '@/shared/events'
import type { State } from '@/modules/state/machine'
import { tokenize } from './tokenize'

// 자작 샘플 문단 (공개 도메인/자작만 사용)
const PARAGRAPHS = [
  { id: 'p1', text: '새벽 안개가 걷히자 마을 어귀의 느티나무가 천천히 모습을 드러냈다.' },
  { id: 'p2', text: '할머니는 낡은 책장에서 빛바랜 공책을 조심스레 꺼내어 펼쳤다.' },
]

// 1단계: 마우스 클릭, 2단계: 손 포인팅으로 단어 지정. 텍스트 → 단어 토큰 분할은 tokenize.ts 담당.
export function Reader(props: {
  state: State
  dispatch: Dispatch<InputEvent>
  hoverWordId?: string | null // 손 포인터가 가까이 있는 단어
}) {
  const { state, dispatch, hoverWordId } = props
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 16, fontSize: 24, lineHeight: 2.2 }}>
      <h1>Book항이</h1>
      {PARAGRAPHS.map((p) => (
        <p key={p.id} data-paragraph-id={p.id}>
          {tokenize(p.id, p.text).map((w) => (
            <span
              key={w.id}
              data-word-id={w.id}
              onClick={() => dispatch({ type: 'WORD_POINTED', wordId: w.id, source: 'mouse' })}
              style={{
                marginRight: '0.3em',
                cursor: 'pointer',
                borderRadius: 4,
                background:
                  state.wordId === w.id ? '#ffe082' : hoverWordId === w.id ? '#e0e0e0' : 'transparent',
              }}
            >
              {w.text}
            </span>
          ))}
        </p>
      ))}
      <p style={{ fontSize: 14 }}>
        손: 검지로 단어 가리키기 → 손가락 1=뜻 · 2=해설 · 3=검색 · 주먹=취소
      </p>
      <pre style={{ fontSize: 12 }}>{JSON.stringify(state)}</pre>
    </main>
  )
}
