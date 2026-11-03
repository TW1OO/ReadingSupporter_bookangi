import { afterEach, describe, expect, it, vi } from 'vitest';
import { adapt, explainWord } from './dictionary.js';

afterEach(() => vi.unstubAllGlobals());

describe('explainWord', () => {
  it('요청 내용을 보내고 응답을 그대로 돌려준다', async () => {
    const body = { status: 'ready', explanation: '해설', search: null, examples: [] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    await expect(explainWord({ surface: '서류', context: '서류를 봤다.' })).resolves.toEqual(body);
    // mode 를 안 주면 문장 해설
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ surface: '서류', context: '서류를 봤다.', mode: 'sentence' });
  });

  it('LLM 검색 모드를 서버에 전달한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ready', search: '풀이' }) });
    vi.stubGlobal('fetch', fetchMock);
    await explainWord({ surface: '서류', mode: 'search' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).mode).toBe('search');
  });

  it('서버 오류나 연결 실패는 준비 안 됨으로 처리한다', async () => {
    const none = { status: 'unavailable', explanation: null, search: null, examples: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(explainWord({ surface: '서류' })).resolves.toEqual(none);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(explainWord({ surface: '서류' })).resolves.toEqual(none);
  });
});

describe('adapt: 사전 응답 → meanings', () => {
  it('우리말샘 여러 뜻을 최대 6개까지 meanings 로 만든다', () => {
    const meanings = Array.from({ length: 8 }, (_, i) => ({ word: '사과', pos: '명사', definition: `뜻${i + 1}` }));
    const r = adapt({ status: 'success', lemma: '사과', result: { origin_word: '사과', meanings } }, '사과');
    expect(r.meanings).toEqual(['뜻1', '뜻2', '뜻3', '뜻4', '뜻5', '뜻6']);
    expect(r.meaning).toBe('뜻1');
    expect(r.part).toBe('명사');
  });

  it('옛 형태(definition 하나)와 DeepL 번역도 meanings 로 돌려준다', () => {
    expect(adapt({ lemma: 'x', result: { pos: '명사', definition: '뜻' } }, 'x').meanings).toEqual(['뜻']);
    expect(adapt({ lemma: 'book', result: { source: 'DeepL', translated_text: '책' } }, 'book').meanings).toEqual(['책']);
  });

  it('결과가 없으면 meanings 는 비어 있다', () => {
    expect(adapt({ status: 'not_found', lemma: 'x', result: null }, 'x').meanings).toEqual([]);
  });
});
