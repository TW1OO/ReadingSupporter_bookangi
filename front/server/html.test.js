import { describe, expect, it } from 'vitest';
import { decodeHtml, isHtmlType } from './html.js';

// '한글' 의 EUC-KR 바이트
const EUC = [0xc7, 0xd1, 0xb1, 0xdb];

describe('decodeHtml', () => {
  it('기본은 UTF-8', () => expect(decodeHtml(new TextEncoder().encode('한글'))).toBe('한글'));
  it('헤더의 문자셋을 따른다', () => expect(decodeHtml(Uint8Array.from(EUC), 'text/html; charset=euc-kr')).toBe('한글'));
  it('헤더가 없으면 meta 를 본다', () => {
    const meta = [...new TextEncoder().encode('<meta charset="euc-kr">'), ...EUC];
    expect(decodeHtml(Uint8Array.from(meta))).toContain('한글');
  });
  it('모르는 문자셋이면 UTF-8', () => expect(decodeHtml(new TextEncoder().encode('한글'), 'text/html; charset=nope')).toBe('한글'));
});

describe('isHtmlType', () => {
  it('HTML 만 받는다', () => {
    expect(isHtmlType('text/html; charset=utf-8')).toBe(true);
    expect(isHtmlType('application/xhtml+xml')).toBe(true);
    expect(isHtmlType('image/png')).toBe(false);
    expect(isHtmlType('application/zip')).toBe(false);
  });
});
