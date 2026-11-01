// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { htmlToBlocks, looksLikePdf, parseArticle } from './webArticle.js';

const blocks = (html) => htmlToBlocks(new DOMParser().parseFromString(html, 'text/html').body);

describe('htmlToBlocks', () => {
  it('제목·문단·목록·코드를 구분한다', () => {
    expect(blocks('<h2>제목</h2><p>첫 <b>문단</b>입니다.</p><ul><li>항목</li></ul><pre>x = 1</pre><h5>작은 제목</h5>')).toEqual([
      { type: 'heading', text: '제목' },
      { type: 'text', text: '첫 문단입니다.' },
      { type: 'item', text: '항목' },
      { type: 'code', text: 'x = 1' },
      { type: 'subheading', text: '작은 제목' },
    ]);
  });
  it('글자와 블록이 섞여도 순서를 지킨다', () => {
    expect(blocks('<div>앞 글<p>가운데</p>뒤 글</div>').map((b) => b.text)).toEqual(['앞 글', '가운데', '뒤 글']);
  });
  it('인라인 안에 블록이 있어도 처리한다 (나무위키 등)', () => {
    expect(blocks('<span><div>안쪽</div></span>').map((b) => b.text)).toEqual(['안쪽']);
  });
  it('스크립트·스타일·버튼과 문장부호뿐인 조각은 뺀다', () => {
    expect(blocks('<p>본문</p><script>alert(1)</script><style>p{}</style><button>공유</button><p> ... </p>')).toEqual([
      { type: 'text', text: '본문' },
    ]);
  });
  it('태그처럼 보이는 글자도 글자로만 다룬다', () => {
    expect(blocks('<p>&lt;img src=x onerror=alert(1)&gt;</p>')[0].text).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('parseArticle', () => {
  const para = '합성곱 신경망은 영상 처리에 널리 쓰이는 구조이며 필터의 가중치를 학습한다. '.repeat(12);
  const page = `<!doctype html><html><head><title>합성곱 신경망</title></head><body>
    <nav><a href="/">메뉴 홈</a></nav>
    <article><h1>합성곱 신경망</h1><p>${para}</p><p>${para}</p><script>window.hacked = 1</script></article>
    <footer>저작권 안내</footer></body></html>`;
  it('제목과 본문만 뽑는다', () => {
    const a = parseArticle(page, 'https://example.com/a');
    expect(a.title).toBe('합성곱 신경망');
    expect(a.blocks.length).toBeGreaterThanOrEqual(2);
    expect(a.blocks.some((b) => b.text.includes('메뉴 홈'))).toBe(false);
    expect(a.blocks[0].text).not.toBe('합성곱 신경망');
    expect(window.hacked).toBeUndefined();
  });
  it('메뉴만 있는 페이지는 본문이 없다고 알린다', () => {
    const items = Array.from({ length: 60 }, (_, i) => `<li><a href="/${i}">메뉴 항목 ${i}</a></li>`).join('');
    expect(() => parseArticle(`<html><body><article><ul>${items}</ul></article></body></html>`, 'https://example.com/')).toThrow('본문을 찾지 못했습니다');
  });
  it('본문이 없으면 알려 준다', () => {
    expect(() => parseArticle('<html><body><div id="app"></div></body></html>', 'https://example.com/')).toThrow('본문을 찾지 못했습니다');
  });
});

describe('wiki 문서', () => {
  const html = `<html><head><title>컴퓨터 - 나무위키</title></head><body>
    <h1><span>컴퓨터</span></h1><div>최근 수정 시각</div><a>편집</a><span>110</span>
    <div class="wiki-macro-toc"><div class="wiki-heading">목차 항목</div></div>
    <div class="x wiki-heading">1. 개요[편집]</div>
    <div class="wiki-paragraph">컴퓨터는 계산하는 기계이다.<div class="wiki-paragraph">안쪽 문단</div></div>
    <div class="wiki-paragraph">1. 개요2. 역사3. 구조</div>
    <div class="wiki-paragraph">둘째 문단이다.</div><div class="wiki-paragraph">   </div>
  </body></html>`;
  it('표시된 본문만 쓰고 메뉴·목차·[편집]은 뺀다', () => {
    const a = parseArticle(html, 'https://namu.wiki/w/x');
    expect(a.title).toBe('컴퓨터');
    expect(a.blocks).toEqual([
      { type: 'heading', text: '1. 개요' },
      { type: 'text', text: '컴퓨터는 계산하는 기계이다.안쪽 문단' },
      { type: 'text', text: '둘째 문단이다.' },
    ]);
  });
});

describe('looksLikePdf', () => {
  it('PDF 링크와 공유 서비스', () => {
    expect(looksLikePdf('https://a.com/x.PDF')).toBe(true);
    expect(looksLikePdf('https://drive.google.com/file/d/1/view')).toBe(true);
    expect(looksLikePdf('https://wikidocs.net/book/1')).toBe(false);
  });
  it('잘못된 주소는 오류', () => {
    expect(() => looksLikePdf('없는주소')).toThrow('올바른 주소');
    expect(() => looksLikePdf('file:///c:/a.pdf')).toThrow('http');
  });
});
