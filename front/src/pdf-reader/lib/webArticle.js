import { Readability } from '@mozilla/readability';

const BLOCK = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION',
  'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);
// 그림은 보여 주지 않으므로 그림 설명도 뺀다
const SKIP = new Set(['FIGURE', 'FIGCAPTION', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
const SENTENCE_CHARS = 30; // 이보다 짧은 조각은 메뉴일 수 있다
const MIN_CHARS = 100; // 이보다 짧으면 본문을 못 찾은 것으로 본다

const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
// 각주 표시 [12] → 위첨자. 글자 하나로 두어 단어 위치 계산을 그대로 쓴다.
export const superscriptRefs = (text) => text.replace(/\[(\d{1,3})\]/g, (_, n) => [...n].map((d) => SUPER[d]).join(''));

// 글 아래에 보여 줄 출처 표시
export function sourceLabel(hostname, siteName) {
  if (/(^|\.)wikipedia\.org$/.test(hostname)) return '위키백과 · CC BY-SA 4.0';
  if (/(^|\.)namu\.wiki$/.test(hostname)) return '나무위키 · CC BY-NC-SA 2.0 KR';
  return siteName || hostname;
}

const typeOf = (tag) => {
  if (/^H[1-3]$/.test(tag)) return 'heading';
  if (/^H[4-6]$/.test(tag)) return 'subheading';
  if (tag === 'LI') return 'item';
  if (tag === 'PRE') return 'code';
  return 'text';
};

// HTML → 글자 블록 [{ type, text }]. 화면에는 글자만 그리므로 원본 HTML 이 실행되지 않는다.
export function htmlToBlocks(root) {
  const blocks = [];
  const walk = (el, type) => {
    let run = '';
    const flush = () => {
      const text = run.replace(/\s+/g, ' ').trim();
      run = '';
      if (/[\p{L}\p{N}]/u.test(text)) blocks.push({ type, text: superscriptRefs(text) });
    };
    for (const node of el.childNodes) {
      if (node.nodeType === 3) run += node.textContent;
      else if (node.nodeType === 1) {
        const tag = node.tagName.toUpperCase();
        if (SKIP.has(tag)) continue;
        if (tag === 'BR') run += ' ';
        else if (BLOCK.has(tag)) {
          flush();
          walk(node, typeOf(tag));
        } else if (hasBlockInside(node)) {
          flush();
          walk(node, type);
        } else run += node.textContent;
      }
    }
    flush();
  };
  walk(root, 'text');
  return blocks;
}

function hasBlockInside(el) {
  for (const child of el.children) {
    if (BLOCK.has(child.tagName.toUpperCase()) || hasBlockInside(child)) return true;
  }
  return false;
}

// 나무위키 등 the seed 위키: 메뉴와 본문 구조가 뚜렷해 표시된 문단만 쓴다.
export function wikiBlocks(doc) {
  const out = [];
  for (const el of doc.querySelectorAll('[class*="wiki-heading"], [class*="wiki-paragraph"]')) {
    if (el.parentElement?.closest('[class*="wiki-paragraph"], [class*="wiki-heading"]')) continue;
    if (el.closest('[class*="wiki-macro-toc"]')) continue;
    const heading = /wiki-heading/.test(el.className);
    const text = el.textContent.replace(/\[편집\]/g, '').replace(/\s+/g, ' ').trim();
    if (!heading && /^1\.\s*\S.*?2\.\s*\S/.test(text) && !/[다요]\./.test(text)) continue; // 목차
    if (/[\p{L}\p{N}]/u.test(text)) out.push({ type: heading ? 'heading' : 'text', text: superscriptRefs(text) });
  }
  return out;
}

// 받아 온 HTML 에서 제목과 본문만 뽑는다. DOMParser 문서는 스크립트를 실행하지 않고 이미지도 받지 않는다.
export function parseArticle(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  const pageTitle = doc.title;
  const wiki = wikiBlocks(doc);
  if (wiki.length >= 3) {
    const h1 = doc.querySelector('h1')?.textContent.trim();
    const host = new URL(url).hostname;
    return { title: h1 || pageTitle, url, siteName: host, source: sourceLabel(host), blocks: wiki };
  }
  const parsed = new Readability(doc, { charThreshold: 200 }).parse();
  if (!parsed?.content) throw new Error(NOT_FOUND);
  const root = new DOMParser().parseFromString(parsed.content, 'text/html').body;
  const title = (parsed.title || pageTitle || url).trim();
  const blocks = htmlToBlocks(root).filter((b, i) => !(i === 0 && b.text === title));
  // 메뉴만 있는 페이지를 본문으로 착각하지 않도록, 문장 길이의 블록으로 센다
  const body = blocks.filter((b) => b.text.length >= SENTENCE_CHARS).reduce((n, b) => n + b.text.length, 0);
  if (body < MIN_CHARS) throw new Error(NOT_FOUND);
  const host = new URL(url).hostname;
  const siteName = parsed.siteName || host;
  return { title, url, siteName, source: sourceLabel(host, siteName), blocks };
}

const NOT_FOUND = '이 페이지에서 읽을 본문을 찾지 못했습니다. 로그인이 필요하거나 스크립트로 내용을 그리는 사이트일 수 있습니다.';

function validUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl.trim()); } catch { throw new Error('올바른 주소가 아닙니다. https:// 로 시작하는 주소를 입력해 주세요.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('http:// 또는 https:// 주소만 열 수 있습니다.');
  return url;
}

// PDF 로 바로 받아야 하는 주소인가 (직접 링크와 파일 공유 서비스)
export function looksLikePdf(rawUrl) {
  const url = validUrl(rawUrl);
  return /\.pdf$/i.test(url.pathname) || /^(drive|docs)\.google\.com$/.test(url.hostname) || /(^|\.)dropbox\.com$/.test(url.hostname);
}

/** 웹 글을 받아 온다. 주소가 실제로는 PDF 이면 null 을 돌려준다. */
export async function fetchArticle(rawUrl) {
  const url = validUrl(rawUrl);
  let res;
  try {
    res = await fetch(`/api/page-proxy?url=${encodeURIComponent(url.href)}`);
  } catch {
    throw new Error('프록시 서버에 연결할 수 없습니다. npm run dev:full 로 실행해 주세요.');
  }
  let body = null;
  try { body = await res.json(); } catch { /* JSON 이 아닌 응답 */ }
  if (body?.pdf) return null;
  if (!res.ok) throw new Error(body?.error || `페이지를 가져오지 못했습니다. 서버 오류: ${res.status}`);
  return parseArticle(body.html, body.url);
}
