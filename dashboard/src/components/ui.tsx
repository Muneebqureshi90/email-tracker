import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { useTopBar } from './shell';

/**
 * The page title and actions go into the fixed top bar (portals into its slots); the description
 * stays at the top of the scrolling content. Outside the shell everything renders in place.
 */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  const slots = useTopBar();
  const heading = <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>;
  if (!slots) {
    return (
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {heading}
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
    );
  }
  return (
    <>
      {slots.title && createPortal(heading, slots.title)}
      {slots.toolbar && actions && createPortal(<div className="flex flex-wrap items-center gap-2">{actions}</div>, slots.toolbar)}
      {description && <p className="mb-6 text-sm text-muted">{description}</p>}
    </>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-8 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Something went wrong.';
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bad/40 bg-bad/10 p-4 text-sm">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Loading, error and data states for one query, in one place. */
export function QueryState<T>({
  query,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Spinner />;
  if (query.isError || query.data === undefined) {
    return (
      <div className="p-4">
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return <>{children(query.data)}</>;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-chip transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}

/** ✓ grey = sent, not opened; ✓✓ green = opened or clicked (same symbols as in Gmail). */
export function OpenMark({ opened, unreliable = false }: { opened: boolean; unreliable?: boolean }) {
  const title = opened ? 'Opened' : unreliable ? 'Not opened yet (open status may be unreliable)' : 'Sent, not opened yet';
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" role="img" aria-label={title} className={opened ? 'text-good' : 'text-muted'}>
      <title>{title}</title>
      <path
        d={opened ? 'M1 8.6l3 3L10.6 5M7 11.6L13.6 5' : 'M3 8.6l3 3L13 4.6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const PAGE_SIZES = [25, 50, 100] as const;

/** Client-side paging for lists the API returns whole (documents, tokens). */
export function paginate<T>(items: T[], page: number, size: number): T[] {
  return items.slice(page * size, page * size + size);
}

/** "1–25 of 140" with first, previous, next and last, plus an optional page-size choice. */
export function Pagination({
  page,
  size,
  total,
  onPage,
  onSize,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
  onSize?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= PAGE_SIZES[0] && !(onSize && size !== PAGE_SIZES[0])) return null;
  const first = total === 0 ? 0 : page * size + 1;
  const last = Math.min(total, (page + 1) * size);
  const button = (label: string, target: number, disabled: boolean, text: string) => (
    <button type="button" className="btn btn-quiet px-2.5" aria-label={label} title={label} disabled={disabled} onClick={() => onPage(target)}>
      <span aria-hidden="true">{text}</span>
    </button>
  );
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm" aria-label="Pages">
      <span className="text-muted tabular-nums" aria-live="polite">
        {first}–{last} of {total}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {onSize && (
          <label className="flex items-center gap-2 text-muted">
            <span>Per page</span>
            <select className="input w-auto py-1.5" value={size} onChange={(event) => onSize(Number(event.target.value))}>
              {PAGE_SIZES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
        {button('First page', 0, page === 0, '«')}
        {button('Previous page', page - 1, page === 0, '‹')}
        {button('Next page', page + 1, page + 1 >= pages, '›')}
        {button('Last page', pages - 1, page + 1 >= pages, '»')}
      </span>
    </nav>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}
