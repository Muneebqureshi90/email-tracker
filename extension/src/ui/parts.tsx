import type { ActivityKind } from '../core/api-types';
import type { Status } from '../core/messages';
import type { Problem } from './problems';
import { connectionLabel, connectionTone } from './status-text';

/** Small inline icons (no icon font, nothing loaded from outside the extension). */
export function KindIcon({ kind }: { kind: ActivityKind }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (kind) {
    case 'OPEN':
      return (
        <svg {...common}>
          <path d="M1 8.6l3 3L10.6 5M7 11.6L13.6 5" />
        </svg>
      );
    case 'CLICK':
      return (
        <svg {...common}>
          <path d="M6.5 9.5l3-3M5 7.5L3.8 8.7a2.3 2.3 0 003.3 3.3l1.2-1.2M11 8.5l1.2-1.2a2.3 2.3 0 00-3.3-3.3L7.7 5.2" />
        </svg>
      );
    case 'ALERT':
      return (
        <svg {...common}>
          <path d="M8 2.5a3.5 3.5 0 00-3.5 3.5v2.5L3 10.5h10l-1.5-2V6A3.5 3.5 0 008 2.5zM6.5 12.5a1.5 1.5 0 003 0" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M4 1.8h5.2L12 4.6v9.6H4zM9 1.8v3h3M6 8h4M6 10.5h4" />
        </svg>
      );
  }
}

export const KIND_LABELS: Record<ActivityKind, string> = {
  OPEN: 'Opened',
  CLICK: 'Clicked',
  ALERT: 'Alert',
  DOC_VIEW: 'Document opened',
  DOC_READ: 'Document read',
  DOC_DOWNLOAD: 'Downloaded',
};

export function StatusPill({ status }: { status: Status }) {
  const tone = status.connection === 'ok' && status.publicCheck === 'down' ? 'bad' : connectionTone(status);
  const label = status.connection === 'ok' && status.publicCheck === 'down' ? 'Public address down' : connectionLabel(status);
  return (
    <span className={`pill ${tone}`}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function ProblemCard({ problem, onAction, busy }: { problem: Problem; onAction?: (action: 'settings' | 'retry') => void; busy?: boolean }) {
  return (
    <section className={`problem ${problem.tone}`} aria-live="polite">
      <h2>{problem.title}</h2>
      <p>{problem.detail}</p>
      <details>
        <summary>How to fix</summary>
        <ol>
          {problem.fix.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
      {problem.action && onAction && (
        <button type="button" className="secondary small" disabled={busy} onClick={() => onAction(problem.action!)}>
          {problem.action === 'settings' ? 'Open settings' : busy ? 'Checking…' : 'Check again'}
        </button>
      )}
    </section>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

/** "16:20:05 (2 minutes ago)". */
export function checkedText(iso: string | null, now: number): string {
  if (!iso) return 'Not checked yet';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'Not checked yet';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  const ago = seconds < 10 ? 'just now' : seconds < 60 ? `${seconds} s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)} min ago` : `${Math.floor(seconds / 3600)} h ago`;
  return `${new Date(at).toLocaleTimeString()} (${ago})`;
}
