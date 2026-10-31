import type { EmailCard, Mark } from './api-types';
import { formatWhen, relativeTime } from './time';

/**
 * Status marks (docs/v2-contract.md, "Marks and hover card"; the dashboard uses the same rule):
 * sent grey ✓, opened green ✓✓, opened N× green ✓✓ with a count from 2 opens, clicked ✓✓ with a link
 * dot, unreliable grey ✓ with "?". Our own drawings (DECISIONS D-001).
 */
export type MarkStatus = 'sent' | 'opened' | 'clicked' | 'unreliable';

export interface MarkView {
  status: MarkStatus;
  /** The badge number, from 2 opens (at most 99; the hover card has the exact count). */
  count: number | null;
  /** Plain text for screen readers, e.g. "Opened 3 times · 2 clicks". */
  label: string;
}

function times(count: number): string {
  return count === 1 ? 'once' : `${count} times`;
}

export function markView(mark: Mark): MarkView {
  const status: MarkStatus =
    mark.clickCount > 0 ? 'clicked' : mark.openCount > 0 ? 'opened' : mark.openStatusUnreliable ? 'unreliable' : 'sent';
  const parts: string[] = [];
  if (mark.openCount > 0) parts.push(`Opened ${times(mark.openCount)}`);
  if (mark.clickCount > 0) parts.push(`${mark.clickCount} click${mark.clickCount === 1 ? '' : 's'}`);
  if (parts.length === 0) {
    parts.push('Sent, not opened yet');
    // Q8: every recipient uses a provider that blocks images by default.
    if (mark.openStatusUnreliable) parts.push('open status may be unreliable');
  }
  return { status, count: mark.openCount >= 2 ? Math.min(mark.openCount, 99) : null, label: parts.join(' · ') };
}

const SHAPES: Record<MarkStatus, string> = {
  sent: '<path d="M3 8.6l3 3L13 4.6"/>',
  opened: '<path d="M1 8.6l3 3L10.6 5M7 11.6L13.6 5"/>',
  clicked: '<path d="M1 8.6l3 3L10.6 5M7 11.6L13.6 5"/><circle cx="14.2" cy="12.8" r="1.7" fill="currentColor" stroke="none"/>',
  unreliable:
    '<path d="M1.2 8.6l3 3L10.4 4.6"/><text x="15.8" y="13.6" text-anchor="end" font-size="8.5" font-weight="700" ' +
    'font-family="Arial,sans-serif" fill="currentColor" stroke="none">?</text>',
};

/** 16 px inline SVG drawn in currentColor, so CSS picks the Gmail light or dark colour. */
export function markSvg(status: MarkStatus): string {
  return (
    // xmlns: DOMParser (tickElement) needs it to make a real SVG; without it nothing is drawn.
    '<svg xmlns="http://www.w3.org/2000/svg" class="mp-tick" width="16" height="16" viewBox="0 0 16 16" ' +
    'aria-hidden="true" focusable="false" fill="none" ' +
    `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SHAPES[status]}</svg>`
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function toneOf(status: MarkStatus): string {
  return status === 'opened' || status === 'clicked' ? 'mp-green' : 'mp-grey';
}

/** The email ID for data-mp-email (the hover card reads it), or '' when it is not a UUID. */
export function markEmailId(mark: Mark): string {
  return UUID.test(mark.emailId) ? mark.emailId : '';
}

/**
 * Markup for InboxSDK's iconHtml (InboxSDK sets it with innerHTML inside Gmail). Only constants, a
 * checked UUID and numbers go in: no subject, address or any other untrusted text.
 */
export function markHtml(mark: Mark, withCount: boolean): string {
  const view = markView(mark);
  const id = markEmailId(mark);
  const count = withCount && view.count !== null ? `<span class="mp-count">${view.count}</span>` : '';
  return (
    `<span class="mp-mark ${toneOf(view.status)}" data-mp-email="${id}" tabindex="0" role="img" ` +
    `aria-label="MailPulse: ${view.label}">${markSvg(view.status)}${count}</span>`
  );
}

/** The separate count slot for thread rows (Gmail's attachment column grows 16 px per icon). */
export function countHtml(mark: Mark): string | null {
  const view = markView(mark);
  if (view.count === null) return null;
  const id = markEmailId(mark);
  return `<span class="mp-mark mp-count-slot ${toneOf(view.status)}" data-mp-email="${id}" aria-hidden="true">${view.count}</span>`;
}

/** What the hover card shows, as plain text lines (rendered with textContent). */
export interface CardContent {
  status: MarkStatus;
  headline: string;
  summary: string | null;
  opens: string[];
  clicks: string | null;
  alerts: string[];
  documents: string[];
}

function countText(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function cardContent(card: EmailCard, now: number, timeZone: string | undefined): CardContent {
  const status: MarkStatus = card.clickCount > 0 ? 'clicked' : card.openCount > 0 ? 'opened' : 'sent';
  const headline = card.openCount > 0 ? `Opened ${times(card.openCount)}` : 'Sent, not opened yet';
  let summary: string | null = null;
  if (card.openCount > 0 && card.firstOpenedAt) {
    const first = `first ${formatWhen(card.firstOpenedAt, now, timeZone)}`;
    summary = card.openCount > 1 && card.lastOpenedAt ? `${first} · last ${relativeTime(card.lastOpenedAt, now)}` : first;
  }
  const opens = card.openCount > 1 ? card.recentOpens.slice(0, 5).map((at) => formatWhen(at, now, timeZone)) : [];
  const clicks =
    card.clickCount > 0
      ? `${countText(card.clickCount, 'click', 'clicks')}${card.lastClickedAt ? ` · last ${relativeTime(card.lastClickedAt, now)}` : ''}`
      : null;
  const documents = card.documents.map(
    (doc) =>
      `${doc.name}: ${countText(doc.views, 'view', 'views')} · ${countText(doc.reads, 'read', 'reads')} · ` +
      countText(doc.downloads, 'download', 'downloads'),
  );
  return { status, headline, summary, opens, clicks, alerts: card.alerts.map((alert) => alert.text), documents };
}
