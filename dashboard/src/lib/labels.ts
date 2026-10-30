import type { ActivityKind, AlertType } from '../api/types';

export const ALERT_LABELS: Record<AlertType, { label: string; tone: string }> = {
  FOLLOW_UP: { label: 'Follow up', tone: 'text-warn' },
  OPEN_SPIKE: { label: 'Hot', tone: 'text-good' },
  REVIVAL: { label: 'Opened again', tone: 'text-accent' },
  DOC_VIEWS: { label: 'Document viewed often', tone: 'text-good' },
};

export const ACTIVITY_LABELS: Record<ActivityKind, { label: string; tone: string }> = {
  OPEN: { label: 'Opened', tone: 'text-good' },
  CLICK: { label: 'Clicked', tone: 'text-accent' },
  ALERT: { label: 'Alert', tone: 'text-warn' },
  DOC_VIEW: { label: 'Viewed', tone: 'text-good' },
  DOC_READ: { label: 'Read', tone: 'text-good' },
  DOC_DOWNLOAD: { label: 'Downloaded', tone: 'text-accent' },
};

/** Activity filter chips and the `kinds` they ask the API for. */
export const ACTIVITY_FILTERS = [
  { value: 'all', label: 'All', kinds: [] },
  { value: 'opens', label: 'Opens', kinds: ['OPEN'] },
  { value: 'clicks', label: 'Clicks', kinds: ['CLICK'] },
  { value: 'alerts', label: 'Alerts', kinds: ['ALERT'] },
  { value: 'documents', label: 'Documents', kinds: ['DOC_VIEW', 'DOC_READ', 'DOC_DOWNLOAD'] },
] as const satisfies readonly { value: string; label: string; kinds: readonly ActivityKind[] }[];

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]['value'];

/**
 * The Gmail thread in the right account (D-101). Gmail accepts the account address in place of the
 * account number, and the hex thread ID from InboxSDK opens with #all/. Nothing is sent anywhere:
 * this is a plain link the owner clicks.
 */
export function gmailThreadUrl(account: string | null | undefined, threadId: string | null | undefined): string | null {
  if (!threadId || !/^[0-9A-Za-z_-]{6,64}$/.test(threadId)) return null;
  const user = account && /^[^\s/@]+@[^\s/@]+$/.test(account) ? encodeURIComponent(account).replace('%40', '@') : '0';
  return `https://mail.google.com/mail/u/${user}/#all/${threadId}`;
}
