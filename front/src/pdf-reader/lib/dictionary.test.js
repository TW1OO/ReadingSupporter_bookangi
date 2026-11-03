import { afterEach, describe, expect, it, vi } from 'vitest';
import { adapt, explainWord } from './dictionary.js';

afterEach(() => vi.unstubAllGlobals());

describe('explainWord', () => {
  it('요청 내용을 보내고 응답을 그대로 돌려준다', async () => {
    const body = { status: 'ready', explanation: '해설', examples: ['예문'] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    await expect(explainWord({ surface: '서류', context: '서류를 봤다.' })).resolves.toEqual(body);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ surface: '서류', context: '서류를 봤다.' });
  });

  it('서버 오류나 연결 실패는 준비 안 됨으로 처리한다', async () => {
    const none = { status: 'unavailable', explanation: null, examples: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(explainWord({ surface: '서류' })).resolves.toEqual(none);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(explainWord({ surface: '서류' })).resolves.toEqual(none);
  });
});

describe('adapt (단어 뜻 1번 탭)', () => {
  it('객체 배열 meanings 를 최대 6개 문자열로 만든다', () => {
    const result = { origin_word: '배', meanings: Array.from({ length: 8 }, (_, i) => ({ word: '배', pos: '명사', definition: `뜻${i + 1}` })) };
    const out = adapt({ lemma: '배', result }, '배');
    expect(out.meanings).toHaveLength(6);
    expect(out.meanings[0]).toBe('[명사] 뜻1');
    expect(out.meaning).toBe('뜻1');
    expect(out.part).toBe('명사');
  });

  it('문자열 배열 meanings 도 받는다', () => {
    const out = adapt({ lemma: '배', result: { pos: '명사', meanings: ['뜻 1', '뜻 2'] } }, '배');
    expect(out.meanings).toEqual(['[명사] 뜻 1', '[명사] 뜻 2']);
  });

  it('한 뜻/번역 결과도 meanings 배열로 맞춘다', () => {
    expect(adapt({ lemma: 'x', result: { pos: '명사', definition: '뜻' } }, 'x').meanings).toEqual(['뜻']);
    expect(adapt({ lemma: 'x', result: { translated_text: '번역' } }, 'x').meanings).toEqual(['번역']);
    expect(adapt({ lemma: 'x', result: null, message: '없음' }, 'x').meanings).toEqual(['없음']);
  });

  it('사전 오류는 예외로 올린다', () => {
    expect(() => adapt({ result: { error: '키 없음' } }, 'x')).toThrow('키 없음');
  });
});
