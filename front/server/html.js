// 받아 온 HTML 바이트 → 글자. 한국 뉴스 사이트는 아직 EUC-KR 인 곳이 있다.
export function decodeHtml(bytes, contentType = '') {
  const head = Buffer.from(bytes.subarray(0, 4096)).toString('latin1');
  const charset =
    contentType.match(/charset=["']?([\w-]+)/i)?.[1] ||
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ||
    'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export const isHtmlType = (contentType = '') => !contentType || /html|xml|text\/plain/i.test(contentType);
