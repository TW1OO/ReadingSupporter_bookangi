import { afterEach, describe, expect, it, vi } from 'vitest';
import { explainWord } from './dictionary.js';

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
