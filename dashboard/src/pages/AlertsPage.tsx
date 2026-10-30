import { useSearchParams } from 'react-router';
import { useAlerts, useUpdateAlert } from '../api/queries';
import type { AlertType, AlertView } from '../api/types';
import { Segmented } from '../components/controls';
import { Card, Empty, ErrorBox, PageHeader, Pagination, QueryState, TextLink } from '../components/ui';
import { formatDateTime, relativeTime } from '../lib/format';
import { useNow } from '../lib/now';

export const ALERT_LABELS: Record<AlertType, { label: string; tone: string }> = {
  FOLLOW_UP: { label: 'Follow up', tone: 'text-warn' },
  OPEN_SPIKE: { label: 'Hot', tone: 'text-good' },
  REVIVAL: { label: 'Opened again', tone: 'text-accent' },
  DOC_VIEWS: { label: 'Document viewed often', tone: 'text-good' },
};

export function AlertsPage() {
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') === 'all' ? 'all' : 'active';
  const page = Number(params.get('page') ?? '0') || 0;
  const alerts = useAlerts(status, page);
  const update = useUpdateAlert();

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Follow-up reminders, open spikes and revivals. Rules and times are under Settings → Alerts."
        actions={
          <Segmented
            label="Show"
            value={status}
            options={[
              { value: 'active', label: 'Open' },
              { value: 'all', label: 'All' },
            ]}
            onChange={(option) => setParams(option === 'all' ? { status: 'all' } : {})}
          />
        }
      />
      {update.isError && (
        <div className="mb-4">
          <ErrorBox error={update.error} />
        </div>
      )}
      <Card>
        <QueryState query={alerts}>
          {(result) =>
            result.total === 0 ? (
              <Empty title={status === 'active' ? 'No open alerts' : 'No alerts yet'}>
                Alerts appear when an email is not opened in time, is opened many times, or is opened again after a long time.
              </Empty>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {result.items.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} now={now} busy={update.isPending} onChange={(change) => update.mutate({ id: alert.id, ...change })} />
                  ))}
                </ul>
                <Pagination page={result.page} size={result.size} total={result.total} onPage={(next) => setParams({ ...(status === 'all' ? { status } : {}), page: String(next) })} />
              </>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}

function AlertRow({
  alert,
  now,
  busy,
  onChange,
}: {
  alert: AlertView;
  now: number;
  busy: boolean;
  onChange: (change: { status: AlertView['status']; snoozeHours?: number }) => void;
}) {
  const kind = ALERT_LABELS[alert.type];
  const closed = alert.status === 'DISMISSED' || alert.status === 'SNOOZED';
  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm ${alert.status === 'NEW' ? '' : 'opacity-80'}`}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className={`font-semibold ${kind.tone}`}>{kind.label}</span>
          {alert.status === 'NEW' && <span className="chip">New</span>}
          {alert.status === 'SNOOZED' && alert.snoozedUntil && <span className="chip">Snoozed until {formatDateTime(alert.snoozedUntil)}</span>}
          {alert.status === 'DISMISSED' && <span className="chip">Dismissed</span>}
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
