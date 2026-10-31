import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { PAGE_SIZES } from '../lib/paging';
import { Select, Skeleton } from './controls';
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

/** An empty state that says what to do next, optionally with an icon and an action. */
export function Empty({ title, children, icon: Icon, action }: { title: string; children?: ReactNode; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center p-8 text-center">
      {Icon && (
        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-chip text-muted" aria-hidden="true">
          <Icon size={20} />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
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

/** Placeholder lines while a card's data loads (skeletons instead of spinners, E2). */
export function LoadingBlock({ lines = 3, className = 'p-4' }: { lines?: number; className?: string }) {
  return (
    <div role="status" className={`space-y-3 ${className}`}>
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={`h-4 ${['w-3/4', 'w-1/2', 'w-2/3', 'w-5/12'][index % 4]}`} />
      ))}
    </div>
  );
}

/** Loading, error and data states for one query, in one place. */
export function QueryState<T>({
  query,
  children,
  loading,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode;
  /** What shows while loading (default: skeleton lines). */
  loading?: ReactNode;
}) {
  if (query.isPending) return <>{loading ?? <LoadingBlock />}</>;
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
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-switch-off transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}

/** ✓ grey = sent, not opened; ✓✓ green = opened or clicked (same symbols as in Gmail). */
/** Green ✓✓ opened, grey ✓✓ delivered (no open yet), grey ✓ sent. */
export function OpenMark({ opened, delivered = false, unreliable = false }: { opened: boolean; delivered?: boolean; unreliable?: boolean }) {
  const title = opened ? 'Opened' : delivered ? 'Delivered' : unreliable ? 'Not opened yet (open status may be unreliable)' : 'Sent';
  const double = opened || delivered;
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" role="img" aria-label={title} className={opened ? 'text-good' : 'text-muted'}>
      <title>{title}</title>
      <path
        d={double ? 'M1 8.6l3 3L10.6 5M7 11.6L13.6 5' : 'M3 8.6l3 3L13 4.6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { PAGE_SIZES, paginate } from '../lib/paging';

/**
 * "1–25 of 140" with first, previous, next and last, plus an optional page-size choice (25 / 50 / 100).
 * Hidden for a single short page. `compact` is the small pager for the fixed top bar (range, previous, next).
 */
export function Pagination({
  page,
  size,
  total,
  onPage,
  onSize,
  position = 'bottom',
  compact = false,
  label = 'Pages',
}: {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
  onSize?: (size: number) => void;
  position?: 'top' | 'bottom';
  compact?: boolean;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const multiplePages = total > size;
  if (total <= PAGE_SIZES[0] && size === PAGE_SIZES[0]) return null;
  const first = total === 0 ? 0 : Math.min(total, page * size + 1);
  const last = Math.min(total, (page + 1) * size);
  const range = (
    <span className="whitespace-nowrap text-muted tabular-nums">
      {first}–{last} of {total}
    </span>
  );
  const button = (name: string, target: number, disabled: boolean, Icon: LucideIcon) => (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface"
      aria-label={name}
      title={name}
      disabled={disabled}
      onClick={() => onPage(target)}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
  if (compact) {
    if (!multiplePages) return null;
    return (
      <nav className="flex items-center gap-1.5 text-sm" aria-label={label}>
        {range}
        {button('Previous page', page - 1, page === 0, ChevronLeft)}
        {button('Next page', page + 1, page + 1 >= pages, ChevronRight)}
      </nav>
    );
  }
  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-2 border-line px-4 py-3 text-sm ${position === 'top' ? 'border-b' : 'border-t'}`}
      aria-label={label}
    >
      <span aria-live="polite">{range}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        {onSize && (
          <span className="mr-1 flex items-center gap-2 text-muted">
            <span aria-hidden="true">Per page</span>
            <Select label="Per page" value={size} options={PAGE_SIZES.map((option) => ({ value: option, label: String(option) }))} onChange={onSize} className="w-20" />
          </span>
        )}
        {button('First page', 0, page === 0, ChevronsLeft)}
        {button('Previous page', page - 1, page === 0, ChevronLeft)}
        {button('Next page', page + 1, page + 1 >= pages, ChevronRight)}
        {button('Last page', pages - 1, page + 1 >= pages, ChevronsRight)}
      </span>
    </nav>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const BUTTON_VARIANTS: Record<ButtonVariant, string> = { primary: 'btn-primary', secondary: 'btn-quiet', ghost: 'btn-ghost', danger: 'btn-danger' };

/** Primary, secondary, ghost or danger; `loading` shows a spinner and blocks repeat clicks. */
export function Button({
  variant = 'secondary',
  loading = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={`btn ${BUTTON_VARIANTS[variant]} ${className}`}>
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-chip text-fg',
  good: 'bg-good/10 text-good',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-bad/10 text-bad',
  accent: 'bg-accent-soft text-accent',
};

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`badge ${BADGE_TONES[tone]} ${className}`}>{children}</span>;
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}
