const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const { AuthError } = require('./errors.cjs');
const PAGE = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Lilac Client</title><body><h1>Lilac Client</h1><p>브라우저 인증 응답을 받았습니다. 런처로 돌아가 결과를 확인하세요.</p></body></html>';
function equalState(actual, expected) {
  const a = Buffer.from(actual || ''); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function startLoopback({ state, signal, timeoutMs = 180000 }) {
  let resolveResponse, rejectResponse, settled = false, timer;
  const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  // Browser opening can fail before the caller starts awaiting response.
  response.catch(() => {});
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url !== '/') { res.writeHead(404).end(); return; }
    if (req.headers.host !== new URL(redirectUri).host) { res.writeHead(400).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') { res.writeHead(415).end(); return; }
    let body = ''; let oversized = false;
    req.on('error', () => { if (!res.headersSent) res.writeHead(400); res.end(); });
    req.on('data', chunk => {
      if (oversized) return;
      body += chunk.toString('utf8');
      if (Buffer.byteLength(body) > 16384) { oversized = true; res.writeHead(413).end(); }
    });
    req.on('end', () => {
      if (oversized) return;
      const params = new URLSearchParams(body);
      if (params.getAll('state').length !== 1 || !equalState(params.get('state'), state)) { res.writeHead(400).end(); return; }
      if (params.getAll('code').length > 1 || params.getAll('error').length > 1 || (params.has('code') && params.has('error'))) { res.writeHead(400).end(); return; }
      if (!params.get('code') && !params.get('error')) { res.writeHead(400).end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE, () => {
        if (params.get('error')) finish(new AuthError('access_denied', 'Microsoft 로그인이 취소되었거나 동의가 거부되었습니다.'));
        else finish(null, { code: params.get('code') });
      });
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  let redirectUri;
  const abort = () => finish(signal.reason instanceof AuthError ? signal.reason : new AuthError('cancelled', '로그인을 취소했습니다.'));
  function finish(error, value) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    server.close();
    server.unref();
    if (error) server.closeAllConnections();
    else server.closeIdleConnections();
    if (error) rejectResponse(error); else resolveResponse(value);
  }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  redirectUri = `http://localhost:${server.address().port}/`;
  signal?.addEventListener('abort', abort, { once: true });
  timer = setTimeout(() => finish(new AuthError('login_timeout', '로그인 대기 시간이 초과되었습니다. 다시 시도해 주세요.')), timeoutMs);
  if (signal?.aborted) abort();
  return { redirectUri, response, close: () => finish(new AuthError('cancelled', '로그인을 취소했습니다.')) };
}
module.exports = { startLoopback };
