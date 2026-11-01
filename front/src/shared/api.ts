// back/app/schemas.py 와 동일한 형태를 유지할 것.
export interface LookupResult {
  surface: string
  lemma: string
  pos: string
  meaning: string | null
  explanation?: string | null
  examples?: string[]
}

// back/app/schemas.py 의 ExplainResponse 와 동일. status 가 unavailable 이면 아직 LLM 연동 전.
export interface ExplainResult {
  status: 'ready' | 'unavailable'
  explanation: string | null
  examples: string[]
}

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'
