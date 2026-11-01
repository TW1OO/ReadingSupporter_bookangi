import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { contentDisposition } from './filename.js';

describe('contentDisposition', () => {
  it('한글 파일명도 HTTP 헤더로 쓸 수 있다', () => {
    const v = contentDisposition('/files/%EB%B3%B4%EA%B3%A0%EC%84%9C.pdf');
    expect(v).toBe(`inline; filename="___.pdf"; filename*=UTF-8''%EB%B3%B4%EA%B3%A0%EC%84%9C.pdf`);
    expect(() => http.validateHeaderValue('Content-Disposition', v)).not.toThrow();
  });
  it('확장자를 붙이고 위험한 문자를 바꾼다', () => {
    expect(contentDisposition('/a%22b%0Ac')).toContain('filename="a_b_c.pdf"');
  });
  it('잘못된 % 표기와 빈 경로에서도 죽지 않는다', () => {
    expect(contentDisposition('/%E0%A4%A.pdf')).toContain('.pdf');
    expect(contentDisposition('/')).toContain('filename="document.pdf"');
  });
});
