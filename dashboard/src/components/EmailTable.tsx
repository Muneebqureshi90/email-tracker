import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { EmailSummary } from '../api/types';
import { count, formatShortDateTime, recipientsText, relativeTime } from '../lib/format';
import type { SortDir } from '../lib/paging';
import { DataTable, MAIN_COLUMN, type Column } from './DataTable';
import { Avatar, OpenedAgainChip, StatusMark } from './marks';
import { Empty } from './ui';

function columns(now: number): Column<EmailSummary>[] {
  return [
    {
      key: 'email',
      header: 'Email',
      className: MAIN_COLUMN,
      cell: (email) => {
        const first = email.recipients[0];
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={first?.name} email={first?.email ?? email.subject ?? '?'} />
            <div className="min-w-0">
              <Link to={`/emails/${email.id}`} className="block truncate font-medium hover:underline">
                {email.subject || '(no subject)'}
              </Link>
              <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
                <span className="truncate">{recipientsText(email.recipients)}</span>
                {email.openedAgain && <OpenedAgainChip />}
              </span>
            </div>
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', className: 'whitespace-nowrap', cell: (email) => <StatusMark email={email} /> },
    { key: 'sent', header: 'Sent', sort: 'sent', className: 'whitespace-nowrap text-muted', cell: (email) => formatShortDateTime(email.sentAt, now) },
    { key: 'opens', header: 'Opens', sort: 'opens', align: 'right', cell: (email) => email.openCount },
    { key: 'clicks', header: 'Clicks', sort: 'clicks', align: 'right', cell: (email) => email.clickCount },
    { key: 'lastOpened', header: 'Last opened', sort: 'lastOpened', className: 'whitespace-nowrap text-muted', cell: (email) => relativeTime(email.lastOpenedAt, now) },
  ];
}

/** Emails as a table on wide screens and as a list on phones, with marks, avatars and sorting. */
export function EmailTable({
  emails,
  now,
  label = 'Emails',
  sort,
  dir,
  onSort,
  error,
  onRetry,
  empty = <Empty title="No tracked emails yet">Send an email from Gmail with the MailPulse extension installed.</Empty>,
  busy = false,
  stickyHeader = false,
}: {
  emails: EmailSummary[] | undefined;
  now: number;
  label?: string;
  sort?: string | undefined;
  dir?: SortDir;
  onSort?: (key: string) => void;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  busy?: boolean;
  stickyHeader?: boolean;
}) {
  return (
    <DataTable
      label={label}
      columns={columns(now)}
      rows={emails}
      rowKey={(email) => email.id}
      rowTo={(email) => `/emails/${email.id}`}
      sort={sort}
      dir={dir}
      onSort={onSort}
      error={error}
      onRetry={onRetry}
      empty={empty}
      busy={busy}
      stickyHeader={stickyHeader}
      mobile={(rows) => (
        <ul className="divide-y divide-line" aria-label={label}>
          {rows.map((email) => (
            <li key={email.id}>
              <Link to={`/emails/${email.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-raised">
                <span className="mt-0.5 w-9 shrink-0">
                  <StatusMark email={email} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{email.subject || '(no subject)'}</span>
                  <span className="block truncate text-xs text-muted">
                    {recipientsText(email.recipients)} · {count(email.openCount, 'open')} · {relativeTime(email.sentAt, now)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
