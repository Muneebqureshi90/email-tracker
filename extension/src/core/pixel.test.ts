import { describe, expect, it } from 'vitest';
import { findPixels, parsePixelSrc, preparePixel } from './pixel';

const BASE = 'https://pc.tail1234.ts.net';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx';
const OLD = 'Zz9_-Zz9_-Zz9_-Zz9_-Zz9_';
const PIXEL = `${BASE}/t/${TOKEN}.gif`;
const PROXY = `https://ci3.googleusercontent.com/meips/ADKq_NZabc123=s0-d-e1-ft#${BASE}/t/${OLD}.gif`;

function body(html: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'true');
  // Test fixtures only: a fixed Gmail-like structure, never untrusted text.
  el.insertAdjacentHTML('afterbegin', html); // eslint-disable-line no-restricted-syntax
  return el;
}

describe('parsePixelSrc', () => {
  it('reads direct pixel URLs', () => {
    expect(parsePixelSrc(PIXEL, BASE)).toEqual({ token: TOKEN, form: 'direct' });
  });

  it("reads Gmail's proxy form, plain or URL-encoded", () => {
    expect(parsePixelSrc(PROXY, BASE)).toEqual({ token: OLD, form: 'proxy' });
    const encoded = `https://ci4.googleusercontent.com/proxy/abc#${encodeURIComponent(`${BASE}/t/${OLD}.gif`)}`;
    expect(parsePixelSrc(encoded, BASE)).toEqual({ token: OLD, form: 'proxy' });
  });

  it('ignores the host case but nothing else', () => {
    expect(parsePixelSrc(PIXEL.replace('pc.tail', 'PC.Tail'), BASE)?.token).toBe(TOKEN);
    expect(parsePixelSrc(`https://other.ts.net/t/${TOKEN}.gif`, BASE)).toBeNull();
    expect(parsePixelSrc(`${BASE}/c/${TOKEN}`, BASE)).toBeNull();
    expect(parsePixelSrc(`${BASE}/t/short.gif`, BASE)).toBeNull();
    expect(parsePixelSrc(`https://evil.example/#${PIXEL}`, BASE)).toBeNull();
    expect(parsePixelSrc(null, BASE)).toBeNull();
  });
});

describe('preparePixel', () => {
  it('puts one 1x1 pixel at the start of the first block and strips quoted pixels', () => {
    const el = body(`<div>Hello</div><div class="gmail_quote"><img src="${PROXY}"></div>`);
    const result = preparePixel(el, { publicBaseUrl: BASE, pixelUrl: PIXEL });

    expect(result).toEqual({ present: true, inserted: true, removedQuoted: 1, removedForeign: 0 });
    const pixels = findPixels(el, BASE);
    expect(pixels).toHaveLength(1);
    const img = pixels[0]!.el;
    expect(img.parentElement?.textContent).toBe('Hello');
    expect(img.parentElement?.firstChild).toBe(img);
    expect([img.getAttribute('width'), img.getAttribute('height'), img.getAttribute('alt')]).toEqual(['1', '1', '']);
    expect(img.getAttribute('style')).not.toContain('display');
  });

  it('never adds a second pixel, for example after Undo Send', () => {
    const el = body('<div>Hi</div>');
    preparePixel(el, { publicBaseUrl: BASE, pixelUrl: PIXEL });
    const again = preparePixel(el, { publicBaseUrl: BASE, pixelUrl: PIXEL });
    expect(again).toMatchObject({ present: true, inserted: false });
    expect(findPixels(el, BASE)).toHaveLength(1);
  });

  it('removes pixels of other emails from the new text', () => {
    const el = body(`<div>Pasted <img src="${BASE}/t/${OLD}.gif"></div>`);
    const result = preparePixel(el, { publicBaseUrl: BASE, pixelUrl: PIXEL });
    expect(result.removedForeign).toBe(1);
    expect(findPixels(el, BASE).map((pixel) => pixel.token)).toEqual([TOKEN]);
  });

  it('inserts at the body start when the body begins with text or a quote', () => {
    const el = body(`Plain start<div class="gmail_quote">quoted</div>`);
    preparePixel(el, { publicBaseUrl: BASE, pixelUrl: PIXEL });
    expect(el.firstChild).toBe(findPixels(el, BASE)[0]!.el);
  });

  it('only cleans up when the email is not tracked', () => {
    const el = body(`<div>Hi <img src="${PIXEL}"></div><blockquote><img src="${PROXY}"></blockquote>`);
    const result = preparePixel(el, { publicBaseUrl: BASE, pixelUrl: null });
    expect(result).toEqual({ present: false, inserted: false, removedQuoted: 1, removedForeign: 1 });
    expect(findPixels(el, BASE)).toHaveLength(0);
  });
});
