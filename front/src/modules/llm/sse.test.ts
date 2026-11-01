import { describe, expect, it } from 'vitest'
import { createSseParser } from './sse'

describe('createSseParser', () => {
  it('이벤트를 순서대로 뽑는다', () => {
    const got: string[] = []
    const feed = createSseParser((d) => got.push(d))
    feed('data: {"a":1}\n\ndata: {"a":2}\n\n')
    expect(got).toEqual(['{"a":1}', '{"a":2}'])
  })

  it('청크가 중간에서 잘려도 이어 붙인다 (한글 JSON 포함)', () => {
    const got: string[] = []
    const feed = createSseParser((d) => got.push(d))
    feed('data: {"text":"안')
    feed('녕"}\n')
    expect(got).toEqual([])
    feed('\ndata: {"b":1}\n\n')
    expect(got).toEqual(['{"text":"안녕"}', '{"b":1}'])
  })

  it('CRLF 와 data 가 아닌 줄(주석)을 무시한다', () => {
    const got: string[] = []
    const feed = createSseParser((d) => got.push(d))
    feed(': keep-alive\r\n\r\ndata: x\r\n\r\n')
    expect(got).toEqual(['x'])
  })
})
