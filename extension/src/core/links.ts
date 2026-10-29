/**
 * Link tracking in the new text of an email (PLAN §4.1 steps 2-3). Quoted text is never touched,
 * and links written out as a bare URL keep their real target, so the visible text and the target
 * never disagree (spam filters dislike that).
 */

export interface TrackedLink {
  linkId: string;
  originalUrl: string;
  trackedUrl: string;
}

const MAX_URL = 2048;
const BARE_URL_TEXT = /^\s*(https?:\/\/|www\.)/i;

function trackable(anchor: HTMLAnchorElement, publicBaseUrl: string, isQuoted: (el: Element) => boolean): string | null {
  const href = anchor.getAttribute('href')?.trim() ?? '';
  if (!/^https?:\/\//i.test(href) || href.length > MAX_URL) return null;
  if (href.toLowerCase().startsWith(`${publicBaseUrl.toLowerCase()}/`)) return null;
  if (isQuoted(anchor) || BARE_URL_TEXT.test(anchor.textContent ?? '')) return null;
  return href;
}

/** Link targets in the new text that can be tracked, without duplicates. */
export function extractLinks(body: ParentNode, publicBaseUrl: string, isQuoted: (el: Element) => boolean): string[] {
  const urls = new Set<string>();
  for (const anchor of Array.from(body.querySelectorAll('a[href]'))) {
    if (!(anchor instanceof HTMLAnchorElement)) continue;
    const href = trackable(anchor, publicBaseUrl, isQuoted);
    if (href) urls.add(href);
  }
  return [...urls].slice(0, 200);
}

/**
 * Points each link that has a tracked version at it. Links without one stay untouched (for example
 * one typed in the last second). Returns the ids of the tracked links now in the email.
 */
export function rewriteLinks(
  body: ParentNode,
  mapping: ReadonlyMap<string, TrackedLink>,
  publicBaseUrl: string,
  isQuoted: (el: Element) => boolean,
): string[] {
  const used = new Set<string>();
  for (const anchor of Array.from(body.querySelectorAll('a[href]'))) {
    if (!(anchor instanceof HTMLAnchorElement)) continue;
    const href = trackable(anchor, publicBaseUrl, isQuoted);
    const tracked = href ? mapping.get(href) : undefined;
    if (!tracked) continue;
    anchor.setAttribute('href', tracked.trackedUrl);
    used.add(tracked.linkId);
  }
  return [...used];
}
