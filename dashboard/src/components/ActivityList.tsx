import { Link } from 'react-router';
import type { ActivityItem } from '../api/types';
import { SOURCES, relativeTime } from '../lib/format';
import { ALERT_LABELS } from '../pages/AlertsPage';

const KINDS: Record<ActivityItem['kind'], { label: string; tone: string }> = {
  OPEN: { label: 'Opened', tone: 'text-good' },
  CLICK: { label: 'Clicked', tone: 'text-accent' },
  ALERT: { label: 'Alert', tone: 'text-warn' },
};

function detail(item: ActivityItem): string {
  if (item.kind === 'ALERT') return item.alertText ?? '';
  if (item.kind === 'CLICK' && item.linkUrl) {
    try {
      return `Link to ${new URL(item.linkUrl).host}`;
    } catch {
      return 'Link clicked';
    }
  }
  return item.source ? (SOURCES[item.source] ?? item.source) : '';
}

/** Newest first. Subjects are rendered as text by React, never as HTML. */
export function ActivityList({ items, now }: { items: ActivityItem[]; now: number }) {
  const newestFirst = [...items].sort((a, b) => b.id - a.id);
  return (
    <ul className="divide-y divide-line">
      {newestFirst.map((item) => (
        <li key={item.id}>
          <Link to={`/emails/${item.emailId}`} className="grid grid-cols-[5rem_1fr_auto] gap-3 px-4 py-3 text-sm hover:bg-raised/60">
            <span className={`font-semibold ${KINDS[item.kind].tone}`}>{item.alertType ? ALERT_LABELS[item.alertType].label : KINDS[item.kind].label}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.subject || '(no subject)'}</span>
              <span className="block truncate text-xs text-muted">
                {item.recipients || 'Recipient unknown'}
                {detail(item) && ` · ${detail(item)}`}
              </span>
            </span>
            <time className="text-xs whitespace-nowrap text-muted" dateTime={item.occurredAt}>
              {relativeTime(item.occurredAt, now)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
