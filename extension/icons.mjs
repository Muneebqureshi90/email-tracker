// Draws the MailPulse icon (an envelope with a pulse line, DECISIONS D-001) as PNG files at build
// time, so no binary images live in git. Shapes are in unit coordinates and supersampled 4x4.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const TEAL = [15, 118, 110];
const WHITE = [255, 255, 255];
const ENVELOPE = { left: 0.17, right: 0.83, top: 0.27, bottom: 0.73, stroke: 0.07 };
const PULSE = [[0.24, 0.53], [0.39, 0.53], [0.46, 0.39], [0.56, 0.66], [0.63, 0.53], [0.76, 0.53]];
const PULSE_WIDTH = 0.065;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedSquare(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function onEnvelope(x, y) {
  const { left, right, top, bottom, stroke } = ENVELOPE;
  const inOuter = x >= left && x <= right && y >= top && y <= bottom;
  const inInner = x > left + stroke && x < right - stroke && y > top + stroke && y < bottom - stroke;
  return inOuter && !inInner;
}

function onPulse(x, y) {
  for (let i = 1; i < PULSE.length; i++) {
    if (distanceToSegment(x, y, PULSE[i - 1], PULSE[i]) <= PULSE_WIDTH / 2) return true;
  }
  return false;
}

function drawIcon(size) {
  const samples = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let inside = 0;
      let white = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (!insideRoundedSquare(x, y, 0.22)) continue;
          inside++;
          if (onEnvelope(x, y) || onPulse(x, y)) white++;
        }
      }
      const offset = (py * size + px) * 4;
      const whiteShare = inside === 0 ? 0 : white / inside;
      for (let c = 0; c < 3; c++) rgba[offset + c] = Math.round(TEAL[c] * (1 - whiteShare) + WHITE[c] * whiteShare);
      rgba[offset + 3] = Math.round((255 * inside) / (samples * samples));
    }
  }
  return encodePng(size, rgba);
}

// Notification icons, one per type (brief Part C): a coloured disc with a white glyph. Polylines,
// rings (circles) and capsule outlines in unit coordinates, all drawn with the same stroke width.
const GLYPH_STROKE = 0.065;
const DOC_OUTLINE = [[0.34, 0.24], [0.58, 0.24], [0.68, 0.34], [0.68, 0.76], [0.34, 0.76], [0.34, 0.24]];
const NOTIFICATION_ICONS = {
  open: { color: [24, 128, 56], lines: [[[0.24, 0.52], [0.35, 0.64], [0.6, 0.39]], [[0.46, 0.64], [0.71, 0.39]]] },
  click: {
    color: [26, 115, 232],
    lines: [[[0.43, 0.57], [0.57, 0.43]]],
    capsules: [{ a: [0.33, 0.67], b: [0.43, 0.57], r: 0.1 }, { a: [0.57, 0.43], b: [0.67, 0.33], r: 0.1 }],
  },
  'doc-view': { color: [15, 118, 110], lines: [DOC_OUTLINE, [[0.42, 0.44], [0.6, 0.44]], [[0.42, 0.54], [0.6, 0.54]], [[0.42, 0.64], [0.54, 0.64]]] },
  'doc-read': { color: [15, 118, 110], lines: [DOC_OUTLINE, [[0.42, 0.52], [0.49, 0.6], [0.61, 0.45]]] },
  'doc-download': {
    color: [15, 118, 110],
    lines: [[[0.5, 0.24], [0.5, 0.6]], [[0.37, 0.48], [0.5, 0.61], [0.63, 0.48]], [[0.3, 0.62], [0.3, 0.73], [0.7, 0.73], [0.7, 0.62]]],
  },
  'follow-up': { color: [178, 106, 0], rings: [{ c: [0.5, 0.5], r: 0.24 }], lines: [[[0.5, 0.36], [0.5, 0.5], [0.61, 0.57]]] },
  alert: { color: [217, 92, 0], lines: [[[0.56, 0.22], [0.38, 0.54], [0.52, 0.54], [0.44, 0.78], [0.64, 0.44], [0.5, 0.44], [0.56, 0.22]]] },
};

function onGlyph(x, y, glyph) {
  const half = GLYPH_STROKE / 2;
  for (const line of glyph.lines ?? []) {
    for (let i = 1; i < line.length; i++) if (distanceToSegment(x, y, line[i - 1], line[i]) <= half) return true;
  }
  for (const ring of glyph.rings ?? []) if (Math.abs(Math.hypot(x - ring.c[0], y - ring.c[1]) - ring.r) <= half) return true;
  for (const capsule of glyph.capsules ?? []) if (Math.abs(distanceToSegment(x, y, capsule.a, capsule.b) - capsule.r) <= half) return true;
  return false;
}

function drawNotificationIcon(size, glyph) {
  const samples = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let inside = 0;
      let white = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (Math.hypot(x - 0.5, y - 0.5) > 0.5) continue;
          inside++;
          if (onGlyph(x, y, glyph)) white++;
        }
      }
      const offset = (py * size + px) * 4;
      const whiteShare = inside === 0 ? 0 : white / inside;
      for (let c = 0; c < 3; c++) rgba[offset + c] = Math.round(glyph.color[c] * (1 - whiteShare) + WHITE[c] * whiteShare);
      rgba[offset + 3] = Math.round((255 * inside) / (samples * samples));
    }
  }
  return encodePng(size, rgba);
}

export function writeIcons(directory) {
  for (const size of [16, 32, 48, 128]) {
    fs.writeFileSync(path.join(directory, `icon${size}.png`), drawIcon(size));
  }
  for (const [name, glyph] of Object.entries(NOTIFICATION_ICONS)) {
    fs.writeFileSync(path.join(directory, `n-${name}.png`), drawNotificationIcon(128, glyph));
  }
  fs.writeFileSync(path.join(directory, 'n-group.png'), drawIcon(128));
}
