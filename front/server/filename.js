// Content-Disposition 값. HTTP 헤더에는 한글을 그대로 넣을 수 없어(ERR_INVALID_CHAR)
// 영문 대체 이름과 RFC 5987 인코딩 이름을 함께 보낸다.
export function contentDisposition(rawPath) {
  let name = rawPath.split('/').filter(Boolean).pop() || 'document.pdf';
  try { name = decodeURIComponent(name); } catch { /* 잘못된 % 표기는 그대로 쓴다 */ }
  name = name.replace(/[\r\n"\\/]/g, '_');
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';
  const ascii = name.replace(/[^\x20-\x7e]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
