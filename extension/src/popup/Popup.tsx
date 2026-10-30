import { useEffect, useState } from 'react';
import type { ActivityItem } from '../core/api-types';
import { relativeTime } from '../core/time';
import { ask } from '../gmail/bridge';
import { useLiveStatus, useNow } from '../ui/live';
import { checkedText, KIND_LABELS, KindIcon, ProblemCard, StatusPill, Switch } from '../ui/parts';
import { problemsOf } from '../ui/problems';

function titleOf(item: ActivityItem): string {
  if (item.kind.startsWith('DOC_')) return item.documentName || 'Document';
  return item.subject || '(no subject)';
}

function whoOf(item: ActivityItem): string {
  return item.recipients || item.linkLabel || 'Recipient unknown';
}

export function Popup() {
  const { status, setStatus, failed } = useLiveStatus();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const connected = status?.connection === 'ok';

  useEffect(() => {
    if (connected) void ask({ type: 'mp:activity', limit: 8 }).then(setItems);
  }, [connected]);

  if (!status) {
    if (!failed) return <main className="popup" aria-busy="true"><div className="skeleton tall" /><div className="skeleton" /><div className="skeleton" /></main>;
    return (
      <main className="popup">
        <ProblemCard
          problem={{
            id: 'error',
            tone: 'bad',
            title: 'The extension did not answer',
            detail: 'Its background worker is not responding.',
            fix: ['Open chrome://extensions and click the reload icon on MailPulse.', 'Then open this popup again.'],
            action: null,
          }}
        />
      </main>
    );
  }

  const problems = problemsOf(status);
  const retry = async () => {
    setBusy(true);
    const next = await ask({ type: 'mp:testConnection' }, 10_000);
    if (next) setStatus(next);
    setBusy(false);
  };
  const config = status.config;
  const quiet = config?.quietHoursEnabled ? `Quiet hours ${config.quietHoursStart ?? ''}–${config.quietHoursEnd ?? ''}` : 'Opens, clicks and documents';
  const newestFirst = [...(items ?? [])].reverse();

  return (
    <main className="popup">
      <header className="top">
        <img src="icons/icon32.png" alt="" width={24} height={24} />
        <h1>MailPulse</h1>
        <StatusPill status={status} />
      </header>

      {problems.length === 0 ? (
        <section className="card status-card">
          <p className="status-title">Everything works</p>
          <dl className="facts">
            <dt>Last checked</dt>
            <dd>{checkedText(status.checkedAt, now)}</dd>
            <dt>Public address</dt>
            <dd>{status.publicCheck === 'up' ? 'Reachable' : 'Not checked yet'}</dd>
          </dl>
        </section>
      ) : (
        problems.map((problem) => (
          <ProblemCard
            key={problem.id}
            problem={problem}
            busy={busy}
            onAction={(action) => (action === 'settings' ? void chrome.runtime.openOptionsPage() : void retry())}
          />
        ))
      )}

      {status.hasToken && (
        <section className="card toggles" aria-label="Quick settings">
          <Switch
            checked={!status.paused}
            label="Track emails I send"
            hint="New Gmail emails get the open pixel"
            onChange={(on) => void ask({ type: 'mp:setPaused', paused: !on }).then((next) => next && setStatus(next))}
          />
          <Switch
            checked={status.notificationsEnabled}
            label="Desktop notifications"
            hint={quiet}
            onChange={(on) => void ask({ type: 'mp:setNotifications', enabled: on }).then((next) => next && setStatus(next))}
          />
        </section>
      )}

      <section className="card">
        <h2>Recent activity</h2>
        {items === null && <p className="muted">{connected ? 'Loading…' : 'Connect MailPulse to see opens and clicks.'}</p>}
        {items !== null && newestFirst.length === 0 && <p className="muted">No opens or clicks yet. Send a tracked email from Gmail.</p>}
        {newestFirst.length > 0 && (
          <ul className="activity">
            {newestFirst.map((item) => (
              <li key={item.id} className={`kind-${item.kind.toLowerCase().replace('_', '-')}`}>
                <span className="icon">
                  <KindIcon kind={item.kind} />
                </span>
                <span className="what">
                  <span className="subject">
                    {KIND_LABELS[item.kind]} · {titleOf(item)}
                  </span>
                  <span className="meta">
                    {whoOf(item)} · {relativeTime(item.occurredAt, now)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer>
        <button type="button" onClick={() => void chrome.tabs.create({ url: status.backendUrl })}>
          Open dashboard
        </button>
        <button type="button" className="secondary" onClick={() => void chrome.runtime.openOptionsPage()}>
          Settings
        </button>
      </footer>
    </main>
  );
}
