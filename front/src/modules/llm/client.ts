import {
  API_BASE,
  type ChatMessage,
  type ChatParams,
  type LlmStatus,
  type LlmStreamEvent,
} from '@/shared/api'
import { createSseParser } from './sse'

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json()
    if (typeof j.detail === 'string') return j.detail
    if (Array.isArray(j.detail)) return '요청 형식이 올바르지 않습니다.'
  } catch {
    /* 본문이 JSON 이 아님 */
  }
  return `요청 실패 (${res.status})`
}

export async function getLlmStatus(): Promise<LlmStatus> {
  const res = await fetch(`${API_BASE}/llm/status`)
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json()
}

export async function loadLlm(): Promise<void> {
  const res = await fetch(`${API_BASE}/llm/load`, { method: 'POST' })
  if (!res.ok) throw new Error(await errorMessage(res))
}

// 토큰을 SSE 로 받아 하나씩 내보낸다. signal.abort() 하면 서버도 생성을 멈춘다.
export async function* streamChat(
  messages: ChatMessage[],
  params: ChatParams,
  signal: AbortSignal,
): AsyncGenerator<LlmStreamEvent> {
  const res = await fetch(`${API_BASE}/llm/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, ...params, stream: true }),
    signal,
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  if (!res.body) throw new Error('스트리밍을 지원하지 않는 응답입니다.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const pending: string[] = []
  const feed = createSseParser((d) => pending.push(d))
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    feed(decoder.decode(value, { stream: true }))
    while (pending.length) yield JSON.parse(pending.shift()!) as LlmStreamEvent
  }
}
