// 단어 조회 어댑터.
// 백엔드(POST /api/lookup: 형태소 원형 복원 + 우리말샘 조회)를 호출하고, 연결 실패 시에만 데모 데이터로 대체합니다.
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

const DEMO_ENTRIES = {
  지지부진: {
    part: '형용사',
    meaning: '일이 잘 진척되지 않아 매우 더디다.',
    explanation: '글의 흐름에서는 결정을 내리지 못한 채 고민이 오래 이어지는 상태를 나타냅니다.',
    examples: ['협상은 여러 쟁점 때문에 지지부진하게 이어졌다.', '계획이 지지부진하자 일정을 다시 조정했다.'],
  },
  망설이다: {
    part: '동사',
    meaning: '이리저리 생각만 하고 결정을 선뜻 하지 못하다.',
    explanation: '선택지가 있거나 결과가 걱정되어 행동을 미루는 상황에 쓰입니다.',
    examples: ['그는 대답을 망설이다가 천천히 고개를 끄덕였다.'],
  },
  결정: {
    part: '명사',
    meaning: '행동이나 태도를 분명하게 정함.',
    explanation: '문맥에서는 계약서에 서명할지 말지를 최종적으로 선택하는 일을 뜻합니다.',
    examples: ['충분히 생각한 뒤 결정을 내렸다.'],
  },
  서류: {
    part: '명사',
    meaning: '글자로 기록한 문서.',
    explanation: '행정·계약·업무 등에서 사실이나 내용을 증명하기 위해 작성한 자료입니다.',
    examples: ['필요한 서류를 책상 위에 올려두었다.'],
  },
};

/** 백엔드 응답을 UI 형태 { part, meaning, explanation, examples[], lemma } 로 변환 */
function adapt(data, surface) {
  // 스키마(LookupResponse) 형태: { lemma, pos, meaning, explanation, examples }
  if (typeof data.meaning === 'string' || data.meaning === null) {
    return {
      lemma: data.lemma ?? surface,
      part: data.pos ?? '',
      meaning: data.meaning || '사전에서 뜻을 찾지 못했어요.',
      explanation: data.explanation ?? '',
      examples: data.examples ?? [],
    };
  }
  // 현재 라우터 형태: { lemma, tag, result: { word, pos, definition } | { error } }
  const r = data.result ?? {};
  if (r.error) throw new Error(r.error);
  return {
    lemma: data.lemma ?? surface,
    part: r.pos ?? '',
    meaning: r.definition || '사전에서 뜻을 찾지 못했어요.',
    explanation: '',
    examples: [],
  };
}

function demoFallback(word) {
  return (
    DEMO_ENTRIES[word] ?? {
      part: /다$/.test(word) ? '동사·형용사(추정)' : '',
      meaning: '백엔드에 연결되지 않아 사전 뜻을 가져오지 못했어요.',
      explanation: '',
      examples: [],
    }
  );
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
    // API 서버가 없는 프론트엔드 데모에서도 PDF/카메라 기능은 계속 사용할 수 있습니다.
    console.warn('사전 API에 연결할 수 없어 데모 뜻풀이를 사용합니다.', error);
    return demoFallback(word);
  }
}
