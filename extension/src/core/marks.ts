import type { Mark } from './api-types';
import { relativeTime } from './time';

function svgUrl(body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const STROKE = 'fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

/** ✓ grey: sent, not opened. Our own drawing (DECISIONS D-001). */
export const ICON_SENT = svgUrl(`<path d="M3 8.6l3 3L13 4.6" stroke="#80868b" ${STROKE}/>`);
/** ✓✓ green: opened or clicked. */
export const ICON_OPENED = svgUrl(`<path d="M1 8.6l3 3L10.6 5M7 11.6L13.6 5" stroke="#188038" ${STROKE}/>`);
/** Compose toolbar button, tracking on: a pulse line. */
export const ICON_TRACK_ON = svgUrl(`<path d="M1.5 8.5h3l1.6-4 2.6 7.5 1.8-3.5h4" stroke="#0f766e" ${STROKE}/>`);
/** Compose toolbar button, tracking off: the pulse line crossed out. */
export const ICON_TRACK_OFF = svgUrl(
  `<path d="M1.5 8.5h3l1.6-4 2.6 7.5 1.8-3.5h4" stroke="#9aa0a6" ${STROKE}/><path d="M2.5 2.5l11 11" stroke="#5f6368" ${STROKE}/>`,
);

function times(count: number): string {
  return count === 1 ? 'once' : `${count} times`;
}

/** Plain-text tooltip, e.g. "MailPulse: Opened 3 times, last 1 hour ago · 2 clicks". */
export function markTooltip(mark: Mark, now: number): string {
  const parts: string[] = [];
  if (mark.openCount > 0) {
    const last = mark.lastOpenedAt ? `, last ${relativeTime(mark.lastOpenedAt, now)}` : '';
    parts.push(`Opened ${times(mark.openCount)}${last}`);
  }
  if (mark.clickCount > 0) parts.push(`${mark.clickCount} click${mark.clickCount === 1 ? '' : 's'}`);
  if (parts.length === 0) parts.push('Sent, not opened yet');
  return `MailPulse: ${parts.join(' · ')}`;
}

export function markIcon(mark: Mark): string {
  return mark.openCount > 0 || mark.clickCount > 0 ? ICON_OPENED : ICON_SENT;
}
