/**
 * Gmail DOM checks InboxSDK does not offer. They read the English Gmail interface and are best
 * effort (DECISIONS D-055); Spike 1 records the real DOM.
 */

const CONFIDENTIAL_TEXT = /confidential mode|content expires|expires on|expires in/i;

/** Confidential mode adds an "expires" notice next to the body, inside the compose window. */
export function looksConfidential(body: HTMLElement): boolean {
  const root = body.closest('[role="dialog"]') ?? body.closest('table') ?? body.parentElement;
  if (!root) return false;
  const outside = (root.textContent ?? '').replace(body.textContent ?? '', '');
  return CONFIDENTIAL_TEXT.test(outside);
}
