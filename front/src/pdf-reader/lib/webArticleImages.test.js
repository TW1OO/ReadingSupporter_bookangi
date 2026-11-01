// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseArticle } from './webArticle.js';

const BODY = '독서 보조 서비스는 시선으로 문장을 고르고 손동작으로 단어를 맞춘다. '.repeat(6);
const page = (inner) => `<html><head><title>제목</title></head><body><article>${inner}<p>${BODY}</p><p>${BODY}</p></article></body></html>`;
const texts = (html) => parseArticle(html, 'https://example.com/a').blocks.map((b) => b.text).join('\n');

describe('그림과 그림 설명 제거', () => {
  it('일반 div 에 든 그림 설명을 지운다', () => {
    const t = texts(page('<div class="img_box img_center"><img src="a.jpg"><div>지난달 행사 사진 설명이다.</div></div>'));
    expect(t).not.toContain('사진 설명');
    expect(t).toContain('독서 보조');
  });
  it('caption 클래스의 글을 지운다', () => {
    expect(texts(page('<p class="photo_caption">사진 설명이다.</p>'))).not.toContain('사진 설명');
  });
  it('그림과 본문을 함께 감싼 큰 상자는 남긴다', () => {
    const t = texts(`<html><body><div class="image_layout"><img src="a.jpg"><p>${BODY}</p><p>${BODY}</p></div></body></html>`);
    expect(t).toContain('독서 보조');
  });
  it('글자 크기 단추와 기사 공유 문구를 지운다', () => {
    const t = texts(page('<ul><li>가</li></ul><p>부산닷컴 기사퍼가기</p>'));
    expect(t).not.toContain('퍼가기');
    expect(t.split('\n')).not.toContain('가');
  });
});
