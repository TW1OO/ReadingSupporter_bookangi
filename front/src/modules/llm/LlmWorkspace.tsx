import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import './llm.css'
import { loadLlm } from './client'
import { Markdown } from './Markdown'
import { PRESETS, SUGGESTIONS } from './presets'
import { DEFAULT_SETTINGS, useChat, type MsgStats } from './useChat'
import { useLlmStatus } from './useLlmStatus'

const STATE_LABEL = {
	ready: '준비됨',
	loading: '모델 올리는 중',
	unloaded: '모델 꺼짐',
	disabled: 'LLM 비활성',
	error: '오류',
} as const

function statsText(s: MsgStats): string {
	const parts: string[] = []
	if (s.ttftMs != null) parts.push(`첫 토큰 ${(s.ttftMs / 1000).toFixed(1)}초`)
	if (s.tokPerS != null) parts.push(`${s.tokPerS} tok/s`)
	parts.push(`${s.completionTokens} 토큰`)
	return parts.join(' · ')
}

export function LlmWorkspace() {
	const chat = useChat()
	const { status, offline, refresh } = useLlmStatus()
	const [input, setInput] = useState('')
	const [sideOpen, setSideOpen] = useState(() => window.innerWidth > 860)
	const [loadErr, setLoadErr] = useState<string | null>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const taRef = useRef<HTMLTextAreaElement>(null)
	const stick = useRef(true)

	const state = offline ? null : (status?.state ?? null)
	const ready = state === 'ready'
	const messages = chat.active?.messages ?? []
	const { settings, setSettings } = chat

	const lastStats = [...messages].reverse().find((m) => m.stats?.promptTokens != null)?.stats
	const used = lastStats ? (lastStats.promptTokens ?? 0) + lastStats.completionTokens : 0
	const nCtx = status?.n_ctx ?? lastStats?.nCtx ?? 0

	useEffect(() => {
		const el = scrollRef.current
		if (el && stick.current) el.scrollTop = el.scrollHeight
	}, [messages])

	const submit = () => {
		const t = input.trim()
		if (!ready || chat.busy || !t) return
		setInput('')
		stick.current = true
		chat.send(t)
		if (taRef.current) taRef.current.style.height = 'auto'
	}

	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		// 한글 조합 중 Enter 는 글자 확정용이므로 전송하지 않는다.
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault()
			submit()
		}
	}

	const onLoad = async () => {
		setLoadErr(null)
		try {
			await loadLlm()
		} catch (e) {
			setLoadErr((e as Error).message)
		}
		void refresh()
	}

	const presetId = PRESETS.find((p) => p.prompt === settings.systemPrompt)?.id ?? 'custom'
	const set = <K extends keyof typeof settings>(k: K, v: (typeof settings)[K]) => setSettings({ ...settings, [k]: v })

	const banner = offline
		? '백엔드(8000)에 연결할 수 없어요. uvicorn 이 켜져 있는지 확인하세요.'
		: state === 'disabled'
			? 'back/.env 에 LLM_ENABLED=true 를 넣고 서버를 다시 켜 주세요.'
			: state === 'loading'
				? '모델을 GPU 에 올리는 중이에요. 처음에는 시간이 걸릴 수 있어요.'
				: state === 'error'
					? `모델 로딩 실패: ${status?.error ?? '알 수 없는 오류'}`
					: state === 'unloaded'
						? '모델이 아직 올라가 있지 않아요.'
						: null

	return (
		<div className="llm-app">
			<aside className={`llm-side ${sideOpen ? 'is-open' : ''}`}>
				<button type="button" className="llm-btn llm-btn--primary llm-new" onClick={chat.newChat} disabled={chat.busy}>
					+ 새 대화
				</button>
				<nav className="llm-list" aria-label="대화 목록">
					{chat.conversations.length === 0 && <p className="llm-muted">아직 대화가 없어요.</p>}
					{chat.conversations.map((c) => (
						<div key={c.id} className={`llm-item ${c.id === chat.active?.id ? 'is-active' : ''}`}>
							<button type="button" className="llm-item-main" onClick={() => chat.selectChat(c.id)}>
								{c.title || '새 대화'}
							</button>
							<button type="button" className="llm-item-del" aria-label="대화 삭제" onClick={() => chat.deleteChat(c.id)}>
								×
							</button>
						</div>
					))}
				</nav>

				<details className="llm-settings">
					<summary>생성 설정</summary>
					<label>
						시스템 프롬프트
						<select
							value={presetId}
							onChange={(e) => {
								const p = PRESETS.find((x) => x.id === e.target.value)
								if (p) set('systemPrompt', p.prompt)
							}}
						>
							{PRESETS.map((p) => (
								<option key={p.id} value={p.id}>
									{p.label}
								</option>
							))}
							<option value="custom">직접 입력</option>
						</select>
					</label>
					<textarea
						rows={5}
						value={settings.systemPrompt}
						onChange={(e) => set('systemPrompt', e.target.value)}
						aria-label="시스템 프롬프트 내용"
					/>
					<label>
						<span>창의성 (temperature) <b>{settings.temperature.toFixed(2)}</b></span>
						<input type="range" min={0} max={1.5} step={0.05} value={settings.temperature} onChange={(e) => set('temperature', Number(e.target.value))} />
					</label>
					<label>
						<span>top_p <b>{settings.top_p.toFixed(2)}</b></span>
						<input type="range" min={0.1} max={1} step={0.05} value={settings.top_p} onChange={(e) => set('top_p', Number(e.target.value))} />
					</label>
					<label>
						<span>최대 답변 길이 <b>{settings.max_tokens}</b></span>
						<input type="range" min={64} max={4096} step={64} value={settings.max_tokens} onChange={(e) => set('max_tokens', Number(e.target.value))} />
					</label>
					<label>
						<span>반복 억제 <b>{settings.repeat_penalty.toFixed(2)}</b></span>
						<input type="range" min={1} max={1.5} step={0.05} value={settings.repeat_penalty} onChange={(e) => set('repeat_penalty', Number(e.target.value))} />
					</label>
					<button type="button" className="llm-btn" onClick={() => setSettings(DEFAULT_SETTINGS)}>
						기본값으로
					</button>
				</details>
			</aside>

			<section className="llm-main">
				<header className="llm-head">
					<button type="button" className="llm-icon" aria-label="사이드바 토글" onClick={() => setSideOpen((v) => !v)}>
						☰
					</button>
					<div className="llm-model">
						<strong>{status?.model ?? 'Book항이 LLM'}</strong>
						<span className={`llm-chip llm-chip--${state ?? 'offline'}`}>{state ? STATE_LABEL[state] : '서버 연결 안 됨'}</span>
					</div>
					{nCtx > 0 && (
						<div className="llm-ctx" title="현재 대화가 차지한 컨텍스트">
							<div className="llm-ctx-bar">
								<i style={{ width: `${Math.min(100, (used / nCtx) * 100)}%` }} />
							</div>
							<span>
								{used.toLocaleString()} / {nCtx.toLocaleString()}
							</span>
						</div>
					)}
				</header>

				{banner && (
					<div className={`llm-banner ${state === 'error' || offline ? 'is-bad' : ''}`} role="status">
						<span>{banner}</span>
						{(state === 'unloaded' || state === 'error') && (
							<button type="button" className="llm-btn" onClick={onLoad}>
								{state === 'error' ? '다시 시도' : '모델 올리기'}
							</button>
						)}
						{loadErr && <span> {loadErr}</span>}
					</div>
				)}

				<div
					className="llm-scroll"
					ref={scrollRef}
					onScroll={(e) => {
						const el = e.currentTarget
						stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
					}}
				>
					{messages.length === 0 ? (
						<div className="llm-empty">
							<h1>무엇을 도와드릴까요?</h1>
							<p>서버에서 직접 돌아가는 로컬 LLM이에요. 대화는 서버 안에서만 처리돼요.</p>
							<div className="llm-suggest">
								{SUGGESTIONS.map((s) => (
									<button key={s} type="button" disabled={!ready || chat.busy} onClick={() => chat.send(s)}>
										{s}
									</button>
								))}
							</div>
						</div>
					) : (
						<div className="llm-thread" aria-live="polite">
							{messages.map((m, idx) => (
								<article key={m.id} className={`llm-msg llm-msg--${m.role}`}>
									<div className="llm-avatar" aria-hidden>
										{m.role === 'user' ? '나' : 'B'}
									</div>
									<div className="llm-bubble">
										{m.role === 'user' ? (
											<p className="llm-user-text">{m.content}</p>
										) : (
											<>
												{m.content ? (
													<Markdown text={m.content} />
												) : m.streaming && !m.error ? (
													<span className="llm-typing" aria-label="생성 중">
														<i />
														<i />
														<i />
													</span>
												) : null}
												{m.streaming && m.content && <span className="llm-caret" aria-hidden />}
												{m.error && (
													<div className="llm-error" role="alert">
														{m.error}
													</div>
												)}
												{m.stopped && <div className="llm-note">생성을 중지했어요.</div>}
												{!m.streaming && m.content && (
													<footer className="llm-foot">
														{m.stats && <span>{statsText(m.stats)}</span>}
														<button type="button" onClick={() => void navigator.clipboard?.writeText(m.content)}>
															복사
														</button>
														{idx === messages.length - 1 && !chat.busy && (
															<button type="button" onClick={chat.regenerate} disabled={!ready}>
																다시 생성
															</button>
														)}
													</footer>
												)}
											</>
										)}
									</div>
								</article>
							))}
						</div>
					)}
				</div>

				<div className="llm-composer">
					<div className="llm-box">
						<textarea
							ref={taRef}
							rows={1}
							value={input}
							placeholder={ready ? '메시지를 입력하세요  (Enter 전송 · Shift+Enter 줄바꿈)' : '모델이 준비되면 입력할 수 있어요'}
							disabled={!ready}
							onKeyDown={onKeyDown}
							onChange={(e) => {
								setInput(e.target.value)
								e.target.style.height = 'auto'
								e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
							}}
						/>
						{chat.busy ? (
							<button type="button" className="llm-send llm-send--stop" onClick={chat.stop}>
								■ 중지
							</button>
						) : (
							<button type="button" className="llm-send" onClick={submit} disabled={!ready || !input.trim()}>
								전송
							</button>
						)}
					</div>
					<p className="llm-fine">LLM은 틀린 내용을 그럴듯하게 말할 수 있어요. 중요한 사실은 사전·원문으로 한 번 더 확인하세요.</p>
				</div>
			</section>
		</div>
	)
}
