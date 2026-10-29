/**
 * Finding, inserting and removing MailPulse pixels in an email body. Pure DOM code with no Gmail
 * or InboxSDK knowledge, so it is unit-tested with jsdom.
 */

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const PROXY_HOST = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//i;
const QUOTE_SELECTOR = '.gmail_quote, blockquote, .gmail_extra';
const SKIP_BLOCK_SELECTOR = `${QUOTE_SELECTOR}, .gmail_signature, .gmail_signature_prefix`;

export type PixelForm = 'direct' | 'proxy';

export interface FoundPixel {
  el: HTMLImageElement;
  token: string;
  form: PixelForm;
}

/** Reads the token from a direct pixel URL or from Gmail's proxy form `https://…googleusercontent.com/…#<original URL>`. */
export function parsePixelSrc(src: string | null, publicBaseUrl: string): { token: string; form: PixelForm } | null {
  if (!src) return null;
  let url = src;
  let form: PixelForm = 'direct';
  const hash = src.indexOf('#');
  if (hash > 0 && PROXY_HOST.test(src)) {
    url = src.slice(hash + 1);
    form = 'proxy';
    if (!/^https?:/i.test(url)) {
      try {
        url = decodeURIComponent(url);
      } catch {
        return null;
      }
    }
  }
  const prefix = `${publicBaseUrl.replace(/\/+$/, '')}/t/`;
  if (url.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return null;
  const match = /^([A-Za-z0-9_-]{24})\.gif(?:$|[?#])/.exec(url.slice(prefix.length));
  return match?.[1] ? { token: match[1], form } : null;
}

export function tokenOfPixelUrl(pixelUrl: string, publicBaseUrl: string): string | null {
  return parsePixelSrc(pixelUrl, publicBaseUrl)?.token ?? null;
}

export function findPixels(root: ParentNode, publicBaseUrl: string): FoundPixel[] {
  const found: FoundPixel[] = [];
  for (const el of Array.from(root.querySelectorAll('img'))) {
    const parsed = parsePixelSrc(el.getAttribute('src'), publicBaseUrl);
    if (parsed) found.push({ el, token: parsed.token, form: parsed.form });
  }
  return found;
}

export function uniqueTokens(pixels: readonly FoundPixel[]): string[] {
  return [...new Set(pixels.map((pixel) => pixel.token))];
}

/** Quoted text from earlier messages, as Gmail marks it in compose bodies. */
export function isInQuote(el: Element): boolean {
  return el.closest(QUOTE_SELECTOR) !== null;
}

/** DECISIONS D-025: 1×1, never display:none, so clipping and image-skipping clients still load it. */
export function createPixel(doc: Document, pixelUrl: string): HTMLImageElement {
  const img = doc.createElement('img');
  img.setAttribute('src', pixelUrl);
  img.setAttribute('width', '1');
  img.setAttribute('height', '1');
  img.setAttribute('alt', '');
  img.setAttribute('style', 'width:1px;height:1px;border:0');
  return img;
}

/** The first block of the new text, or null when the body starts with text, a quote or a signature. */
export function firstTextBlock(body: HTMLElement): HTMLElement | null {
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) return null;
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.matches(SKIP_BLOCK_SELECTOR)) return null;
    if (node.tagName === 'DIV' || node.tagName === 'P') return node;
  }
  return null;
}

export interface PixelResult {
  /** The pixel of this email is in the body (inserted now or kept from before, e.g. after Undo Send). */
  present: boolean;
  inserted: boolean;
  removedQuoted: number;
  removedForeign: number;
}

/**
 * Prepares the body for sending: removes MailPulse pixels from quoted text and stray pixels of other
 * emails, then makes sure exactly one pixel of this email is present (or none when pixelUrl is null).
 */
export function preparePixel(
  body: HTMLElement,
  options: { publicBaseUrl: string; pixelUrl: string | null; isQuoted?: (el: Element) => boolean },
): PixelResult {
  const isQuoted = options.isQuoted ?? isInQuote;
  const ownToken = options.pixelUrl ? tokenOfPixelUrl(options.pixelUrl, options.publicBaseUrl) : null;
  let removedQuoted = 0;
  let removedForeign = 0;
  let present = false;
  for (const pixel of findPixels(body, options.publicBaseUrl)) {
    if (isQuoted(pixel.el)) {
      pixel.el.remove();
      removedQuoted++;
    } else if (pixel.token === ownToken && !present) {
      present = true;
    } else {
      pixel.el.remove();
      removedForeign++;
    }
  }
  let inserted = false;
  if (options.pixelUrl && ownToken && !present) {
    const img = createPixel(body.ownerDocument, options.pixelUrl);
    const block = firstTextBlock(body);
    if (block) block.insertBefore(img, block.firstChild);
    else body.insertBefore(img, body.firstChild);
    inserted = true;
    present = true;
  }
  return { present, inserted, removedQuoted, removedForeign };
}
