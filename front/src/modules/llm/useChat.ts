import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatParams } from '@/shared/api'
import { streamChat } from './client'
import { PRESETS } from './presets'

export interface MsgStats {
  ttftMs: number | null
  tokPerS: number | null
  completionTokens: number
  promptTokens: number | null
  nCtx: number
}

export interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  stopped?: boolean
  error?: string
  stats?: MsgStats
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  messages: Msg[]
}

export interface ChatSettings extends ChatParams {
  systemPrompt: string
}

export const DEFAULT_SETTINGS: ChatSettings = {
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 1024,
  repeat_penalty: 1.1,
  systemPrompt: PRESETS[0].prompt,
}

const KEY_CONV = 'bookangi.llm.conversations.v1'
const KEY_SET = 'bookangi.llm.settings.v1'
const MAX_CONVERSATIONS = 30

// 저장소가 막혀 있어도(사생활 보호 모드 등) 화면은 돌아가야 한다.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 용량 초과 등은 무시 */
  }
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

function loadConversations(): Conversation[] {
  // 새로고침으로 끊긴 생성 중 메시지는 '중지됨'으로 정리한다.
  return read<Conversation[]>(KEY_CONV, []).map((c) => ({
    ...c,
    messages: c.messages.map((m) => (m.streaming ? { ...m, streaming: false, stopped: true } : m)),
  }))
}

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations)
  const [activeId, setActiveId] = useState<string | null>(() => conversations[0]?.id ?? null)
  const [settings, setSettings] = useState<ChatSettings>(() => ({ ...DEFAULT_SETTINGS, ...read(KEY_SET, {}) }))
  const [busy, setBusy] = useState(false)

  const convRef = useRef(conversations)
  const activeRef = useRef(activeId)
  const settingsRef = useRef(settings)
  const busyRef = useRef(busy)
  const abortRef = useRef<AbortController | null>(null)
  convRef.current = conversations
  activeRef.current = activeId
  settingsRef.current = settings
  busyRef.current = busy

  useEffect(() => write(KEY_SET, settings), [settings])
  // 생성 중에는 쓰지 않는다(토큰마다 저장하면 느려진다).
  useEffect(() => {
    if (!busy) write(KEY_CONV, conversations)
  }, [conversations, busy])

  const patchMsg = useCallback((convId: string, msgId: string, fn: (m: Msg) => Msg) => {
    setConversations((cs) =>
      cs.map((c) =>
        c.id !== convId ? c : { ...c, messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)) },
      ),
    )
  }, [])

  const run = useCallback(
    async (convId: string, assistantId: string, history: Msg[]) => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setBusy(true)

      // 토큰마다 렌더하지 않고 프레임당 한 번만 반영한다.
      let buf = ''
      let raf = 0
      const flush = () => {
        raf = 0
        if (!buf) return
        const t = buf
        buf = ''
        patchMsg(convId, assistantId, (m) => ({ ...m, content: m.content + t }))
      }

      const s = settingsRef.current
      const msgs: ChatMessage[] = []
      if (s.systemPrompt.trim()) msgs.push({ role: 'system', content: s.systemPrompt.trim() })
      for (const m of history) if (!m.error && m.content.trim()) msgs.push({ role: m.role, content: m.content })
      const params: ChatParams = {
        temperature: s.temperature,
        top_p: s.top_p,
        max_tokens: s.max_tokens,
        repeat_penalty: s.repeat_penalty,
      }

      try {
        for await (const ev of streamChat(msgs, params, ctrl.signal)) {
          if (ev.type === 'token') {
            buf += ev.text
            if (!raf) raf = requestAnimationFrame(flush)
          } else if (ev.type === 'done') {
            flush()
            patchMsg(convId, assistantId, (m) => ({
              ...m,
              stats: {
                ttftMs: ev.ttft_ms,
                tokPerS: ev.tokens_per_s,
                completionTokens: ev.completion_tokens,
                promptTokens: ev.prompt_tokens,
                nCtx: ev.n_ctx,
              },
            }))
          } else {
            flush()
            patchMsg(convId, assistantId, (m) => ({ ...m, error: ev.message }))
          }
        }
      } catch (e) {
        flush()
        if (ctrl.signal.aborted) patchMsg(convId, assistantId, (m) => ({ ...m, stopped: true }))
        else patchMsg(convId, assistantId, (m) => ({ ...m, error: (e as Error).message }))
      } finally {
        if (raf) cancelAnimationFrame(raf)
        flush()
        patchMsg(convId, assistantId, (m) => ({ ...m, streaming: false }))
        abortRef.current = null
        setBusy(false)
      }
    },
    [patchMsg],
  )

  const send = useCallback(
    (text: string) => {
      const t = text.trim()
      if (!t || busyRef.current) return
      const existing = convRef.current.find((c) => c.id === activeRef.current)
      const userMsg: Msg = { id: uid(), role: 'user', content: t }
      const asst: Msg = { id: uid(), role: 'assistant', content: '', streaming: true }
      const history = [...(existing?.messages ?? []), userMsg]

      let convId: string
      if (existing) {
        convId = existing.id
        setConversations((cs) =>
          cs.map((c) =>
            c.id !== convId
              ? c
              : { ...c, title: c.messages.length ? c.title : t.slice(0, 28), messages: [...c.messages, userMsg, asst] },
          ),
        )
      } else {
        convId = uid()
        const fresh: Conversation = { id: convId, title: t.slice(0, 28), createdAt: Date.now(), messages: [userMsg, asst] }
        setConversations((cs) => [fresh, ...cs].slice(0, MAX_CONVERSATIONS))
        setActiveId(convId)
      }
      void run(convId, asst.id, history)
    },
    [run],
  )

  const regenerate = useCallback(() => {
    if (busyRef.current) return
    const conv = convRef.current.find((c) => c.id === activeRef.current)
    const last = conv?.messages[conv.messages.length - 1]
    if (!conv || !last || last.role !== 'assistant') return
    const history = conv.messages.slice(0, -1)
    const asst: Msg = { id: uid(), role: 'assistant', content: '', streaming: true }
    setConversations((cs) => cs.map((c) => (c.id !== conv.id ? c : { ...c, messages: [...history, asst] })))
    void run(conv.id, asst.id, history)
  }, [run])

  const stop = useCallback(() => abortRef.current?.abort(), [])
  const newChat = useCallback(() => {
    if (!busyRef.current) setActiveId(null)
  }, [])
  const selectChat = useCallback((id: string) => {
    if (!busyRef.current) setActiveId(id)
  }, [])
  const deleteChat = useCallback((id: string) => {
    if (busyRef.current) return
    setConversations((cs) => {
      const rest = cs.filter((c) => c.id !== id)
      if (activeRef.current === id) setActiveId(rest[0]?.id ?? null)
      return rest
    })
  }, [])

  const active = conversations.find((c) => c.id === activeId) ?? null
  return { conversations, active, settings, setSettings, busy, send, stop, regenerate, newChat, selectChat, deleteChat }
}
