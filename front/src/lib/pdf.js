import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };

export const SCALE = { min: 0.35, max: 3, fitMax: 2.5, step: 0.15 };

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const isPdfFile = (file) =>
  !!file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));

export async function openPdf(file) {
  const data = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
}

/**
 * PDF를 같은 출처의 개발 API 프록시를 통해 가져옵니다.
 * 브라우저의 CORS 제한은 프론트엔드에서 해제할 수 없으므로 서버 측 프록시가 필요합니다.
 */
function normalizePdfUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl.trim()); }
  catch { throw new Error('올바른 주소가 아닙니다. https:// 로 시작하는 PDF 링크를 입력해 주세요.'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('http:// 또는 https:// 주소만 열 수 있습니다.');
  const host = url.hostname.toLowerCase();
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const match = url.pathname.match(/\/(?:file\/d|document\/d|presentation\/d|spreadsheets\/d)\/([^/]+)/);
    const id = match?.[1] || url.searchParams.get('id');
    if (id) return new URL(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`);
  }
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
    url.searchParams.delete('dl'); url.searchParams.set('dl', '1');
  }
  if (host === 'github.com' && url.pathname.includes('/blob/')) {
    url.hostname = 'raw.githubusercontent.com'; url.pathname = url.pathname.replace('/blob/', '/'); url.search = '';
  }
  return url;
}

export async function fetchRemoteFile(rawUrl) {
  const url = normalizePdfUrl(rawUrl);
  let response;
  try {
    response = await fetch(`/api/pdf-proxy?url=${encodeURIComponent(url.href)}`);
  } catch {
    throw new Error('PDF 프록시 서버에 연결할 수 없습니다. 아래 실행 방법에 따라 프록시 서버도 시작해 주세요.');
  }
  if (!response.ok) {
    let message = '';
    try { message = (await response.json()).error || ''; } catch { /* no JSON response */ }
    if (response.status === 401 || response.status === 403) {
      throw new Error('PDF에 접근할 권한이 없습니다. 공유 설정을 “링크가 있는 사용자에게 공개”로 변경해 주세요.');
    }
    throw new Error(message || `PDF를 가져오지 못했습니다. 서버 오류: ${response.status}`);
  }
  const blob = await response.blob();
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (head.length < 5 || String.fromCharCode(...head) !== '%PDF-') {
    throw new Error('링크에서 PDF 파일을 찾지 못했습니다. 공개된 PDF 직접 다운로드 링크를 입력해 주세요.');
  }
  let name = 'document.pdf';
  try { name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || name); } catch { /* default */ }
  if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';
  return new File([blob], name, { type: 'application/pdf' });
}
