/**
 * Build-time pixel sizes for the demo posters and videos.
 *
 * The /demos/<slug>/ pages publish og:image:width/height and og:video:width/height
 * so a pasted link renders a correctly shaped preview. The sizes are read from the
 * real files in public/ at build time rather than typed in by hand, so re-encoding
 * a poster or a video at a different size cannot leave the tags stale. A missing or
 * unreadable file fails the build loudly instead of shipping a wrong tag.
 *
 * Node stdlib only; runs during `astro build` (static output), never in the browser.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PixelSize {
  width: number;
  height: number;
}

/**
 * Absolute path of a file under public/ from its site path (e.g. "/demos/a.jpg").
 * Astro builds from the project root, so the working directory is the repo root.
 */
export function publicFilePath(sitePath: string): string {
  return join(process.cwd(), 'public', sitePath);
}

/**
 * Width and height of a JPEG, read from its start-of-frame (SOF) segment.
 * Walks the marker segments from the start of the file; SOF always comes before
 * the first scan, so the walk never has to parse entropy-coded data.
 */
export function jpegSize(path: string): PixelSize {
  const b = readFileSync(path);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) {
    throw new Error(`jpegSize: ${path} is not a JPEG`);
  }
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error(`jpegSize: ${path} has a malformed marker at byte ${i}`);
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte before a marker
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers with no length field
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // start of scan or end of image: no SOF seen
    const length = b.readUInt16BE(i + 2);
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) break;
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  throw new Error(`jpegSize: ${path} has no start-of-frame segment`);
}

/**
 * Width and height of the first video track of an MP4, read from its track header
 * (moov > trak > tkhd). Audio tracks carry a zero size, so the first track header
 * with a non-zero size is the picture. The values are 16.16 fixed point.
 */
export function mp4VideoSize(path: string): PixelSize {
  const b = readFileSync(path);
  const containers = new Set(['moov', 'trak']);

  function walk(start: number, end: number): PixelSize | null {
    let i = start;
    while (i + 8 <= end) {
      let size = b.readUInt32BE(i);
      const type = b.toString('latin1', i + 4, i + 8);
      let header = 8;
      if (size === 1) {
        if (i + 16 > end) return null;
        size = Number(b.readBigUInt64BE(i + 8)); // 64-bit box size
        header = 16;
      } else if (size === 0) {
        size = end - i; // box runs to the end of its parent
      }
      if (size < header || i + size > end) return null;
      if (containers.has(type)) {
        const found = walk(i + header, i + size);
        if (found) return found;
      } else if (type === 'tkhd') {
        const body = i + header;
        const version = b[body];
        // version/flags (4), then times and ids (20 bytes in v0, 32 in v1), then
        // reserved (8), layer, alternate group, volume, reserved (2 each), matrix (36).
        const sizeAt = body + 4 + (version === 1 ? 32 : 20) + 8 + 8 + 36;
        if (sizeAt + 8 <= i + size) {
          const width = Math.round(b.readUInt32BE(sizeAt) / 65536);
          const height = Math.round(b.readUInt32BE(sizeAt + 4) / 65536);
          if (width > 0 && height > 0) return { width, height };
        }
      }
      i += size;
    }
    return null;
  }

  const found = walk(0, b.length);
  if (!found) throw new Error(`mp4VideoSize: ${path} has no video track header with a size`);
  return found;
}
