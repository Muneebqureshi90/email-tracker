import { BellRing, BookOpenCheck, Download, ExternalLink, FileText, MailOpen, MousePointerClick, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { ActivityItem, ActivityKind } from '../api/types';
import { SOURCES, duration, formatTime, ordinal, relativeTime } from '../lib/format';
import { ACTIVITY_LABELS, ALERT_LABELS, gmailThreadUrl } from '../lib/labels';

const ICONS: Record<ActivityKind, LucideIcon> = {
  OPEN: MailOpen,
  CLICK: MousePointerClick,
  ALERT: BellRing,
  DOC_VIEW: FileText,
  DOC_READ: BookOpenCheck,
  DOC_DOWNLOAD: Download,
};

const DOCUMENT_KINDS: ActivityKind[] = ['DOC_VIEW', 'DOC_READ', 'DOC_DOWNLOAD'];

export function isDocumentItem(item: ActivityItem): boolean {
  return DOCUMENT_KINDS.includes(item.kind);
}

/** "Opened", "Opened again", "Read", or the alert's own label. */
export function activityLabel(item: ActivityItem): string {
  if (item.kind === 'ALERT' && item.alertType) return ALERT_LABELS[item.alertType].label;
  if (item.kind === 'OPEN' && (item.openNumber ?? 1) >= 2) return 'Opened again';
  return ACTIVITY_LABELS[item.kind].label;
}

/** What happened, in a few words: "3rd open · Gmail", "Link to example.com", "2 min 14 s · 3/3 pages". */
export function activityDetail(item: ActivityItem): string {
  if (item.kind === 'ALERT') return item.alertText ?? '';
  if (item.kind === 'CLICK') {
    if (!item.linkUrl) return 'Link clicked';
    try {
      return `Link to ${new URL(item.linkUrl).host}`;
    } catch {
      return 'Link clicked';
    }
  }
  const source = item.source ? (SOURCES[item.source] ?? item.source) : '';
  if (item.kind === 'OPEN') return [item.openNumber && item.openNumber >= 2 ? `${ordinal(item.openNumber)} open` : '', source].filter(Boolean).join(' · ');
  const pages = item.pagesViewed && item.pageCount ? `${item.pagesViewed}/${item.pageCount} pages` : item.pageCount ? `${item.pageCount} pages` : '';
  if (item.kind === 'DOC_READ') return [item.readSeconds ? duration(item.readSeconds) : '', pages].filter(Boolean).join(' · ');
  if (item.kind === 'DOC_VIEW') return pages;
  return 'Downloaded the PDF';
}

/** The subject (or document name) and who it was, for the first and second line. */
function lines(item: ActivityItem): { primary: string; who: string } {
  if (isDocumentItem(item)) {
    return { primary: item.documentName ?? 'Document', who: item.recipients || (item.linkLabel ? `Share link: ${item.linkLabel}` : 'Share link') };
  }
  return { primary: item.subject || '(no subject)', who: item.recipients || 'Recipient unknown' };
}

function targetOf(item: ActivityItem): string {
  if (isDocumentItem(item) && item.documentId) return `/documents/${encodeURIComponent(item.documentId)}`;
  return item.emailId ? `/emails/${item.emailId}` : '/activity';
}

/** Newest first, with an icon per kind and "Open in Gmail". Subjects are plain React text, never HTML. */
export function ActivityList({ items, now, timeOfDay = false }: { items: ActivityItem[]; now: number; timeOfDay?: boolean }) {
  const newestFirst = [...items].sort((a, b) => b.id - a.id);
  return (
    <ul className="divide-y divide-line">
      {newestFirst.map((item) => {
        const Icon = ICONS[item.kind];
        const tone = item.kind === 'ALERT' && item.alertType ? ALERT_LABELS[item.alertType].tone : ACTIVITY_LABELS[item.kind].tone;
        const { primary, who } = lines(item);
        const detail = activityDetail(item);
        const gmail = isDocumentItem(item) ? null : gmailThreadUrl(item.account, item.gmailThreadId);
        return (
          <li key={item.id} className="flex items-stretch hover:bg-raised">
            <Link
              to={targetOf(item)}
              title={[primary, who, detail].filter(Boolean).join(' · ')}
              className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3 pl-4 text-sm"
            >
              <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-chip ${tone}`} aria-hidden="true">
                <Icon size={14} />
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className={`shrink-0 text-xs font-semibold ${tone}`}>{activityLabel(item)}</span>
                  <span className="truncate font-medium">{primary}</span>
                </span>
                {/* Recipients and detail truncate separately, so a cut never leaves a dangling "·…" (bug A5). */}
                <span className="flex min-w-0 gap-1 text-xs text-muted">
                  <span className="min-w-0 truncate">{who}</span>
                  {detail && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="max-w-[55%] shrink-0 truncate">{detail}</span>
                    </>
                  )}
                </span>
              </span>
              <time className={`text-xs whitespace-nowrap text-muted ${gmail ? '' : 'pr-4'}`} dateTime={item.occurredAt}>
                {timeOfDay && now - Date.parse(item.occurredAt) > 12 * 3_600_000 ? formatTime(item.occurredAt) : relativeTime(item.occurredAt, now)}
              </time>
            </Link>
            {gmail && (
              <a
                href={gmail}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open in Gmail: ${primary}`}
                title="Open in Gmail"
                className="my-2 mr-2 ml-1 inline-flex w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg"
              >
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
