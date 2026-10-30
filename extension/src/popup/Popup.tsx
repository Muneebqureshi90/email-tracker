import { useEffect, useState, type ReactNode } from 'react';
import type { ActivityItem } from '../core/api-types';
import type { Status } from '../core/messages';
import { ordinal, relativeTime } from '../core/time';
import { ask } from '../gmail/bridge';
import { useLiveStatus, useNow } from '../ui/live';
import { checkedText, KIND_LABELS, KindIcon, ProblemCard, StatusPill, Switch } from '../ui/parts';
import { problemsOf } from '../ui/problems';

function titleOf(item: ActivityItem): string {
  if (item.kind.startsWith('DOC_')) return item.documentName || 'Document';
  return item.subject || '(no subject)';
}

function detailOf(item: ActivityItem): string {
  const who = item.recipients || item.linkLabel || 'Recipient unknown';
  if (item.kind === 'OPEN' && item.openNumber) return `${who} · ${ordinal(item.openNumber)} open`;
  if (item.kind === 'ALERT' && item.alertText) return item.alertText;
  return who;
}

function pathOf(item: ActivityItem): string {
  if (item.emailId) return `/emails/${item.emailId}`;
  if (item.documentId) return `/documents/${item.documentId}`;
  return '/activity';
}

function shortTime(iso: string | null): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  return Number.isNaN(at) ? '' : new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

type Tone = 'good' | 'warn' | 'bad' | 'idle';

/** One line of the status card: a coloured dot, what it is, and its state in plain words. */
function StatusLine({ tone, name, help, value, action }: { tone: Tone; name: string; help: string; value: string; action?: ReactNode }) {
  return (
    <li className="status-line">
      <span className={`state-dot ${tone}`} aria-hidden="true" />
      <span className="status-name">
        {name}
        <span className="hint">{help}</span>
      </span>
      <span className="status-value">
        {value}
        {action}
      </span>
    </li>
  );
}

function publicLine(status: Status, checking: boolean): { tone: Tone; value: string } {
  if (checking) return { tone: 'idle', value: 'Checking…' };
  if (status.publicCheck === 'up') return { tone: 'good', value: `Reachable · ${shortTime(status.publicCheckedAt)}` };
  if (status.publicCheck === 'down') return { tone: 'bad', value: 'Not reachable' };
  return { tone: 'idle', value: 'Not checked yet' };
}

export function Popup() {
  const { status, setStatus, failed } = useLiveStatus();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const connected = status?.connection === 'ok';

  useEffect(() => {
    if (connected) void ask({ type: 'mp:activity', limit: 6 }).then(setItems);
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
  const check = async () => {
    setBusy(true);
    const next = await ask({ type: 'mp:testConnection' }, 12_000);
    if (next) setStatus(next);
    setBusy(false);
  };
  const open = (path: string) => void chrome.tabs.create({ url: `${status.backendUrl}${path}` });
  const pub = publicLine(status, busy);
  const healthy = problems.length === 0;
  const newestFirst = [...(items ?? [])].reverse();

  return (
    <main className="popup">
      <header className="top">
        <img src="icons/icon32.png" alt="" width={28} height={28} />
        <div className="brand">
          <h1>MailPulse</h1>
          <span className="hint">Email tracking on this PC</span>
        </div>
        <StatusPill status={status} />
      </header>

      {healthy && (
        <section className="hero good">
          <span className="hero-icon" aria-hidden="true">
            <KindIcon kind="OPEN" />
          </span>
          <span>
            <strong>Tracking is working</strong>
            <span className="hint">New opens show up here, in Gmail and as notifications within about a minute.</span>
          </span>
        </section>
      )}
      {problems.map((problem) => (
        <ProblemCard key={problem.id} problem={problem} busy={busy} onAction={(action) => (action === 'settings' ? void chrome.runtime.openOptionsPage() : void check())} />
      ))}

      <section className="card">
        <ul className="status-list">
          <StatusLine
            tone={status.connection === 'ok' ? 'good' : 'bad'}
            name="MailPulse on this PC"
            help="The app that records opens"
            value={status.connection === 'ok' ? `Connected · ${checkedText(status.checkedAt, now).replace(/^.*\((.*)\)$/, '$1')}` : 'Not connected'}
          />
          <StatusLine
            tone={pub.tone}
            name="Public address"
            help="How recipients' mail apps reach this PC"
            value={pub.value}
            action={
              <button type="button" className="link-button" disabled={busy} onClick={() => void check()}>
                Check now
              </button>
            }
          />
          <StatusLine
            tone={status.paused ? 'warn' : 'good'}
            name="Gmail"
            help="Emails you send from Gmail"
            value={status.paused ? 'Paused' : 'Tracking new emails'}
          />
        </ul>
      </section>

      {status.hasToken && (
        <section className="card toggles" aria-label="Quick settings">
          <Switch
            checked={!status.paused}
            label="Track emails I send"
            hint={status.paused ? 'Off: new emails are sent without tracking' : 'On: new Gmail emails get the open pixel'}
            onChange={(on) => void ask({ type: 'mp:setPaused', paused: !on }).then((next) => next && setStatus(next))}
          />
          <Switch
            checked={status.notificationsEnabled}
            label="Desktop notifications"
            hint={status.notificationsEnabled ? 'On: a pop-up for each open, click and document view' : 'Off: no pop-ups; activity still shows here'}
            onChange={(on) => void ask({ type: 'mp:setNotifications', enabled: on }).then((next) => next && setStatus(next))}
          />
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Recent activity</h2>
          <button type="button" className="link-button" onClick={() => open('/activity')}>
            See all
          </button>
        </div>
        {items === null && <p className="muted">{connected ? 'Loading…' : 'Connect MailPulse to see opens and clicks.'}</p>}
        {items !== null && newestFirst.length === 0 && <p className="muted">No opens or clicks yet. Send a tracked email from Gmail.</p>}
        {newestFirst.length > 0 && (
          <ul className="activity">
            {newestFirst.map((item) => (
              <li key={item.id} className={`kind-${item.kind.toLowerCase().replace('_', '-')}`}>
                <button type="button" className="activity-row" onClick={() => open(pathOf(item))} title="Open in MailPulse">
                  <span className="icon">
                    <KindIcon kind={item.kind} />
                  </span>
                  <span className="what">
                    <span className="subject">
                      <span className="verb">{KIND_LABELS[item.kind]}</span> · {titleOf(item)}
                    </span>
                    <span className="meta">{detailOf(item)}</span>
                  </span>
                  <span className="when" title={new Date(item.occurredAt).toLocaleString()}>
                    {relativeTime(item.occurredAt, now)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer>
        <button type="button" onClick={() => open('')}>
          Open dashboard
        </button>
        <button type="button" className="secondary" onClick={() => void chrome.runtime.openOptionsPage()}>
          Settings
        </button>
      </footer>
    </main>
  );
}
