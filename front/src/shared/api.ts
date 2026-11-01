// back/app/schemas.py 와 동일한 형태를 유지할 것.
export interface LookupResult {
	surface: string;
	lemma: string;
	pos: string;
	meaning: string | null;
	explanation?: string | null;
	examples?: string[];
}

// back/app/schemas.py 의 ExplainResponse 와 동일. status 가 unavailable 이면 아직 LLM 연동 전.
export interface ExplainResult {
	status: 'ready' | 'unavailable';
	explanation: string | null;
	examples: string[];
}

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api";

// ---- 로컬 LLM ----
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
	role: ChatRole;
	content: string;
}

export interface ChatParams {
	temperature: number;
	top_p: number;
	max_tokens: number;
	repeat_penalty: number;
}

export type LlmState = "disabled" | "unloaded" | "loading" | "ready" | "error";

export interface LlmStatus {
	state: LlmState;
	model: string;
	n_ctx: number;
	n_gpu_layers: number;
	error: string | null;
}

export type LlmStreamEvent =
	| { type: "token"; text: string }
	| {
			type: "done";
			finish_reason: string;
			ttft_ms: number | null;
			tokens_per_s: number | null;
			completion_tokens: number;
			prompt_tokens: number | null;
			n_ctx: number;
			dropped_messages: number;
	  }
	| { type: "error"; code: string; message: string };
