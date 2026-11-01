// 아주 작은 마크다운 파서(외부 의존성 없음). HTML 을 만들지 않고 구조만 돌려준다 → React 가 이스케이프한다.
// 지원: ``` 코드블록(스트리밍 중 닫히지 않아도 됨), #~### 제목, -/* 목록, 1. 목록, **굵게**, `코드`
export type Inline = { t: 'text' | 'bold' | 'code'; v: string }
export type Block =
  | { t: 'p'; inline: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3; inline: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'code'; lang: string; text: string }

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) })
    const tok = m[0]
    out.push(tok.startsWith('`') ? { t: 'code', v: tok.slice(1, -1) } : { t: 'bold', v: tok.slice(2, -2) })
    last = m.index + tok.length
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) })
  return out
}

const UL = /^\s*[-*]\s+(.*)$/
const OL = /^\s*\d+[.)]\s+(.*)$/
const HEAD = /^(#{1,3})\s+(.*)$/

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = /^```([\w+-]*)\s*$/.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++])
      i++ // 닫는 펜스(스트리밍 중이면 EOF)
      blocks.push({ t: 'code', lang: fence[1], text: body.join('\n') })
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    const h = HEAD.exec(line)
    if (h) {
      blocks.push({ t: 'h', level: h[1].length as 1 | 2 | 3, inline: parseInline(h[2]) })
      i++
      continue
    }
    const ordered = OL.test(line)
    if (ordered || UL.test(line)) {
      const re = ordered ? OL : UL
      const items: Inline[][] = []
      let m: RegExpExecArray | null
      while (i < lines.length && (m = re.exec(lines[i]))) {
        items.push(parseInline(m[1]))
        i++
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items })
      continue
    }
    const para: string[] = [lines[i++]] // 첫 줄은 무조건 소비 → 무한 루프 방지
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !HEAD.test(lines[i]) &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i])
    ) {
      para.push(lines[i++])
    }
    blocks.push({ t: 'p', inline: parseInline(para.join('\n')) })
  }
  return blocks
}
