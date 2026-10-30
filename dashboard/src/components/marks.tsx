import { RotateCcw } from 'lucide-react';
import type { EmailSummary } from '../api/types';

export type MarkState = 'none' | 'sent' | 'unreliable' | 'opened' | 'clicked';

type MarkInput = Pick<EmailSummary, 'status' | 'openCount' | 'clickCount' | 'openStatusUnreliable'>;

/**
 * The display rule shared with the extension (contract "Marks"): Sent grey ✓, Opened green ✓✓,
 * Opened N× green ✓✓ + count, Clicked ✓✓ + link dot, Unreliable grey ✓ + "?", Not tracked no mark.
 */
export function markOf(email: MarkInput, tracked = true): { state: MarkState; label: string; count: number } {
  if (!tracked || email.status === 'DRAFT' || email.status === 'CANCELLED') return { state: 'none', label: 'Not tracked', count: 0 };
  const opens = email.openCount;
  const times = opens >= 2 ? `Opened ${opens} times` : 'Opened';
  if (email.clickCount > 0) return { state: 'clicked', label: `${times}, link clicked`, count: opens };
  if (opens > 0) return { state: 'opened', label: times, count: opens };
  if (email.openStatusUnreliable) return { state: 'unreliable', label: 'Not opened yet (open status may be unreliable)', count: 0 };
  return { state: 'sent', label: 'Sent, not opened yet', count: 0 };
}

export function StatusMark({ email, tracked = true, showLabel = false }: { email: MarkInput; tracked?: boolean; showLabel?: boolean }) {
  const mark = markOf(email, tracked);
  if (mark.state === 'none') return showLabel ? <span className="text-muted">Not tracked</span> : null;
  const double = mark.state === 'opened' || mark.state === 'clicked';
  return (
    <span role="img" aria-label={mark.label} title={mark.label} className={`inline-flex items-center gap-1 whitespace-nowrap ${double ? 'text-good' : 'text-muted'}`}>
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
        <path
          d={double ? 'M1 8.6l3 3L10.6 5M7 11.6L13.6 5' : 'M3 8.6l3 3L13 4.6'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {mark.count >= 2 && <span className="text-xs font-semibold tabular-nums">{mark.count}</span>}
      {mark.state === 'clicked' && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      {mark.state === 'unreliable' && <span className="text-xs font-semibold">?</span>}
      {showLabel && <span className="ml-1 text-sm font-medium text-fg">{mark.count >= 2 ? `Opened ${mark.count}×` : mark.state === 'clicked' ? 'Clicked' : mark.state === 'opened' ? 'Opened' : mark.state === 'unreliable' ? 'Unreliable' : 'Sent'}</span>}
    </span>
  );
}

export function OpenedAgainChip() {
  return (
    <span className="chip bg-accent-soft text-accent">
      <RotateCcw size={12} aria-hidden="true" />
      Opened again
    </span>
  );
}

const TONES = [
  'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100',
  'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
  'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
  'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100',
  'bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100',
  'bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100',
];

/** "JD" for "Jane Doe", "JA" for "jane@example.com". */
export function initialsOf(name: string | null | undefined, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
  const base = words[0] ?? email.split('@')[0] ?? email;
  return base.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';
}

export function Avatar({ name, email, size = 32 }: { name: string | null | undefined; email: string; size?: number }) {
  let hash = 0;
  for (const char of email.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold ${TONES[hash % TONES.length]}`}
      style={{ width: size, height: size }}
    >
      {initialsOf(name, email)}
    </span>
  );
}

/** A small horizontal bar for a 0..1 rate, with the percentage as text. */
export function RateBar({ rate }: { rate: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, rate)) * 100);
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-chip" aria-hidden="true">
        <span className="block h-full rounded-full bg-good" style={{ width: `${percent}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums">{percent}%</span>
    </span>
  );
}
