import { Link } from 'react-router';
import type { ActivityItem } from '../api/types';
import { SOURCES, relativeTime } from '../lib/format';
import { ALERT_LABELS } from '../pages/AlertsPage';

const KINDS: Record<ActivityItem['kind'], { label: string; tone: string }> = {
  OPEN: { label: 'Opened', tone: 'text-good' },
  CLICK: { label: 'Clicked', tone: 'text-accent' },
  ALERT: { label: 'Alert', tone: 'text-warn' },
  DOC_VIEW: { label: 'Viewed', tone: 'text-good' },
  DOC_READ: { label: 'Read', tone: 'text-good' },
  DOC_DOWNLOAD: { label: 'Downloaded', tone: 'text-accent' },
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

/** Everything the row shows, for the hover tooltip. */
function fullText(item: ActivityItem): string {
  return [item.subject || '(no subject)', item.recipients || 'Recipient unknown', detail(item)].filter(Boolean).join(' · ');
}

/** Newest first. Subjects are rendered as text by React, never as HTML. */
export function ActivityList({ items, now }: { items: ActivityItem[]; now: number }) {
  const newestFirst = [...items].sort((a, b) => b.id - a.id);
  return (
    <ul className="divide-y divide-line">
      {newestFirst.map((item) => (
        <li key={item.id}>
          <Link
            to={`/emails/${item.emailId}`}
            title={fullText(item)}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-3 px-4 py-3 text-sm hover:bg-raised"
          >
            <span className={`truncate font-semibold ${KINDS[item.kind].tone}`}>{item.alertType ? ALERT_LABELS[item.alertType].label : KINDS[item.kind].label}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.subject || '(no subject)'}</span>
              {/* Recipients and detail truncate separately, so a cut never leaves a dangling "·…" (bug A5). */}
              <span className="flex min-w-0 gap-1 text-xs text-muted">
                <span className="min-w-0 truncate">{item.recipients || 'Recipient unknown'}</span>
                {detail(item) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="max-w-[50%] shrink-0 truncate">{detail(item)}</span>
                  </>
                )}
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
