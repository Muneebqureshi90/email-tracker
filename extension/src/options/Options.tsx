import { useEffect, useState, type FormEvent } from 'react';
import type { Status } from '../core/messages';
import { ask } from '../gmail/bridge';
import { connectionLabel, connectionTone } from '../ui/status-text';

const SEND_MODES = { PRESYNC: 'Insert the pixel at send (default)', CANCEL_RESEND: 'Cancel, add the pixel, send again (fallback)' };

export function Options() {
  const [status, setStatus] = useState<Status | null>(null);
  const [backendUrl, setBackendUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void ask({ type: 'mp:status' }).then((current) => {
      setStatus(current);
      if (current) setBackendUrl(current.backendUrl);
    });
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(await ask({ type: 'mp:saveConnection', backendUrl, apiToken }, 8000));
    setApiToken('');
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    setStatus(await ask({ type: 'mp:testConnection' }, 8000));
    setBusy(false);
  };

  if (!status) return <p className="muted">Loading…</p>;
  const config = status.config;

  return (
    <main className="options">
      <h1>MailPulse settings</h1>
      <p className="muted">
        The extension talks only to your own MailPulse backend on this PC. Create an API token in the
        dashboard under <strong>Extension tokens</strong> and paste it here.
      </p>

      <form onSubmit={(event) => void save(event)}>
        <label>
          Backend URL
          <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} required />
        </label>
        <label>
          API token {status.hasToken && <span className="muted">(saved; paste a new one to replace it)</span>}
          <input
            type="password"
            autoComplete="off"
            value={apiToken}
            placeholder="mp_…"
            onChange={(event) => setApiToken(event.target.value)}
            required
          />
        </label>
        <div className="row">
          <button type="submit" disabled={busy}>
            Save and connect
          </button>
          <button type="button" className="secondary" disabled={busy || !status.hasToken} onClick={() => void test()}>
            Test connection
          </button>
        </div>
      </form>

      <section>
        <h2>
          Connection <span className={`badge ${connectionTone(status)}`}>{connectionLabel(status)}</span>
        </h2>
        {status.message && <p className={status.connection === 'ok' ? 'muted' : 'error'}>{status.message}</p>}
        {status.checkedAt && <p className="muted">Last checked {new Date(status.checkedAt).toLocaleString()}</p>}
        {status.queued > 0 && <p className="muted">{status.queued} send update(s) waiting to be delivered.</p>}
        {!status.appIdSet && (
          <p className="error">
            No InboxSDK App ID was set when this extension was built, so Gmail shows a registration bar. See docs\SETUP.md.
          </p>
        )}
        <p className="muted">
          This extension's origin (for <code>MAILPULSE_EXTENSION_ORIGINS</code> in infra\.env): <code>{status.extensionOrigin}</code>
        </p>
      </section>

      {config && (
        <section>
          <h2>Tracking settings from your backend</h2>
          <p className="muted">Change these in the dashboard under Settings.</p>
          <dl>
            <dt>Public tracking address</dt>
            <dd>{config.publicBaseUrl}</dd>
            <dt>Track new emails by default</dt>
            <dd>{config.trackingDefault ? 'Yes' : 'No'}</dd>
            <dt>Send mode</dt>
            <dd>{SEND_MODES[config.sendMode]}</dd>
            <dt>Block my own views in Chrome (DNR rules)</dt>
            <dd>{config.dnrBlocking ? 'On' : 'Off'}</dd>
            <dt>Track confidential-mode emails</dt>
            <dd>{config.trackConfidential ? 'Yes' : 'No'}</dd>
            <dt>Self-view hold</dt>
            <dd>{config.selfViewWindowSeconds} s</dd>
          </dl>
        </section>
      )}
    </main>
  );
}
