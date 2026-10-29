import { useEffect, useState } from 'react';
import type { ActivityItem } from '../core/api-types';
import type { Status } from '../core/messages';
import { relativeTime } from '../core/time';
import { ask } from '../gmail/bridge';
import { connectionLabel, connectionTone } from '../ui/status-text';

const VERBS: Record<ActivityItem['kind'], string> = { OPEN: 'Opened', CLICK: 'Clicked', ALERT: 'Alert' };

export function Popup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    void (async () => {
      const current = await ask({ type: 'mp:status' });
      setStatus(current);
      if (current?.connection === 'ok') setItems(await ask({ type: 'mp:activity', limit: 8 }));
      setLoadedAt(Date.now());
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="muted">Loading…</p>;
  if (!status) return <p className="error">The MailPulse service worker did not answer. Reload the extension.</p>;

  const setPaused = async (paused: boolean) => setStatus(await ask({ type: 'mp:setPaused', paused }));
  const newestFirst = [...(items ?? [])].reverse();

  return (
    <main className="popup">
      <header>
        <img src="icons/icon32.png" alt="" width={20} height={20} />
        <h1>MailPulse</h1>
        <span className={`badge ${connectionTone(status)}`}>{connectionLabel(status)}</span>
      </header>
      {status.connection !== 'ok' && status.message && <p className="error">{status.message}</p>}
      {status.hasToken && (
        <label className="switch">
          <input type="checkbox" checked={!status.paused} onChange={(event) => void setPaused(!event.target.checked)} />
          Track emails I send from Gmail
        </label>
      )}
      <section>
        <h2>Recent activity</h2>
        {items === null && <p className="muted">Connect MailPulse to see opens and clicks.</p>}
        {items !== null && newestFirst.length === 0 && <p className="muted">No opens or clicks yet.</p>}
        <ul className="activity">
          {newestFirst.map((item) => (
            <li key={item.id}>
              <span className={`kind ${item.kind.toLowerCase()}`}>{VERBS[item.kind]}</span>
              <span className="subject">{item.subject || '(no subject)'}</span>
              <span className="meta">
                {item.recipients} · {relativeTime(item.occurredAt, loadedAt)}
              </span>
            </li>
          ))}
        </ul>
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
