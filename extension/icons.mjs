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

export function writeIcons(directory) {
  for (const size of [16, 32, 48, 128]) {
    fs.writeFileSync(path.join(directory, `icon${size}.png`), drawIcon(size));
  }
}
