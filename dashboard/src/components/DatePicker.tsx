import * as Popover from '@radix-ui/react-popover';
import { CalendarDays } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { dayLabel, fromDay, toDay } from '../lib/days';

/**
 * A button that shows the chosen day and opens a themed calendar (react-day-picker), instead of
 * the native date input (bugs A3 and A7). Values are calendar days as YYYY-MM-DD.
 */
export function DatePicker({
  value,
  onChange,
  label,
  id,
  min,
  max,
  placeholder = 'Pick a date',
  clearLabel,
  footer,
}: {
  /** YYYY-MM-DD, or '' for none. */
  value: string;
  onChange: (day: string) => void;
  label?: string;
  id?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  /** Shows a button that clears the day (for example "No expiry"). */
  clearLabel?: string;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromDay(value);
  const before = min ? fromDay(min) : undefined;
  const after = max ? fromDay(max) : undefined;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" id={id} aria-label={label ? `${label}: ${value ? dayLabel(value) : placeholder}` : undefined} data-value={value} aria-haspopup="dialog" className="select-trigger w-auto">
          <CalendarDays size={16} aria-hidden="true" className="shrink-0 text-muted" />
          <span className={`whitespace-nowrap ${value ? '' : 'text-muted'}`}>{value ? dayLabel(value) : placeholder}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={4} collisionPadding={8} className="popover z-50 p-2" aria-label={label ?? 'Calendar'}>
          <DayPicker
            mode="single"
            weekStartsOn={1}
            selected={selected}
            defaultMonth={selected ?? after}
            disabled={[...(before ? [{ before }] : []), ...(after ? [{ after }] : [])]}
            startMonth={before}
            endMonth={after}
            onSelect={(date) => {
              if (date) onChange(toDay(date));
              setOpen(false);
            }}
            className="mp-calendar"
          />
          {(footer || clearLabel) && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-2 pt-2">
              {footer}
              {clearLabel && value && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  {clearLabel}
                </button>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
