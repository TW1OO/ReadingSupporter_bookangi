import { useState } from 'react'
import { parseMarkdown, type Inline } from './markdown'

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((x, i) =>
        x.t === 'bold' ? <strong key={i}>{x.v}</strong> : x.t === 'code' ? <code key={i}>{x.v}</code> : <span key={i}>{x.v}</span>,
      )}
    </>
  )
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="llm-code">
      <div className="llm-code-bar">
        <span>{lang || 'text'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  )
}

// 내용은 React 가 이스케이프한다(dangerouslySetInnerHTML 사용 안 함).
export function Markdown({ text }: { text: string }) {
  return (
    <div className="llm-md">
      {parseMarkdown(text).map((b, i) => {
        switch (b.t) {
          case 'code':
            return <CodeBlock key={i} lang={b.lang} text={b.text} />
          case 'h': {
            const H = (`h${b.level + 2}` as 'h3' | 'h4' | 'h5')
            return (
              <H key={i}>
                <Inlines items={b.inline} />
              </H>
            )
          }
          case 'ul':
          case 'ol': {
            const L = b.t
            return (
              <L key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inlines items={it} />
                  </li>
                ))}
              </L>
            )
          }
          default:
            return (
              <p key={i}>
                <Inlines items={b.inline} />
              </p>
            )
        }
      })}
    </div>
  )
}
