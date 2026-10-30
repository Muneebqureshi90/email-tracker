import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { Link } from 'react-router';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  title: string;
  description?: string | undefined;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  /** A dashboard page to open from the toast. */
  to?: string | undefined;
  /** Milliseconds; errors stay a little longer. */
  duration?: number;
}

interface ToastEntry extends ToastInput {
  id: number;
}

/*
 * A tiny toast store (D-097; no library: the strict CSP blocks the style tags most toast libraries
 * inject). Toasts are plain text rendered by React, never HTML.
 */
let entries: ToastEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const MAX = 4;

function emit() {
  for (const listener of listeners) listener();
}

export function toast(input: ToastInput): number {
  const id = nextId++;
  entries = [...entries, { ...input, id }].slice(-MAX);
  emit();
  return id;
}

export function dismissToast(id: number): void {
  entries = entries.filter((entry) => entry.id !== id);
  emit();
}

export function clearToasts(): void {
  entries = [];
  emit();
}

/** A failed action: the message from the API problem details when there is one. */
export function toastError(title: string, error: unknown): void {
  toast({ title, description: error instanceof Error ? error.message : undefined, tone: 'error' });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const ICONS = { success: CheckCircle2, error: TriangleAlert, info: Info };
const TONE = { success: 'text-good', error: 'text-bad', info: 'text-accent' };

function ToastCard({ entry }: { entry: ToastEntry }) {
  const tone = entry.tone ?? 'info';
  const Icon = ICONS[tone];
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(entry.id), entry.duration ?? (tone === 'error' ? 8000 : 5000));
    return () => clearTimeout(timer);
  }, [entry.id, entry.duration, tone]);
  return (
    <div
      data-testid="toast"
      className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-line bg-surface p-3 text-sm shadow-(--shadow-lg) animate-[mp-pop-in_150ms_ease-out]"
    >
      <Icon size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${TONE[tone]}`} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words">
          {entry.to ? (
            <Link to={entry.to} className="hover:underline" onClick={() => dismissToast(entry.id)}>
              {entry.title}
            </Link>
          ) : (
            entry.title
          )}
        </p>
        {entry.description && <p className="mt-0.5 break-words text-muted">{entry.description}</p>}
        {entry.action && (
          <button
            type="button"
            className="mt-1.5 font-semibold text-accent hover:underline"
            onClick={() => {
              entry.action?.onClick();
              dismissToast(entry.id);
            }}
          >
            {entry.action.label}
          </button>
        )}
      </div>
      <button type="button" className="-m-1 rounded p-1 text-muted hover:text-fg" aria-label="Dismiss" onClick={() => dismissToast(entry.id)}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Bottom right on wide screens, full width at the bottom on phones; read out politely. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => entries);
  return (
    <section aria-label="Messages" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] sm:left-auto sm:w-96">
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {list.map((entry) => (
          <ToastCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
