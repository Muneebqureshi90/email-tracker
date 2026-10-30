import { useState, type FormEvent } from 'react';
import type { ClientConfig } from '../core/api-types';
import type { Status } from '../core/messages';
import { ask } from '../gmail/bridge';
import { useLiveStatus, useNow } from '../ui/live';
import { checkedText, ProblemCard, StatusPill } from '../ui/parts';
import { problemsOf } from '../ui/problems';

const SEND_MODES = { PRESYNC: 'Insert the pixel at send (default)', CANCEL_RESEND: 'Cancel, add the pixel, send again (fallback)' };
const NOTIFY_ON = { FIRST: 'First open only', EVERY: 'Every open', EVERY_AFTER_GAP: 'Every open after a 1-hour gap' };

type Result = { tone: 'good' | 'bad'; text: string } | null;

function resultOf(status: Status | null): Result {
  if (!status) return { tone: 'bad', text: 'The extension did not answer. Reload it on chrome://extensions and try again.' };
  if (status.connection !== 'ok') return { tone: 'bad', text: status.message ?? 'MailPulse could not be reached.' };
  if (status.publicCheck === 'down') return { tone: 'bad', text: 'Connected to MailPulse, but the public address does not answer. See "How to fix" above.' };
  return { tone: 'good', text: 'Connected. MailPulse and the public address both answer.' };
}

function settingsRows(config: ClientConfig): [string, string][] {
  const rows: [string, string][] = [
    ['Public tracking address', config.publicBaseUrl],
    ['Track new emails', config.trackingDefault ? 'Yes, by default' : 'No, only when switched on'],
    ['Track links', config.linkTrackingDefault ? 'Yes, by default' : 'No, only when switched on'],
    ['Follow-up reminder', `After ${config.followUpHours} hours without an open`],
  ];
  if (config.notifyOn) rows.push(['Notify me on', NOTIFY_ON[config.notifyOn]]);
  if (config.quietHoursEnabled !== undefined) {
    rows.push(['Quiet hours', config.quietHoursEnabled ? `${config.quietHoursStart ?? ''} to ${config.quietHoursEnd ?? ''}` : 'Off']);
  }
  if (config.timeZone) rows.push(['Time zone', config.timeZone]);
  rows.push(
    ['Send mode', SEND_MODES[config.sendMode]],
    ['Block my own views in Chrome', config.dnrBlocking ? 'On' : 'Off'],
    ['Track confidential-mode emails', config.trackConfidential ? 'Yes' : 'No'],
    ['Self-view hold', `${config.selfViewWindowSeconds} s`],
  );
  return rows;
}

export function Options() {
  const { status, setStatus, failed } = useLiveStatus();
  const now = useNow(5000);
  /** Null until the owner edits it: the field then shows the saved URL. */
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [copied, setCopied] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('save');
    setResult(null);
    const next = await ask({ type: 'mp:saveConnection', backendUrl: backendUrl ?? status?.backendUrl ?? '', apiToken }, 10_000);
    if (next) setStatus(next);
    setResult(resultOf(next));
    if (next?.connection === 'ok') setApiToken('');
    setBusy(null);
  };
  const test = async () => {
    setBusy('test');
    setResult(null);
    const next = await ask({ type: 'mp:testConnection' }, 10_000);
    if (next) setStatus(next);
    setResult(resultOf(next));
    setBusy(null);
  };

  if (!status) {
    return (
      <main className="options" aria-busy={!failed}>
        {failed ? <p className="error">The extension's background worker did not answer. Reload MailPulse on chrome://extensions.</p> : <div className="skeleton tall" />}
      </main>
    );
  }

  const problems = problemsOf(status).filter((problem) => problem.id !== 'paused');
  const config = status.config;

  return (
    <main className="options">
      <header className="top">
        <img src="icons/icon48.png" alt="" width={32} height={32} />
        <div>
          <h1>MailPulse extension</h1>
          <p className="muted">Talks only to your own MailPulse on this PC.</p>
        </div>
        <StatusPill status={status} />
      </header>

      {problems.map((problem) => (
        <ProblemCard key={problem.id} problem={problem} busy={busy === 'test'} onAction={(action) => (action === 'retry' ? void test() : document.getElementById('token')?.focus())} />
      ))}

      <section className="card">
        <h2>Connection</h2>
        <form onSubmit={(event) => void save(event)}>
          <label htmlFor="backend">Backend URL</label>
          <input id="backend" value={backendUrl ?? status.backendUrl} onChange={(event) => setBackendUrl(event.target.value)} placeholder="http://127.0.0.1:8080" required />
          <p className="hint">The dashboard address on this PC, for example http://127.0.0.1:8090.</p>

          <label htmlFor="token">API token</label>
          <div className="with-button">
            <input
              id="token"
              type={showToken ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={apiToken}
              placeholder={status.hasToken ? 'Saved. Paste a new token to replace it.' : 'mp_…'}
              onChange={(event) => setApiToken(event.target.value)}
              required
            />
            <button type="button" className="secondary" aria-pressed={showToken} onClick={() => setShowToken((value) => !value)}>
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="hint">Create one in the dashboard under Extension tokens. It is stored only in this browser.</p>

          <div className="row">
            <button type="submit" disabled={busy !== null}>
              {busy === 'save' ? 'Connecting…' : 'Save and connect'}
            </button>
            <button type="button" className="secondary" disabled={busy !== null || !status.hasToken} onClick={() => void test()}>
              {busy === 'test' ? 'Testing…' : 'Test connection'}
            </button>
          </div>
          {result && (
            <p className={`result ${result.tone}`} role="status">
              {result.text}
            </p>
          )}
        </form>
        <dl className="facts">
          <dt>Last checked</dt>
          <dd data-testid="checked">{checkedText(status.checkedAt, now)}</dd>
          <dt>Public address</dt>
          <dd>
            {status.publicCheck === 'up' ? 'Reachable' : status.publicCheck === 'down' ? 'Not reachable' : 'Not checked yet'}
            {status.publicCheckedAt ? ` · ${checkedText(status.publicCheckedAt, now)}` : ''}
          </dd>
          {status.queued > 0 && (
            <>
              <dt>Waiting to send</dt>
              <dd>{status.queued} send update(s), delivered when MailPulse is back</dd>
            </>
          )}
        </dl>
      </section>

      {config && (
        <section className="card">
          <div className="card-head">
            <h2>Settings from your MailPulse</h2>
            <button type="button" className="secondary small" onClick={() => void chrome.tabs.create({ url: `${status.backendUrl}/settings` })}>
              Change in dashboard
            </button>
          </div>
          <dl className="facts">
            {settingsRows(config).map(([name, value]) => (
              <div key={name} className="fact">
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="card">
        <h2>This extension</h2>
        <dl className="facts">
          <dt>InboxSDK App ID</dt>
          <dd>{status.appIdSet ? 'Set' : 'Not set (see How to fix above)'}</dd>
          <dt>Extension origin</dt>
          <dd>
            <code>{status.extensionOrigin}</code>{' '}
            <button
              type="button"
              className="secondary small"
              onClick={() =>
                void navigator.clipboard.writeText(status.extensionOrigin).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </dd>
        </dl>
        <p className="hint">The origin goes into MAILPULSE_EXTENSION_ORIGINS in infra\.env.</p>
      </section>
    </main>
  );
}
