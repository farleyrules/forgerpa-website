// Offline test for worker/index.js (the /demos/* byte-range script).
// Runs on plain node (18+; uses the built-in Request/Response/Headers), no workerd:
//   node worker/test.mjs
// A fake env.ASSETS.fetch serves a known buffer the way the Cloudflare asset
// server does: it ignores Range, answers HEAD without a body or Content-Length,
// and answers a matching If-None-Match with a 304.

import worker, { parseRange } from './index.js';

const SIZE = 5000;
const BYTES = new Uint8Array(SIZE).map((_, i) => i % 251);
const ETAG = '"abc123"';
const BASE = 'https://example.test';

const assetCalls = [];
const env = {
  ASSETS: {
    async fetch(request) {
      assetCalls.push({ method: request.method, path: new URL(request.url).pathname });
      const path = new URL(request.url).pathname;
      if (path.endsWith('/missing.mp4')) return new Response('not found', { status: 404 });
      if (request.headers.get('If-None-Match') === ETAG) {
        return new Response(null, { status: 304, headers: { ETag: ETAG } });
      }
      const isMp4 = path.endsWith('.mp4');
      const headers = {
        'Content-Type': isMp4 ? 'video/mp4' : 'image/jpeg',
        ETag: ETAG,
        'Cache-Control': 'public, max-age=0, must-revalidate',
      };
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
      return new Response(BYTES.slice(), { status: 200, headers });
    },
  },
};

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name} ${detail}`);
  }
}

async function call(path, { method = 'GET', headers = {} } = {}) {
  const res = await worker.fetch(new Request(BASE + path, { method, headers }), env);
  const body = method === 'HEAD' ? null : new Uint8Array(await res.arrayBuffer());
  return { res, body, h: (k) => res.headers.get(k) };
}

function sameBytes(body, start, end) {
  if (!body || body.length !== end - start + 1) return false;
  for (let i = 0; i < body.length; i += 1) if (body[i] !== BYTES[start + i]) return false;
  return true;
}

const MP4 = '/demos/clip.mp4';

// 1. Closed range.
{
  const { res, body, h } = await call(MP4, { headers: { Range: 'bytes=0-1023' } });
  check('closed range -> 206', res.status === 206, `got ${res.status}`);
  check('closed range Content-Range', h('Content-Range') === `bytes 0-1023/${SIZE}`, h('Content-Range'));
  check('closed range Content-Length', h('Content-Length') === '1024', h('Content-Length'));
  check('closed range bytes', sameBytes(body, 0, 1023));
  check('closed range keeps Content-Type', h('Content-Type') === 'video/mp4', h('Content-Type'));
  check('closed range keeps ETag', h('ETag') === ETAG, h('ETag'));
  check('closed range keeps Cache-Control', h('Cache-Control') === 'public, max-age=0, must-revalidate');
  check('closed range Accept-Ranges', h('Accept-Ranges') === 'bytes');
}

// 2. Mid-file range, and an end past the size is clamped.
{
  const { res, body, h } = await call(MP4, { headers: { Range: 'bytes=4000-9999' } });
  check('clamped range -> 206', res.status === 206, `got ${res.status}`);
  check('clamped range Content-Range', h('Content-Range') === `bytes 4000-4999/${SIZE}`, h('Content-Range'));
  check('clamped range bytes', sameBytes(body, 4000, 4999));
}

// 3. Open-ended range.
{
  const { res, body, h } = await call(MP4, { headers: { Range: 'bytes=1234-' } });
  check('open range -> 206', res.status === 206, `got ${res.status}`);
  check('open range Content-Range', h('Content-Range') === `bytes 1234-4999/${SIZE}`, h('Content-Range'));
  check('open range Content-Length', h('Content-Length') === String(SIZE - 1234), h('Content-Length'));
  check('open range bytes', sameBytes(body, 1234, SIZE - 1));
}

// 4. Suffix form, and a suffix longer than the file.
{
  const { res, body, h } = await call(MP4, { headers: { Range: 'bytes=-500' } });
  check('suffix -> 206', res.status === 206, `got ${res.status}`);
  check('suffix Content-Range', h('Content-Range') === `bytes 4500-4999/${SIZE}`, h('Content-Range'));
  check('suffix bytes', sameBytes(body, 4500, 4999));
  const big = await call(MP4, { headers: { Range: 'bytes=-99999' } });
  check('long suffix -> whole file as 206', big.res.status === 206 && big.h('Content-Range') === `bytes 0-4999/${SIZE}`);
}

// 5. Unsatisfiable.
{
  const { res, body, h } = await call(MP4, { headers: { Range: `bytes=${SIZE}-` } });
  check('start past end -> 416', res.status === 416, `got ${res.status}`);
  check('416 Content-Range', h('Content-Range') === `bytes */${SIZE}`, h('Content-Range'));
  check('416 has no body', body.length === 0);
  const zero = await call(MP4, { headers: { Range: 'bytes=-0' } });
  check('bytes=-0 -> 416', zero.res.status === 416, `got ${zero.res.status}`);
}

// 6. Multi-range and malformed headers fall back to the full 200.
for (const range of ['bytes=0-1,5-9', 'bytes=abc', 'items=0-10', 'bytes=-', 'bytes=50-10']) {
  const { res, body, h } = await call(MP4, { headers: { Range: range } });
  check(`"${range}" -> full 200`, res.status === 200 && sameBytes(body, 0, SIZE - 1), `got ${res.status}`);
  check(`"${range}" Accept-Ranges and Content-Length`, h('Accept-Ranges') === 'bytes' && h('Content-Length') === String(SIZE));
}

// 7. No Range header: full 200 that advertises ranges.
{
  const { res, body, h } = await call(MP4);
  check('no range -> 200 full', res.status === 200 && sameBytes(body, 0, SIZE - 1), `got ${res.status}`);
  check('no range Accept-Ranges', h('Accept-Ranges') === 'bytes');
  check('no range Content-Range absent', h('Content-Range') === null);
}

// 8. HEAD: same headers, no body.
{
  const plain = await call(MP4, { method: 'HEAD' });
  check('HEAD -> 200', plain.res.status === 200, `got ${plain.res.status}`);
  check('HEAD Content-Length is the size', plain.h('Content-Length') === String(SIZE), plain.h('Content-Length'));
  check('HEAD Accept-Ranges', plain.h('Accept-Ranges') === 'bytes');
  check('HEAD has no body', (await plain.res.arrayBuffer()).byteLength === 0);
  const ranged = await call(MP4, { method: 'HEAD', headers: { Range: 'bytes=0-1023' } });
  check('HEAD with range -> 206 headers', ranged.res.status === 206 && ranged.h('Content-Range') === `bytes 0-1023/${SIZE}` && ranged.h('Content-Length') === '1024');
  check('HEAD with range has no body', (await ranged.res.arrayBuffer()).byteLength === 0);
}

// 9. If-Range: a matching ETag honors the range, a stale one gets the full 200.
{
  const match = await call(MP4, { headers: { Range: 'bytes=0-9', 'If-Range': ETAG } });
  check('If-Range match -> 206', match.res.status === 206, `got ${match.res.status}`);
  const stale = await call(MP4, { headers: { Range: 'bytes=0-9', 'If-Range': '"old"' } });
  check('If-Range stale -> full 200', stale.res.status === 200 && sameBytes(stale.body, 0, SIZE - 1), `got ${stale.res.status}`);
}

// 10. Pass-through: non-mp4 paths and non-200 asset answers come back untouched.
{
  assetCalls.length = 0;
  const jpg = await call('/demos/clip.jpg', { headers: { Range: 'bytes=0-9' } });
  check('non-mp4 passes through as the asset 200', jpg.res.status === 200 && jpg.h('Content-Type') === 'image/jpeg', `got ${jpg.res.status}`);
  check('non-mp4 gets no Accept-Ranges', jpg.h('Accept-Ranges') === null);
  check('non-mp4 body untouched', sameBytes(jpg.body, 0, SIZE - 1));
  const page = await call('/demos/');
  check('page path passes through', page.res.status === 200 && page.h('Accept-Ranges') === null);
  const videoPage = await call('/demos/clip/?t=45');
  check(
    'video page path (with a start-at query) passes through',
    videoPage.res.status === 200 && videoPage.h('Accept-Ranges') === null && assetCalls.at(-1).path === '/demos/clip/'
  );
  const notModified = await call(MP4, { headers: { 'If-None-Match': ETAG, Range: 'bytes=0-9' } });
  check('304 passes through', notModified.res.status === 304 && notModified.h('Accept-Ranges') === null, `got ${notModified.res.status}`);
  const missing = await call('/demos/missing.mp4');
  check('404 passes through', missing.res.status === 404, `got ${missing.res.status}`);
  const headJpg = await call('/demos/clip.jpg', { method: 'HEAD' });
  check('HEAD on non-mp4 is forwarded as HEAD', assetCalls.at(-1).method === 'HEAD' && headJpg.res.status === 200);
}

// 11. parseRange unit cases.
check('parseRange none', parseRange(null, 10) === null);
check('parseRange zero-size file', parseRange('bytes=0-', 0) === 'unsatisfiable');
check('parseRange whitespace tolerated', JSON.stringify(parseRange(' bytes=2-3 ', 10)) === '{"start":2,"end":3}');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
