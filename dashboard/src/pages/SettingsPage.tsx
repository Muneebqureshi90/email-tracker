import { ChevronRight, LocateFixed } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { ApiError } from '../api/client';
import { useSaveSettings, useSettings } from '../api/queries';
import type { Settings } from '../api/types';
import { NumberStepper, RadioGroup, Select } from '../components/controls';
import { Modal } from '../components/dialogs';
import { toast } from '../components/toast';
import { Button, Card, ErrorBox, PageHeader, QueryState, Toggle } from '../components/ui';
import { browserTimeZone, isValidTimeZone } from '../lib/format';

type NumberField = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

type RangeField = Exclude<NumberField, 'followUpHours'>;

/** Same ranges as the backend (Settings.java); the backend checks them again. */
const RANGES: Record<RangeField, [number, number]> = {
  sendGraceSeconds: [0, 120],
  selfViewWindowSeconds: [5, 120],
  dedupeWindowSeconds: [0, 600],
  spikeOpens: [2, 20],
  spikeWindowMinutes: [5, 1440],
  revivalDays: [1, 90],
  retentionDays: [30, 3650],
  docReadSeconds: [10, 600],
};

/** What one − / + press changes. */
const STEPS: Record<RangeField, number> = {
  sendGraceSeconds: 1,
  selfViewWindowSeconds: 5,
  dedupeWindowSeconds: 10,
  spikeOpens: 1,
  spikeWindowMinutes: 5,
  revivalDays: 1,
  retentionDays: 30,
  docReadSeconds: 5,
};

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Every half hour, plus the saved time when it is not on the grid. */
function clockOptions(current: string): { value: string; label: string }[] {
  const times = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);
  if (CLOCK.test(current) && !times.includes(current)) times.push(current);
  return times.sort().map((time) => ({ value: time, label: time }));
}

export function validateSettings(settings: Settings): Partial<Record<keyof Settings, string>> {
  const errors: Partial<Record<keyof Settings, string>> = {};
  for (const [field, [min, max]] of Object.entries(RANGES) as [keyof typeof RANGES, [number, number]][]) {
    const value = settings[field];
    if (!Number.isInteger(value) || value < min || value > max) errors[field] = `Enter a whole number from ${min} to ${max}.`;
  }
  if (![24, 48, 72].includes(settings.followUpHours)) errors.followUpHours = 'Choose 24, 48 or 72 hours.';
  if (!settings.timeZone.trim()) errors.timeZone = 'Enter a time zone such as Asia/Karachi.';
  else if (!isValidTimeZone(settings.timeZone)) errors.timeZone = 'Choose a time zone from the list.';
  if (!CLOCK.test(settings.quietHoursStart)) errors.quietHoursStart = 'Use a time such as 22:00.';
  if (!CLOCK.test(settings.quietHoursEnd)) errors.quietHoursEnd = 'Use a time such as 07:00.';
  else if (settings.quietHoursEnd === settings.quietHoursStart) errors.quietHoursEnd = 'Choose an end time different from the start.';
  return errors;
}

export function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="Settings" description="Rules for counting, alerts and notifications. The extension picks up changes within 30 seconds." />
      <QueryState query={settings}>{(data) => <SettingsForm initial={data} />}</QueryState>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div className="space-y-3 p-4">
        {description && <p className="text-sm text-muted">{description}</p>}
        {children}
      </div>
    </Card>
  );
}

/** Offset label such as "UTC+05:00" for a zone, at the current moment. */
function offsetOf(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(new Date())
      .find((item) => item.type === 'timeZoneName');
    return part?.value.replace('GMT', 'UTC') || 'UTC';
  } catch {
    return '';
  }
}

/** A searchable list of every time zone the browser knows, plus "Use my current time zone" (bug A2). */
function TimeZonePicker({ value, onChange, error }: { value: string; onChange: (zone: string) => void; error?: string }) {
  const id = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC']), []);
  const matches = useMemo(() => {
    const needle = text.trim().toLowerCase().replaceAll(' ', '_');
    return zones.filter((zone) => zone.toLowerCase().includes(needle)).slice(0, 60);
  }, [text, zones]);
  const current = browserTimeZone();
  const choose = (zone: string) => {
    onChange(zone);
    setText('');
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-input`} className="label">
        Time zone
      </label>
      <div className="relative">
        <input
          id={`${id}-input`}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint`}
          placeholder={value ? `${value} (${offsetOf(value)})` : 'Search, for example Karachi'}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(matches.length - 1, index + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            } else if (event.key === 'Enter' && open && matches[active]) {
              event.preventDefault();
              choose(matches[active]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {open && matches.length > 0 && (
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label="Time zones"
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-(--shadow-lg)"
          >
            {matches.map((zone, index) => (
              <li
                key={zone}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={zone === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(zone);
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex cursor-pointer justify-between gap-3 px-3 py-2 text-sm ${index === active ? 'bg-raised' : ''} ${zone === value ? 'font-semibold text-accent' : ''}`}
              >
                <span className="truncate">{zone.replaceAll('_', ' ')}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">{offsetOf(zone)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={`${id}-hint`} className={error ? 'text-xs text-bad' : 'hint'}>
        {error ?? `Now: ${value} (${offsetOf(value)}). Every date and time in MailPulse uses this zone.`}
      </p>
      {current !== value && (
        <button type="button" className="btn btn-quiet" onClick={() => onChange(current)}>
          <LocateFixed size={16} aria-hidden="true" />
          Use my current time zone ({current})
        </button>
      )}
    </div>
  );
}

/** A visible label for one of the custom selects (the label names the combobox). */
function SelectField<T extends string | number>({
  name,
  label,
  value,
  options,
  onChange,
  error,
  className = '',
}: {
  name: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  error?: string | undefined;
  className?: string;
}) {
  return (
    <div>
      <label id={`${name}-label`} htmlFor={`${name}-select`} className="label">
        {label}
      </label>
      <Select id={`${name}-select`} labelledBy={`${name}-label`} value={value} options={options} onChange={onChange} className={className} describedBy={error ? `${name}-error` : undefined} />
      {error && (
        <span id={`${name}-error`} className="mt-1 block text-xs text-bad">
          {error}
        </span>
      )}
    </div>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState<Settings>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Settings, string>>>({});
  const [saved, setSaved] = useState(false);
  const save = useSaveSettings();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const number = (key: RangeField, label: string, unit: string, hint?: string) => {
    const [min, max] = RANGES[key];
    return (
      <div>
        <label htmlFor={`setting-${key}`} className="label">
          {label}
        </label>
        <span className="flex flex-wrap items-center gap-2">
          <NumberStepper
            id={`setting-${key}`}
            value={form[key]}
            onChange={(value) => set(key, value)}
            min={min}
            max={max}
            step={STEPS[key]}
            invalid={Boolean(errors[key])}
            describedBy={`${key}-hint`}
          />
          <span className="text-sm text-muted">{unit}</span>
        </span>
        <span id={`${key}-hint`} className={errors[key] ? 'mt-1 block text-xs text-bad' : 'hint block'}>
          {errors[key] ?? hint ?? `${min} to ${max}`}
        </span>
      </div>
    );
  };
  const clock = (key: 'quietHoursStart' | 'quietHoursEnd', label: string) => (
    <SelectField name={key} label={label} value={form[key]} options={clockOptions(form[key])} onChange={(value) => set(key, value)} error={errors[key]} className="w-28" />
  );

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const found = validateSettings(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(form, {
      onSuccess: (stored) => {
        setForm(stored);
        setSaved(true);
        toast({ title: 'Settings saved', description: 'The extension picks them up within 30 seconds.', tone: 'success' });
      },
      onError: (error) => {
        const fields = error instanceof ApiError ? error.fieldErrors : {};
        setErrors(fields);
        toast({ title: 'Settings not saved', description: Object.keys(fields).length > 0 ? 'Fix the highlighted fields.' : error.message, tone: 'error' });
      },
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      {/* items-start: every card keeps its natural height (bug A8). */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section title="Time zone" description="Reports, the activity list and every time on the screen follow this zone.">
          <TimeZonePicker
            value={form.timeZone}
            error={errors.timeZone}
            onChange={(zone) => setForm((current) => ({ ...current, timeZone: zone, timeZoneSource: 'USER' }))}
          />
        </Section>

        <Section title="Tracking" description="What a new compose window starts with. You can still switch per email in Gmail.">
          <Toggle label="Track new emails" checked={form.trackingDefault} onChange={(value) => set('trackingDefault', value)} />
          <Toggle
            label="Track links in new emails"
            description="Off by default: while this PC is off, tracked links show recipients an error page."
            checked={form.linkTrackingDefault}
            onChange={(value) => set('linkTrackingDefault', value)}
          />
        </Section>

        <Section title="Notifications" description="Desktop notifications from the Chrome extension, and the alerts in this dashboard.">
          <Toggle label="Opens" checked={form.notifyOpens} onChange={(value) => set('notifyOpens', value)} />
          <Toggle label="Clicks" checked={form.notifyClicks} onChange={(value) => set('notifyClicks', value)} />
          <Toggle label="Alerts" checked={form.notifyAlerts} onChange={(value) => set('notifyAlerts', value)} />
          <RadioGroup
            label="Notify me on"
            value={form.notifyOn}
            onChange={(value) => set('notifyOn', value)}
            options={[
              { value: 'FIRST', label: 'First open only' },
              { value: 'EVERY', label: 'Every open (default)' },
              { value: 'EVERY_AFTER_GAP', label: 'Every open after a 1-hour gap', description: 'A reopen notifies only when the last open was at least an hour before.' },
            ]}
          />
          <Toggle
            label="Quiet hours"
            description="No desktop notifications between these times (in your time zone). Everything still shows here."
            checked={form.quietHoursEnabled}
            onChange={(value) => set('quietHoursEnabled', value)}
          />
          {form.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-3">
              {clock('quietHoursStart', 'From')}
              {clock('quietHoursEnd', 'Until')}
            </div>
          )}
        </Section>

        <Section title="Documents" description="Tracked PDF links such as your resume.">
          <Toggle
            label="Notify me about document views, reads and downloads"
            checked={form.notifyDocuments}
            onChange={(value) => set('notifyDocuments', value)}
          />
          {number('docReadSeconds', 'Count a view as read after', 'seconds', 'Total time the document was visible on the reader\'s screen.')}
        </Section>

        <Section title="Counting rules">
          {number('sendGraceSeconds', 'Ignore opens right after sending', 'seconds')}
          {number('dedupeWindowSeconds', 'Treat repeats from the same reader as one open', 'seconds')}
          <Toggle
            label="Count Apple Mail privacy prefetches"
            description="Apple loads images on delivery, so these are not real opens."
            checked={form.countApplePrefetch}
            onChange={(value) => set('countApplePrefetch', value)}
          />
          <SelectField
            name="ipMode"
            label="Reader network addresses"
            value={form.ipMode}
            onChange={(value) => set('ipMode', value)}
            options={[
              { value: 'TRUNCATED', label: 'Store shortened (IPv4 /24, IPv6 /48)' },
              { value: 'OFF', label: 'Do not store' },
            ]}
          />
        </Section>

        <Section title="Alerts">
          <SelectField
            name="followUpHours"
            label="Follow-up reminder when not opened after"
            value={form.followUpHours}
            onChange={(value) => set('followUpHours', value)}
            options={[24, 48, 72].map((hours) => ({ value: hours, label: `${hours} hours` }))}
            error={errors.followUpHours}
            className="w-40"
          />
          {number('spikeOpens', 'Open spike: at least', 'opens')}
          {number('spikeWindowMinutes', 'within', 'minutes')}
          {number('revivalDays', 'Revival: opened again after', 'days without opens')}
        </Section>

        <Section title="Data">{number('retentionDays', 'Keep emails and events for', 'days')}</Section>

        {/* Collapsed by default (bug A8): settings most people never need to touch. */}
        <details className="card group lg:col-span-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
            <ChevronRight size={16} className="transition-transform group-open:rotate-90" aria-hidden="true" />
            Advanced
          </summary>
          <div className="space-y-3 border-t border-line p-4">
            <p className="text-sm text-muted">How the extension avoids counting your own views and how it sends. The defaults work for most people.</p>
            {number('selfViewWindowSeconds', 'Self-view hold', 'seconds', 'An open waits this long, so your own view of the email in Gmail can cancel it.')}
            <RadioGroup
              label="Send mode"
              value={form.sendMode}
              onChange={(value) => set('sendMode', value)}
              options={[
                { value: 'PRESYNC', label: 'Add the tracking image when you click Send', description: 'Default. Never delays sending.' },
                { value: 'CANCEL_RESEND', label: 'Cancel, add the tracking image, send again', description: 'Fallback when the default does not work.' },
              ]}
            />
            <Toggle
              label="Block my own views in Chrome"
              description="Stops your own browser from loading your tracking image."
              checked={form.dnrBlocking}
              onChange={(value) => set('dnrBlocking', value)}
            />
            <Toggle label="Track confidential-mode emails" checked={form.trackConfidential} onChange={(value) => set('trackConfidential', value)} />
          </div>
        </details>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {saved && !dirty && (
          <span role="status" className="text-sm text-good">
            Saved.
          </span>
        )}
        {Object.keys(errors).length > 0 && (
          <span role="alert" className="text-sm text-bad">
            Fix the highlighted fields.
          </span>
        )}
        {save.isError && !(save.error instanceof ApiError && Object.keys(save.error.fieldErrors).length > 0) && <ErrorBox error={save.error} />}
      </div>

      {/* Sticky at the bottom of the content area while there is something to save (bug A8). */}
      {dirty && (
        <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-(--shadow-lg)">
          <span className="text-sm font-medium">Unsaved changes</span>
          <span className="flex gap-2">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setForm(initial);
                setErrors({});
              }}
            >
              Discard
            </button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save
            </Button>
          </span>
        </div>
      )}

      <Modal
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="Leave without saving?"
        description="Your changes to the settings are not saved yet."
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => blocker.reset?.()}>
              Stay
            </button>
            <button type="button" className="btn btn-danger" onClick={() => blocker.proceed?.()}>
              Leave
            </button>
          </>
        }
      />
    </form>
  );
}
