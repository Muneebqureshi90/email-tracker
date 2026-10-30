import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Minus, Plus, Search, X } from 'lucide-react';
import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

/*
 * Custom form controls (bug A7): no native <select>, number spinners or date inputs anywhere, so
 * every control follows the theme. Popups use Radix Popover for positioning, focus return and Esc.
 * The date picker lives in DatePicker.tsx so its calendar library loads only with the pages that use it.
 */

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

/**
 * A select-only combobox (WAI-ARIA APG): a button that opens a listbox. Arrow keys, Home, End,
 * Enter, Space, Escape and type-to-find work as in a native select.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  id,
  disabled,
  className = '',
  describedBy,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  /** Accessible name; or render a visible <label id htmlFor> and pass its id as `labelledBy`. */
  label?: string;
  labelledBy?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  describedBy?: string;
}) {
  const auto = useId();
  const buttonId = id ?? `${auto}-button`;
  const listId = `${auto}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef({ text: '', at: 0 });
  const listRef = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const current = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const option = document.getElementById(`${listId}-${active}`);
    option?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, listId]);

  const show = (next: boolean) => {
    if (next) setActive(selectedIndex);
    setOpen(next);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    setOpen(false);
  };
  const find = (key: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at < 600 ? typed.current.text + key.toLowerCase() : key.toLowerCase(), at: now };
    const index = options.findIndex((option) => option.label.toLowerCase().startsWith(typed.current.text));
    if (index >= 0) setActive(index);
  };
  const onListKey = (event: KeyboardEvent) => {
    const last = options.length - 1;
    if (event.key === 'ArrowDown') setActive((index) => Math.min(last, index + 1));
    else if (event.key === 'ArrowUp') setActive((index) => Math.max(0, index - 1));
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(last);
    else if (event.key === 'Enter' || event.key === ' ') choose(active);
    else if (event.key === 'Tab') setOpen(false);
    else if (event.key.length === 1) find(event.key);
    else return;
    event.preventDefault();
  };

  return (
    <Popover.Root open={open} onOpenChange={show}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={buttonId}
          role="combobox"
          aria-label={label}
          aria-labelledby={labelledBy}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              show(true);
            }
          }}
          className={`select-trigger ${className}`}
        >
          <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? ''}</span>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            listRef.current?.focus();
          }}
          className="popover z-50 max-w-[calc(100vw-1rem)] min-w-(--radix-popover-trigger-width) py-1"
        >
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={label ? undefined : (labelledBy ?? buttonId)}
            aria-label={label}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKey}
            className="max-h-72 overflow-y-auto outline-none"
          >
            {options.map((option, index) => (
              <li
                key={String(option.value)}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-active={index === active}
                onClick={() => choose(index)}
                onMouseEnter={() => setActive(index)}
                className="option"
              >
                <Check size={14} aria-hidden="true" className={option.value === value ? 'shrink-0 text-accent' : 'invisible shrink-0'} />
                <span className="whitespace-nowrap">{option.label}</span>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A whole-number field with − and + buttons and arrow-key steps, instead of the native spinner. */
export function NumberStepper({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  invalid,
  describedBy,
  label,
}: {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  invalid?: boolean;
  describedBy?: string;
  /** Accessible name when no <label htmlFor> points at `id`. */
  label?: string;
}) {
  const valid = Number.isFinite(value);
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const bump = (direction: 1 | -1) => onChange(clamp((valid ? value : min) + direction * step));
  return (
    <span className={`stepper ${invalid ? 'stepper-invalid' : ''}`}>
      <button type="button" className="stepper-btn" aria-label="Decrease" tabIndex={-1} disabled={valid && value <= min} onClick={() => bump(-1)}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <input
        id={id}
        role="spinbutton"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={valid ? value : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        inputMode="numeric"
        autoComplete="off"
        className="stepper-input tabular-nums"
        value={valid ? String(value) : ''}
        onChange={(event) => {
          const text = event.target.value.trim();
          onChange(/^-?\d+$/.test(text) ? Number(text) : Number.NaN);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            bump(event.key === 'ArrowUp' ? 1 : -1);
          }
        }}
      />
      <button type="button" className="stepper-btn" aria-label="Increase" tabIndex={-1} disabled={valid && value >= max} onClick={() => bump(1)}>
        <Plus size={14} aria-hidden="true" />
      </button>
    </span>
  );
}

/** One segmented control style for filters and Day/Week, optionally with counts ("Opened 12"). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number | undefined }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="segmented">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className="segmented-item">
          {option.label}
          {option.count !== undefined && (
            <>
              {' '}
              <span className="segmented-count">{option.count}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

/** Radio buttons drawn in the theme: one tab stop, arrow keys move and select (WAI-ARIA radio group). */
export function RadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const move = (index: number) => {
    const target = (index + options.length) % options.length;
    const option = options[target];
    if (!option) return;
    onChange(option.value);
    refs.current[target]?.focus();
  };
  return (
    <div>
      <p id={labelId} className="label">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="space-y-1">
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowRight') move(index + 1);
                else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') move(index - 1);
                else return;
                event.preventDefault();
              }}
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-raised"
            >
              <span className="radio-dot mt-0.5" data-checked={checked} aria-hidden="true" />
              <span>
                <span className="block">{option.label}</span>
                {option.description && <span className="block text-xs text-muted">{option.description}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}

/**
 * A search box that applies 300 ms after the last key (or at once on Enter), with its own clear
 * button. It follows `value` when the URL changes elsewhere (Back, a link).
 */
export function SearchField({
  value,
  onSearch,
  label,
  placeholder,
  className = '',
  searching = false,
}: {
  value: string;
  onSearch: (text: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  /** The filtered request is running: shows a small spinner and "Searching…" for screen readers. */
  searching?: boolean;
}) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  if (value !== synced) {
    setSynced(value);
    if (value !== text.trim()) setText(value);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  const apply = (next: string, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (next.trim() !== value) onSearch(next.trim());
    }, delay);
  };
  return (
    <form
      role="search"
      aria-label={label}
      className={`flex min-w-0 items-center gap-2 ${className}`}
      onSubmit={(event) => {
        event.preventDefault();
        apply(text, 0);
      }}
    >
      <span className="relative flex min-w-0 flex-1 items-center">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 text-muted" />
        <input
          type="search"
          aria-label={label}
          className="input pr-16 pl-9"
          value={text}
          placeholder={placeholder}
          onChange={(event) => {
            setText(event.target.value);
            // An empty box clears the filter at once; typing applies after a 300 ms pause.
            apply(event.target.value, event.target.value.trim() ? 300 : 0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && text) {
              event.preventDefault();
              setText('');
              apply('', 0);
            }
          }}
        />
        <span className="absolute right-1 flex items-center gap-0.5">
          {searching && (
            <span role="status" className="inline-flex h-7 w-7 items-center justify-center">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
              <span className="sr-only">Searching…</span>
            </span>
          )}
          {text && (
            <button
              type="button"
              aria-label="Clear search text"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg"
              onClick={() => {
                setText('');
                apply('', 0);
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </span>
      </span>
      <button type="submit" className="btn btn-quiet">
        Search
      </button>
    </form>
  );
}

/**
 * A themed tooltip for a focusable element: shows after 300 ms of hover or at once on keyboard
 * focus, hides on leave, blur or Escape. The text is plain React text.
 */
export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactElement<{ 'aria-describedby'?: string }>; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  const child = Children.only(children);
  return (
    <Popover.Root open={open}>
      <Popover.Anchor asChild>
        <span
          className="inline-flex"
          onPointerEnter={() => show(300)}
          onPointerLeave={hide}
          onFocus={() => show(0)}
          onBlur={hide}
          onKeyDown={(event) => {
            if (event.key === 'Escape') hide();
          }}
        >
          {isValidElement(child) ? cloneElement(child, { 'aria-describedby': open ? id : undefined }) : child}
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          id={id}
          role="tooltip"
          side={side}
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="tooltip pointer-events-none"
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Tabs (WAI-ARIA): arrow keys move between tabs, the panel follows the selected one. */
export function Tabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
  children,
}: {
  label: string;
  value: T;
  tabs: { value: T; label: string; count?: number | undefined }[];
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (index: number) => {
    const target = (index + tabs.length) % tabs.length;
    const tab = tabs[target];
    if (!tab) return;
    onChange(tab.value);
    refs.current[target]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line px-2">
        {tabs.map((tab, index) => {
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.value}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') move(index + 1);
                else if (event.key === 'ArrowLeft') move(index - 1);
                else if (event.key === 'Home') move(0);
                else if (event.key === 'End') move(tabs.length - 1);
                else return;
                event.preventDefault();
              }}
              className={`-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors ${
                selected ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <>
                  {' '}
                  <span className="segmented-count">{tab.count}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`}>
        {children}
      </div>
    </div>
  );
}
