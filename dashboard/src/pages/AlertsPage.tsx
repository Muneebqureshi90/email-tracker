import { BellOff } from 'lucide-react';
import { useAlerts, useUpdateAlert } from '../api/queries';
import type { AlertView } from '../api/types';
import { Segmented } from '../components/controls';
import { toast, toastError } from '../components/toast';
import { Badge, Card, Empty, ErrorBox, LoadingBlock, PageHeader, Pagination, TextLink } from '../components/ui';
import { formatDateTime, relativeTime } from '../lib/format';
import { ALERT_LABELS } from '../lib/labels';
import { useNow } from '../lib/now';
import { useListParams } from '../lib/paging';

type Change = { status: AlertView['status']; snoozeHours?: number };

const DONE: Record<AlertView['status'], string> = { NEW: 'Alert reopened', SEEN: 'Marked as seen', SNOOZED: 'Snoozed for a day', DISMISSED: 'Alert dismissed' };

export function AlertsPage() {
  const now = useNow();
  const list = useListParams();
  const status = list.get('status') === 'all' ? 'all' : 'active';
  const alerts = useAlerts(status, list.page, true, list.size);
  const update = useUpdateAlert();
  const result = alerts.data;

  const change = (alert: AlertView, next: Change) =>
    update.mutate(
      { id: alert.id, ...next },
      {
        onSuccess: () => toast({ title: DONE[next.status], tone: 'success' }),
        onError: (error) => toastError('The alert was not changed', error),
      },
    );

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Follow-up reminders, open spikes, revivals and often-viewed documents. Rules and times are under Settings → Alerts."
        actions={
          <Segmented
            label="Show"
            value={status}
            options={[
              { value: 'active', label: 'Open' },
              { value: 'all', label: 'All' },
            ]}
            onChange={(option) => list.update({ status: option === 'all' ? 'all' : null })}
          />
        }
      />
      <Card>
        {alerts.isPending ? (
          <LoadingBlock lines={5} />
        ) : alerts.isError || !result ? (
          <div className="p-4">
            <ErrorBox error={alerts.error} onRetry={() => void alerts.refetch()} />
          </div>
        ) : result.total === 0 ? (
          <Empty title={status === 'active' ? 'No open alerts' : 'No alerts yet'} icon={BellOff}>
            Alerts appear when an email is not opened in time, is opened many times, is opened again after a long time, or a
            document is viewed often.
          </Empty>
        ) : (
          <>
            {result.total > result.size && <Pagination page={result.page} size={result.size} total={result.total} onPage={list.setPage} position="top" label="Pages (top)" />}
            <ul className={`divide-y divide-line transition-opacity ${alerts.isPlaceholderData ? 'opacity-60' : ''}`}>
              {result.items.map((alert) => (
                <AlertRow key={alert.id} alert={alert} now={now} busy={update.isPending} onChange={(next) => change(alert, next)} />
              ))}
            </ul>
            <Pagination page={result.page} size={result.size} total={result.total} onPage={list.setPage} onSize={list.setSize} />
          </>
        )}
      </Card>
    </>
  );
}

function AlertRow({ alert, now, busy, onChange }: { alert: AlertView; now: number; busy: boolean; onChange: (change: Change) => void }) {
  const kind = ALERT_LABELS[alert.type];
  const closed = alert.status === 'DISMISSED' || alert.status === 'SNOOZED';
  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm ${alert.status === 'NEW' ? '' : 'opacity-80'}`}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className={`font-semibold ${kind.tone}`}>{kind.label}</span>
          {alert.status === 'NEW' && <Badge tone="accent">New</Badge>}
          {alert.status === 'SNOOZED' && alert.snoozedUntil && <Badge>Snoozed until {formatDateTime(alert.snoozedUntil)}</Badge>}
          {alert.status === 'DISMISSED' && <Badge>Dismissed</Badge>}
        </p>
        <p className="mt-0.5">{alert.text}</p>
        <p className="mt-0.5 truncate text-xs text-muted">
          <TextLink to={`/emails/${alert.emailId}`}>{alert.subject || '(no subject)'}</TextLink> · {alert.recipients || 'Recipient unknown'} ·{' '}
          {relativeTime(alert.createdAt, now)}
        </p>
      </div>
      {!closed && (
        <div className="flex flex-wrap gap-2">
          {alert.status === 'NEW' && (
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onChange({ status: 'SEEN' })}>
              Mark seen
            </button>
          )}
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onChange({ status: 'SNOOZED', snoozeHours: 24 })}>
            Snooze 1 day
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onChange({ status: 'DISMISSED' })}>
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}
