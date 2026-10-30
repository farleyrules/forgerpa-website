/**
 * Byte-range support for the demo videos.
 *
 * Cloudflare's static asset server answers a byte-range request with the whole
 * file (a 200), and Safari will not play an mp4 without a 206 partial response
 * (Chrome plays it but cannot seek). So the demo videos come through here.
 *
 * wrangler.jsonc sends only /demos/* to this script (assets.run_worker_first);
 * every other path is served straight from the static assets without running it.
 * Inside /demos/*, anything that is not an .mp4, and any asset answer that is not
 * a 200 (a 304, a 404, a redirect), passes through untouched.
 *
 * For an mp4 the asset is read once and answered with Accept-Ranges: bytes:
 *   - one range (bytes=a-b, bytes=a-, bytes=-n) -> 206 with Content-Range
 *   - a range that starts past the end (or bytes=-0) -> 416, Content-Range giving only the size
 *   - several ranges, a malformed header, or a stale If-Range -> the full 200
 * HEAD gets the same status and headers with no body. The asset's Content-Type,
 * ETag and cache headers are kept.
 *
 * Offline test (plain node, no workerd): node worker/test.mjs
 */

/**
 * Parse a Range header against a body of `size` bytes.
 * Returns { start, end } (inclusive) for one satisfiable range, 'unsatisfiable',
 * or null when the header should be ignored (absent, malformed, or multi-range).
 */
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // other units, multi-range ("a-b,c-d"), or garbage
  const [, first, last] = m;
  if (first === '' && last === '') return null; // "bytes=-"
  if (first === '') {
    // Suffix form: the last n bytes.
    const n = Number(last);
    if (n === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(first);
  if (last !== '' && Number(last) < start) return null; // invalid per RFC 9110: ignore the header
  if (start >= size) return 'unsatisfiable';
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  return { start, end };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isMp4 = url.pathname.toLowerCase().endsWith('.mp4');
    const isHead = request.method === 'HEAD';

    // A HEAD from the asset server carries no Content-Length, so ask for the
    // body (GET) to learn the size, then answer HEAD with headers only.
    const assetRequest = isMp4 && isHead ? new Request(request, { method: 'GET' }) : request;
    const res = await env.ASSETS.fetch(assetRequest);
    if (!isMp4 || res.status !== 200) return res;

    const body = await res.arrayBuffer();
    const size = body.byteLength;

    const headers = new Headers(res.headers);
    headers.set('Accept-Ranges', 'bytes');
    // The body is now the decoded bytes; an inherited Content-Encoding would make
    // the runtime re-encode it and break the byte offsets.
    headers.delete('Content-Encoding');

    let range = parseRange(request.headers.get('Range'), size);
    const ifRange = request.headers.get('If-Range');
    if (range && ifRange && ifRange !== res.headers.get('ETag')) range = null;

    if (range === 'unsatisfiable') {
      headers.set('Content-Range', `bytes */${size}`);
      headers.delete('Content-Length');
      return new Response(null, { status: 416, headers });
    }

    if (range) {
      const length = range.end - range.start + 1;
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      headers.set('Content-Length', String(length));
      const slice = isHead ? null : new Uint8Array(body, range.start, length);
      return new Response(slice, { status: 206, headers });
    }

    headers.set('Content-Length', String(size));
    return new Response(isHead ? null : body, { status: 200, headers });
  },
};
