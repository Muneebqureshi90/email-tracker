import { describe, expect, it } from 'vitest';
import { extractLinks, rewriteLinks } from './links';
import { isInQuote } from './pixel';

const BASE = 'https://pc.tail1234.ts.net';

function body(html: string): HTMLElement {
  const el = document.createElement('div');
  el.append(...Array.from(new DOMParser().parseFromString(html, 'text/html').body.childNodes));
  return el;
}

const HTML =
  '<div><a href="https://example.com/a">A</a> <a href="https://example.com/a">again</a> <a href="mailto:x@example.com">mail</a>' +
  ' <a href="https://example.com/raw">https://example.com/raw</a> <a href="www.example.com/w">www.example.com/w</a>' +
  ` <a href="${BASE}/c/AbCdEfGhIjKlMnOpQrStUvWx">already tracked</a> <a href="http://example.org/b">B</a></div>` +
  '<blockquote><a href="https://example.com/quoted">quoted</a></blockquote>';

describe('links', () => {
  it('finds trackable links of the new text once each', () => {
    expect(extractLinks(body(HTML), BASE, isInQuote)).toEqual(['https://example.com/a', 'http://example.org/b']);
  });

  it('rewrites only links that have a tracked version and returns their ids', () => {
    const el = body(HTML);
    const mapping = new Map([['https://example.com/a', { linkId: 'l1', originalUrl: 'https://example.com/a', trackedUrl: `${BASE}/c/token-a` }]]);
    expect(rewriteLinks(el, mapping, BASE, isInQuote)).toEqual(['l1']);
    const hrefs = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.filter((href) => href === `${BASE}/c/token-a`)).toHaveLength(2);
    expect(hrefs).toContain('http://example.org/b');
    expect(hrefs).toContain('https://example.com/quoted');
    expect(Array.from(el.querySelectorAll('a')).map((a) => a.textContent)).toContain('A');
  });
});