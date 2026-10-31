import type { ActivityItem } from './api-types';
import { formatDuration, formatWhen, ordinal, shortDuration } from './time';

/** Each notification type has its own icon (icons.mjs draws them at build time). */
export type NotificationIcon = 'open' | 'click' | 'doc-view' | 'doc-read' | 'doc-download' | 'follow-up' | 'alert' | 'group';

export type NotificationButton = 'gmail' | 'mute';

/** Where a click on the notification leads: the Gmail thread in the right account, else the MailPulse page. */
export interface NotificationTarget {
  emailId: string | null;
  account: string | null;
  threadId: string | null;
  documentId: string | null;
  /** A dashboard page instead of an email or document: the weekly summary opens Reports. */
  page?: 'reports';
}

/** One desktop notification. All fields are plain text (chrome.notifications never renders HTML). */
export interface NotificationSpec {
  id: string;
  title: string;
  message: string;
  contextMessage: string;
  icon: NotificationIcon;
  target: NotificationTarget;
  buttons: NotificationButton[];
}

export const BUTTON_TITLES: Record<NotificationButton, string> = { gmail: 'Open in Gmail', mute: 'Mute this email' };

const SOURCES: Record<string, string> = {
  GMAIL_PROXY: 'via Gmail',
  YAHOO_PROXY: 'via Yahoo Mail',
  OUTLOOK_PROXY: 'via Outlook',
  APPLE_MPP: 'via Apple Mail',
  DIRECT: 'in a browser or mail app',
};

const MAX_SUBJECT = 80;
const MAX_DOCUMENT = 60;
const GMAIL_ID = /^[A-Za-z0-9:_-]{1,64}$/;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function subjectOf(item: ActivityItem): string {
  return clip(item.subject?.trim() || '(no subject)', MAX_SUBJECT);
}

/** "Resume" for "Resume.pdf": the brief's "Resume opened" wording. */
function documentOf(item: ActivityItem): string {
  const name = item.documentName?.trim().replace(/\.pdf$/i, '') ?? '';
  return clip(name || 'Document', MAX_DOCUMENT);
}

function whoOf(item: ActivityItem): string {
  if (item.recipients) return item.recipients;
  if (item.kind.startsWith('DOC_')) return item.linkLabel ? `Link "${item.linkLabel}"` : 'Someone with the link';
  return 'Recipient unknown';
}

function joined(parts: (string | null | undefined | false)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' · ');
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function targetOf(item: ActivityItem): NotificationTarget {
  if (item.kind === 'ALERT' && item.alertType === 'WEEKLY') {
    return { emailId: null, account: null, threadId: null, documentId: null, page: 'reports' };
  }
  const threadId = item.gmailThreadId && GMAIL_ID.test(item.gmailThreadId) ? item.gmailThreadId : null;
  return { emailId: item.emailId, account: item.account ?? null, threadId, documentId: item.documentId ?? null };
}

function buttonsOf(target: NotificationTarget): NotificationButton[] {
  const buttons: NotificationButton[] = [];
  if (target.threadId && target.account) buttons.push('gmail');
  if (target.emailId) buttons.push('mute');
  return buttons;
}

function alertTitle(item: ActivityItem): { title: string; icon: NotificationIcon } {
  switch (item.alertType) {
    case 'FOLLOW_UP':
      return { title: `Follow-up: ${subjectOf(item)}`, icon: 'follow-up' };
    case 'OPEN_SPIKE':
      return { title: `Hot: ${subjectOf(item)}`, icon: 'alert' };
    case 'DOC_VIEWS':
      return { title: `Hot document: ${documentOf(item)}`, icon: 'alert' };
    case 'NO_REPLY':
      return { title: `No reply yet: ${subjectOf(item)}`, icon: 'follow-up' };
    case 'WEEKLY':
      return { title: 'MailPulse weekly summary', icon: 'alert' };
    default:
      return { title: `Revived: ${subjectOf(item)}`, icon: 'alert' };
  }
}

function single(item: ActivityItem, now: number, timeZone: string | undefined): NotificationSpec {
  const target = targetOf(item);
  const base = { id: `mp:item:${item.id}`, contextMessage: formatWhen(item.occurredAt, now, timeZone), target, buttons: buttonsOf(target) };
  const via = item.source ? SOURCES[item.source] : undefined;
  switch (item.kind) {
    case 'OPEN': {
      const n = item.openNumber ?? 1;
      return {
        ...base,
        title: n >= 2 ? `Opened again (${n}×): ${subjectOf(item)}` : `Opened: ${subjectOf(item)}`,
        message: joined([whoOf(item), `${ordinal(n)} open`, via]),
        icon: 'open',
      };
    }
    case 'CLICK':
      return { ...base, title: `Link clicked: ${subjectOf(item)}`, message: joined([whoOf(item), hostOf(item.linkUrl)]), icon: 'click' };
    case 'DOC_VIEW':
      return { ...base, title: `${documentOf(item)} opened`, message: joined([whoOf(item), item.subject && subjectOf(item)]), icon: 'doc-view' };
    case 'DOC_READ': {
      const seconds = item.readSeconds ?? 0;
      const pages = item.pagesViewed != null && item.pageCount ? `${item.pagesViewed}/${item.pageCount} pages` : null;
      return {
        ...base,
        title: `${documentOf(item)} read (${shortDuration(seconds)})`,
        message: joined([whoOf(item), formatDuration(seconds), pages]),
        icon: 'doc-read',
      };
    }
    case 'DOC_DOWNLOAD':
      return {
        ...base,
        title: `${documentOf(item)} downloaded`,
        message: joined([whoOf(item), item.subject && subjectOf(item)]),
        icon: 'doc-download',
      };
    case 'ALERT': {
      const { title, icon } = alertTitle(item);
      return { ...base, title, message: item.alertText ?? '', icon };
    }
  }
}

/** Several opens of one email in one batch become "Opened 3 times in 5 min" (PLAN §4.6, brief Part B3). */
function burst(opens: ActivityItem[], now: number, timeZone: string | undefined): NotificationSpec {
  const last = opens.at(-1)!;
  const first = opens[0]!;
  const minutes = Math.max(1, Math.round((Date.parse(last.occurredAt) - Date.parse(first.occurredAt)) / 60_000));
  const target = targetOf(last);
  return {
    id: `mp:item:${last.id}`,
    title: `Opened ${opens.length} times in ${minutes} min: ${subjectOf(last)}`,
    message: joined([whoOf(last), last.source ? SOURCES[last.source] : null]),
    contextMessage: formatWhen(last.occurredAt, now, timeZone),
    icon: 'open',
    target,
    buttons: buttonsOf(target),
  };
}

export interface NotifyOptions {
  now: number;
  timeZone?: string;
  /** More notifications than this become one summary. */
  groupAbove?: number;
}

/** The desktop notifications for one batch of new activity (oldest first). */
export function notificationsFor(items: readonly ActivityItem[], options: NotifyOptions): NotificationSpec[] {
  const { now, timeZone, groupAbove = 3 } = options;
  const wanted = items.filter((item) => item.shouldNotify);
  const opensByEmail = new Map<string, ActivityItem[]>();
  for (const item of wanted) {
    if (item.kind === 'OPEN' && item.emailId) opensByEmail.set(item.emailId, [...(opensByEmail.get(item.emailId) ?? []), item]);
  }
  const specs: NotificationSpec[] = [];
  for (const item of wanted) {
    const opens = item.kind === 'OPEN' && item.emailId ? opensByEmail.get(item.emailId) : undefined;
    if (opens && opens.length > 1) {
      // One notification per burst, at the position of its last open.
      if (opens.at(-1) === item) specs.push(burst(opens, now, timeZone));
      continue;
    }
    specs.push(single(item, now, timeZone));
  }
  const last = specs.at(-1);
  if (!last || specs.length <= groupAbove) return specs;
  return [
    {
      id: `mp:group:${last.id.slice('mp:item:'.length)}`,
      title: `${specs.length} new MailPulse updates`,
      message: specs
        .slice(-3)
        .map((spec) => spec.title)
        .join('\n'),
      contextMessage: 'MailPulse',
      icon: 'group',
      target: { emailId: null, account: null, threadId: null, documentId: null },
      buttons: [],
    },
  ];
}

/** Gmail's address for a thread in a given account (authuser picks the signed-in account). */
export function gmailThreadUrl(account: string, threadId: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${encodeURIComponent(threadId)}`;
}

/** The MailPulse page for a notification without a Gmail thread. */
export function dashboardPath(target: NotificationTarget): string {
  if (target.page === 'reports') return '/reports';
  if (target.emailId) return `/emails/${target.emailId}`;
  if (target.documentId) return `/documents/${target.documentId}`;
  return '/activity';
}
