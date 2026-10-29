import { useParams } from 'react-router';
import { useEmail, useUpdatePreferences } from '../api/queries';
import type { EmailDetail, EventView } from '../api/types';
import { Card, Empty, ErrorBox, OpenMark, PageHeader, QueryState, Stat, TextLink, Toggle } from '../components/ui';
import { REASONS, SOURCES, count, formatDateTime, relativeTime } from '../lib/format';
import { useNow } from '../lib/now';

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return `: ${new URL(url).host}`;
  } catch {
    return '';
  }
}

const VERDICT_TONE: Record<EventView['verdict'], string> = {
  COUNTED: 'text-good',
  IGNORED: 'text-muted',
  PENDING: 'text-warn',
};

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const email = useEmail(id);
  return <QueryState query={email}>{(detail) => <EmailView detail={detail} />}</QueryState>;
}

function EmailView({ detail }: { detail: EmailDetail }) {
  const now = useNow();
  const preferences = useUpdatePreferences(detail.summary.id);
  const { summary } = detail;
  const opened = summary.openCount > 0 || summary.clickCount > 0;
  const linkUrls = new Map(detail.links.map((link) => [link.id, link.url]));

  return (
    <>
      <PageHeader
        title={summary.subject || '(no subject)'}
        description={`From ${summary.account} · ${summary.status === 'SENT' ? `sent ${formatDateTime(summary.sentAt)}` : summary.status.toLowerCase()}`}
        actions={<TextLink to="/emails">Back to emails</TextLink>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Status" value={<span className="flex items-center gap-2"><OpenMark opened={opened} unreliable={summary.openStatusUnreliable} />{opened ? 'Opened' : 'Not opened'}</span>} />
        <Stat label="Opens" value={summary.openCount} hint={summary.firstOpenedAt ? `first ${formatDateTime(summary.firstOpenedAt)}` : undefined} />
        <Stat label="Last opened" value={relativeTime(summary.lastOpenedAt, now)} />
        <Stat label="Clicks" value={summary.clickCount} hint={summary.lastClickedAt ? `last ${relativeTime(summary.lastClickedAt, now)}` : undefined} />
      </div>
      {summary.openStatusUnreliable && !opened && (
        <p role="note" className="mb-6 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
          Open status may be unreliable: every recipient uses a mail provider that blocks images by default (for example
          Outlook.com or Yahoo Mail), so an open may never be seen. A click still counts.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recipients" className="lg:col-span-2">
          <ul className="divide-y divide-line">
            {summary.recipients.map((recipient) => (
              <li key={`${recipient.kind}-${recipient.email}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <TextLink to={`/contacts/${encodeURIComponent(recipient.email)}`}>{recipient.name || recipient.email}</TextLink>
                <span className="flex items-center gap-2 text-muted">
                  {recipient.name && <span className="hidden sm:inline">{recipient.email}</span>}
                  <span className="chip">{recipient.kind}</span>
                </span>
              </li>
            ))}
          </ul>
          {summary.recipients.length === 0 && <Empty title="No recipients recorded" />}
        </Card>
        <Card title="This email">
          <div className="px-4 py-2">
            <Toggle
              label="Notifications"
              description="Desktop notifications for this email. Off = muted."
              checked={detail.notifications}
              disabled={preferences.isPending}
              onChange={(notifications) => preferences.mutate({ notifications })}
            />
            <Toggle
              label="Count new opens and clicks"
              description="Off keeps the history but ignores anything new."
              checked={detail.trackingEnabled}
              disabled={preferences.isPending}
              onChange={(trackingEnabled) => preferences.mutate({ trackingEnabled })}
            />
            <label className="block py-2">
              <span className="block text-sm font-medium">Follow-up reminder</span>
              <span className="block text-xs text-muted">Alert me when it is still unopened after:</span>
              <select
                className="input mt-1"
                value={detail.followUpHours ?? 0}
                disabled={preferences.isPending}
                onChange={(event) => preferences.mutate({ followUpHours: Number(event.target.value) as 0 | 24 | 48 | 72 })}
              >
                <option value={0}>Default from Settings</option>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={72}>72 hours</option>
              </select>
            </label>
            <p className="py-1 text-xs text-muted">Link tracking for this email: {detail.trackLinks ? 'on' : 'off'}</p>
            {preferences.isError && <ErrorBox error={preferences.error} />}
          </div>
        </Card>
      </div>
      {detail.links.length > 0 && (
        <Card title="Tracked links" className="mt-6">
          <ul className="divide-y divide-line">
            {detail.links.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate" title={link.url}>
                  {link.url}
                  {!link.used && <span className="chip ml-2">not in the sent email</span>}
                </span>
                <span className="whitespace-nowrap tabular-nums">{count(link.clickCount, 'click')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Every request, with the reason it did or did not count" className="mt-6">
        {detail.events.length === 0 ? (
          <Empty title="No requests yet">The pixel has not been loaded by anyone yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Result</th>
                  <th>Seen through</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {detail.events.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap">{formatDateTime(event.receivedAt)}</td>
                    <td>{event.type === 'OPEN' ? 'Open' : `Click${hostOf(event.linkId ? linkUrls.get(event.linkId) : undefined)}`}</td>
                    <td>
                      <span className={`font-semibold ${VERDICT_TONE[event.verdict]}`}>{event.verdict === 'COUNTED' ? 'Counted' : event.verdict === 'PENDING' ? 'Waiting (self-view hold)' : 'Not counted'}</span>
                      {event.reason && <span className="block text-xs text-muted">{REASONS[event.reason] ?? event.reason}</span>}
                    </td>
                    <td>{SOURCES[event.source] ?? event.source}</td>
                    <td className="max-w-xs text-xs break-words text-muted">
                      {event.userAgent ?? 'No user agent'}
                      {event.ipPrefix && <span className="block">Network {event.ipPrefix}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
