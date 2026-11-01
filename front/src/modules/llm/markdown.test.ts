import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './markdown'

describe('parseInline', () => {
  it('굵게와 코드를 분리한다', () => {
    expect(parseInline('가 **나** `다` 라')).toEqual([
      { t: 'text', v: '가 ' },
      { t: 'bold', v: '나' },
      { t: 'text', v: ' ' },
      { t: 'code', v: '다' },
      { t: 'text', v: ' 라' },
    ])
  })
})

describe('parseMarkdown', () => {
  it('제목·문단·목록을 나눈다', () => {
    const b = parseMarkdown('## 뜻\n좌고우면은\n망설인다는 뜻\n\n- 하나\n- 둘\n\n1. 첫째\n2. 둘째')
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'ol'])
    expect(b[2]).toMatchObject({ t: 'ul' })
    expect((b[2] as { items: unknown[] }).items).toHaveLength(2)
  })

  it('닫히지 않은 코드 펜스(스트리밍 중)도 코드 블록으로 본다', () => {
    const b = parseMarkdown('예시:\n```python\nprint("hi")')
    expect(b[1]).toEqual({ t: 'code', lang: 'python', text: 'print("hi")' })
  })

  it('이상한 펜스 줄에서도 멈추지 않는다', () => {
    expect(() => parseMarkdown('```js foo\nx')).not.toThrow()
  })

  it('HTML 은 그대로 텍스트로 남는다(React 가 이스케이프)', () => {
    const b = parseMarkdown('<script>alert(1)</script>')
    expect(b[0]).toEqual({ t: 'p', inline: [{ t: 'text', v: '<script>alert(1)</script>' }] })
  })
})
