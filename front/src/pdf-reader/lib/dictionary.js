// 단어 조회 어댑터.
// 백엔드(POST /api/lookup: 형태소 원형 복원 + 우리말샘 조회)를 호출합니다.
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

/** 서버가 응답했지만 사전/번역 쪽에서 실패한 경우(네트워크 장애와 구분해 데모 데이터로 덮지 않는다). */
class LookupServerError extends Error {}

/**
 * 백엔드 응답을 UI 형태 { part, meaning, meanings[], explanation, examples[], lemma } 로 변환.
 * meanings 는 뜻풀이 목록(최대 6개)이고 meaning 은 그 첫 번째(해설 요청 등에 쓴다).
 * 지원 형태:
 *  1) 스키마(LookupResponse): { lemma, pos, meaning, explanation, examples }
 *  2) 현재 라우터(app/routers/lookup.py):
 *     { status, lemma, tag, result }  result =
 *       우리말샘 { origin_word, meanings: [{ word, pos, definition }] } (옛 형태 { word, pos, definition } 도 받는다)
 *       | DeepL { source, translated_text } | 오류 { error } | null(status: "not_found")
 */
export function adapt(data, surface) {
  if (typeof data.meaning === 'string' || data.meaning === null) {
    return {
      lemma: data.lemma ?? surface,
      part: data.pos ?? '',
      meaning: data.meaning || '사전에서 뜻을 찾지 못했어요.',
      meanings: data.meaning ? [data.meaning] : [],
      explanation: data.explanation ?? '',
      examples: data.examples ?? [],
    };
  }
  const lemma = data.lemma ?? surface;
  const r = data.result;
  if (!r) {
    return { lemma, part: '', meaning: data.message || '사전 및 번역 결과를 찾을 수 없어요.', meanings: [], explanation: '', examples: [] };
  }
  if (r.error) throw new LookupServerError(r.error);
  if (r.translated_text) {
    return {
      lemma, part: '번역', meaning: r.translated_text, meanings: [r.translated_text],
      explanation: r.source ? `${r.source} 번역 결과입니다.` : '', examples: [],
    };
  }
  if (Array.isArray(r.meanings)) {
    const meanings = r.meanings.map((m) => m?.definition).filter((d) => typeof d === 'string' && d.trim()).slice(0, 6);
    return {
      lemma,
      part: r.meanings.find((m) => m?.pos)?.pos ?? '',
      meaning: meanings[0] ?? '사전에서 뜻을 찾지 못했어요.',
      meanings,
      explanation: '',
      examples: [],
    };
  }
  return {
    lemma,
    part: r.pos ?? '',
    meaning: r.definition || '사전에서 뜻을 찾지 못했어요.',
    meanings: r.definition ? [r.definition] : [],
    explanation: '',
    examples: [],
  };
}

/** @returns {Promise<{lemma?:string, part:string, meaning:string, meanings:string[], explanation:string, examples:string[]}>} */
export async function lookupWord(word, context) {
  try {
    const res = await fetch(`${API_BASE}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surface: word, context }),
    });
    if (!res.ok) throw new Error(`lookup failed: ${res.status}`);
    return adapt(await res.json(), word);
  } catch (error) {
    // 서버가 "사전 키 없음/호출 실패"를 알려 준 경우는 그 사유를 그대로 보여 준다(백엔드 미연결로 오해하지 않도록).
    if (error instanceof LookupServerError) {
      return { lemma: word, part: '', meaning: `사전 조회 실패: ${error.message}`, meanings: [`사전 조회 실패: ${error.message}`], explanation: '', examples: [] };
    }
    // 가짜 뜻을 보여 주지 않고 연결 실패를 그대로 알린다.
    console.warn('사전 API 호출 실패', error);
    return { lemma: word, part: '', meaning: '사전 서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.', meanings: ['사전 서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.'], explanation: '', examples: [] };
  }
}

/**
 * 로컬 LLM 호출 (POST /api/explain). 실패해도 뜻 보기에 영향을 주지 않도록 '준비 안 됨'으로 돌려줍니다.
 * mode 'sentence' → explanation (문장 해설, 60자 이내), 'search' → search (LLM 검색, 200자 이내).
 * @returns {Promise<{status:'ready'|'unavailable', explanation:string|null, search:string|null, examples:string[]}>}
 */
export async function explainWord({ surface, lemma, meaning, context, mode = 'sentence' }) {
  try {
    const res = await fetch(`${API_BASE}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surface, lemma, meaning, context, mode }),
    });
    if (!res.ok) throw new Error(`explain failed: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn('해설 API 호출 실패', error);
    return { status: 'unavailable', explanation: null, search: null, examples: [] };
  }
}
