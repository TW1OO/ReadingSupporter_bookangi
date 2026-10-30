import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';

const PORT = Number(process.env.PDF_PROXY_PORT || 8001);
const MAX_BYTES = 50 * 1024 * 1024;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
function isPrivateIPv6(ip) {
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') ||
    x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') ||
    x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.');
}
async function validatePublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('올바른 URL이 아닙니다.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP 또는 HTTPS 링크만 지원합니다.');
  if (url.username || url.password) throw new Error('로그인 정보가 포함된 URL은 지원하지 않습니다.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('공개된 웹 주소만 사용할 수 있습니다.');
  if (net.isIP(host)) {
    if ((net.isIPv4(host) && isPrivateIPv4(host)) || (net.isIPv6(host) && isPrivateIPv6(host))) throw new Error('내부 네트워크 주소는 사용할 수 없습니다.');
  } else {
    let records;
    try { records = await dns.lookup(host, { all: true }); } catch { throw new Error('주소의 서버를 찾을 수 없습니다.'); }
    if (!records.length || records.some(r => (net.isIPv4(r.address) && isPrivateIPv4(r.address)) || (net.isIPv6(r.address) && isPrivateIPv6(r.address)))) {
      throw new Error('공개된 웹 주소만 사용할 수 있습니다.');
    }
  }
  return url;
}
async function fetchWithSafeRedirects(rawUrl) {
  let url = await validatePublicUrl(rawUrl);
  for (let i = 0; i <= 5; i++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Bookhang-PDF-Reader/1.0' } });
    if (!REDIRECT_CODES.has(response.status)) return { response, url };
    const location = response.headers.get('location');
    if (!location) return { response, url };
    if (i === 5) throw new Error('리디렉션 횟수가 너무 많습니다. 직접 PDF 링크를 사용해 주세요.');
    url = await validatePublicUrl(new URL(location, url).href);
  }
  throw new Error('PDF 링크를 열 수 없습니다.');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method !== 'GET' || requestUrl.pathname !== '/api/pdf-proxy') {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'Not found' })); return;
  }
  const target = requestUrl.searchParams.get('url');
  if (!target) { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'PDF URL이 필요합니다.' })); return; }
  try {
    const { response, url } = await fetchWithSafeRedirects(target);
    if (!response.ok) {
      res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: `원본 서버 오류: ${response.status}` })); return;
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES) { res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'PDF는 50MB 이하만 지원합니다.' })); return; }
    if (!response.body) throw new Error('원본 서버가 파일을 반환하지 않았습니다.');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'PDF는 50MB 이하만 지원합니다.' })); return; }
      chunks.push(Buffer.from(value));
    }
    const body = Buffer.concat(chunks);
    if (body.length < 5 || body.subarray(0, 5).toString() !== '%PDF-') {
      res.writeHead(415, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: '링크가 PDF 파일을 반환하지 않았습니다. 공개된 PDF 직접 링크인지 확인해 주세요.' })); return;
    }
    const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'document.pdf').replace(/[\r\n"\\]/g, '_');
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': body.length, 'Content-Disposition': `inline; filename="${name.endsWith('.pdf') ? name : `${name}.pdf`}"`, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    const message = err?.name === 'TimeoutError' ? 'PDF 서버 응답 시간이 초과되었습니다.' : (err?.message || 'PDF를 가져오지 못했습니다.');
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: message }));
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`PDF proxy server running at http://127.0.0.1:${PORT}`));
