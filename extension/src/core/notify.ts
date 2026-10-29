import type { ActivityItem } from './api-types';

/** One desktop notification. All fields are plain text (chrome.notifications never renders HTML). */
export interface NotificationSpec {
  id: string;
  title: string;
  message: string;
  contextMessage: string;
  emailId: string | null;
}

const SOURCES: Record<string, string> = {
  GMAIL_PROXY: 'via Gmail',
  YAHOO_PROXY: 'via Yahoo Mail',
  OUTLOOK_PROXY: 'via Outlook',
  APPLE_MPP: 'via Apple Mail',
  DIRECT: 'in a browser or mail app',
};

const MAX_SUBJECT = 80;

function subjectOf(item: ActivityItem): string {
  const subject = item.subject?.trim() || '(no subject)';
  return subject.length > MAX_SUBJECT ? `${subject.slice(0, MAX_SUBJECT - 1)}…` : subject;
}

function verbOf(item: ActivityItem): string {
  switch (item.kind) {
    case 'OPEN':
      return 'Opened';
    case 'CLICK':
      return 'Clicked';
    case 'ALERT':
      return 'Alert';
  }
}

function contextOf(item: ActivityItem): string {
  if (item.kind === 'CLICK' && item.linkUrl) {
    try {
      return `Link to ${new URL(item.linkUrl).host}`;
    } catch {
      return 'Link clicked';
    }
  }
  return (item.source && SOURCES[item.source]) ?? '';
}

/** Up to `groupAbove` items get one notification each; more are grouped into one (PLAN §4.6). */
export function notificationsFor(items: readonly ActivityItem[], groupAbove = 3): NotificationSpec[] {
  const wanted = items.filter((item) => item.shouldNotify);
  const last = wanted.at(-1);
  if (!last) return [];
  if (wanted.length > groupAbove) {
    return [
      {
        id: `mp:group:${last.id}`,
        title: `${wanted.length} new opens and clicks`,
        message: wanted
          .slice(-3)
          .map((item) => `${verbOf(item)}: ${subjectOf(item)}`)
          .join('\n'),
        contextMessage: 'MailPulse',
        emailId: null,
      },
    ];
  }
  return wanted.map((item) => ({
    id: `mp:item:${item.id}:${item.emailId}`,
    title: `${verbOf(item)}: ${subjectOf(item)}`,
    message: item.recipients || 'Recipient unknown',
    contextMessage: contextOf(item),
    emailId: item.emailId,
  }));
}

/** The email a notification belongs to, or null for grouped notifications. */
export function emailIdOfNotification(notificationId: string): string | null {
  const match = /^mp:item:\d+:([0-9a-f-]{36})$/.exec(notificationId);
  return match?.[1] ?? null;
}
