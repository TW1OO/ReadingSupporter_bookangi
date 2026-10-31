// 단어 조회 어댑터.
// 백엔드(POST /api/lookup: 형태소 원형 복원 + 우리말샘 조회)를 호출합니다.
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

/** 서버가 응답했지만 사전/번역 쪽에서 실패한 경우(네트워크 장애와 구분해 데모 데이터로 덮지 않는다). */
class LookupServerError extends Error {}

/**
 * 백엔드 응답을 UI 형태 { part, meaning, explanation, examples[], lemma } 로 변환.
 * 지원 형태:
 *  1) 스키마(LookupResponse): { lemma, pos, meaning, explanation, examples }
 *  2) 현재 라우터(app/routers/lookup.py):
 *     { status, lemma, tag, result }  result =
 *       우리말샘 { word, pos, definition } | DeepL { source, translated_text } |
 *       오류 { error } | null(status: "not_found")
 */
export function adapt(data, surface) {
  if (typeof data.meaning === 'string' || data.meaning === null) {
    return {
      lemma: data.lemma ?? surface,
      part: data.pos ?? '',
      meaning: data.meaning || '사전에서 뜻을 찾지 못했어요.',
      explanation: data.explanation ?? '',
      examples: data.examples ?? [],
    };
  }
  const lemma = data.lemma ?? surface;
  const r = data.result;
  if (!r) {
    return { lemma, part: '', meaning: data.message || '사전 및 번역 결과를 찾을 수 없어요.', explanation: '', examples: [] };
  }
  if (r.error) throw new LookupServerError(r.error);
  if (r.translated_text) {
    return { lemma, part: '번역', meaning: r.translated_text, explanation: r.source ? `${r.source} 번역 결과입니다.` : '', examples: [] };
  }
  return {
    lemma,
    part: r.pos ?? '',
    meaning: r.definition || '사전에서 뜻을 찾지 못했어요.',
    explanation: '',
    examples: [],
  };
}

/** @returns {Promise<{lemma?:string, part:string, meaning:string, explanation:string, examples:string[]}>} */
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
      return { lemma: word, part: '', meaning: `사전 조회 실패: ${error.message}`, explanation: '', examples: [] };
    }
    // 가짜 뜻을 보여 주지 않고 연결 실패를 그대로 알린다.
    console.warn('사전 API 호출 실패', error);
    return { lemma: word, part: '', meaning: '사전 서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.', explanation: '', examples: [] };
  }
}
