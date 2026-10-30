import { Link } from 'react-router';
import type { EmailSummary } from '../api/types';
import { count, formatDateTime, recipientsText, relativeTime } from '../lib/format';
import { OpenMark } from './ui';

/** Emails as a table on wide screens and as a list on phones. */
export function EmailTable({ emails, now }: { emails: EmailSummary[]; now: number }) {
  return (
    <>
      <div className="table-wrap hidden md:block">
        <table className="table">
          <thead>
            <tr>
              <th className="w-10">
                <span className="sr-only">Status</span>
              </th>
              <th>Email</th>
              <th>Sent</th>
              <th className="text-right">Opens</th>
              <th className="text-right">Clicks</th>
              <th>Last opened</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => (
              <tr key={email.id} className="hover:bg-raised/60">
                <td>
                  <OpenMark opened={email.openCount > 0 || email.clickCount > 0} unreliable={email.openStatusUnreliable} />
                </td>
                <td className="max-w-md">
                  <Link to={`/emails/${email.id}`} className="block truncate font-medium hover:underline">
                    {email.subject || '(no subject)'}
                  </Link>
                  <span className="block truncate text-xs text-muted">{recipientsText(email.recipients)}</span>
                </td>
                <td className="whitespace-nowrap text-muted">{formatDateTime(email.sentAt)}</td>
                <td className="text-right tabular-nums">{email.openCount}</td>
                <td className="text-right tabular-nums">{email.clickCount}</td>
                <td className="whitespace-nowrap text-muted">{relativeTime(email.lastOpenedAt, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {emails.map((email) => (
          <li key={email.id}>
            <Link to={`/emails/${email.id}`} className="flex gap-3 px-4 py-3 hover:bg-raised/60">
              <OpenMark opened={email.openCount > 0 || email.clickCount > 0} unreliable={email.openStatusUnreliable} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{email.subject || '(no subject)'}</span>
                <span className="block truncate text-xs text-muted">
                  {recipientsText(email.recipients)} · {count(email.openCount, 'open')} · {count(email.clickCount, 'click')}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
