import * as Dialog from '@radix-ui/react-dialog';
import { ChevronRight, LocateFixed } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useBlocker } from 'react-router';
import { ApiError } from '../api/client';
import { useSaveSettings, useSettings } from '../api/queries';
import type { Settings } from '../api/types';
import { Card, ErrorBox, PageHeader, QueryState, Toggle } from '../components/ui';
import { browserTimeZone, isValidTimeZone } from '../lib/format';

type NumberField = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

/** Same ranges as the backend (Settings.java); the backend checks them again. */
const RANGES: Record<Exclude<NumberField, 'followUpHours'>, [number, number]> = {
  sendGraceSeconds: [0, 120],
  selfViewWindowSeconds: [5, 120],
  dedupeWindowSeconds: [0, 600],
  spikeOpens: [2, 20],
  spikeWindowMinutes: [5, 1440],
  revivalDays: [1, 90],
  retentionDays: [30, 3650],
  docReadSeconds: [10, 600],
};

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

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

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="space-y-1">
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-raised">
            <input type="radio" className="h-4 w-4 accent-(--mp-accent)" checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
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
  const number = (key: NumberField, label: string, unit: string, hint?: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <span className="flex items-center gap-2">
        <input
          className="input max-w-32 tabular-nums"
          type="number"
          inputMode="numeric"
          value={Number.isNaN(form[key]) ? '' : form[key]}
          onChange={(event) => set(key, event.target.valueAsNumber)}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={`${key}-hint`}
        />
        <span className="text-sm text-muted">{unit}</span>
      </span>
      <span id={`${key}-hint`} className={errors[key] ? 'mt-1 block text-xs text-bad' : 'hint block'}>
        {errors[key] ?? hint}
      </span>
    </label>
  );
  const clock = (key: 'quietHoursStart' | 'quietHoursEnd', label: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="input max-w-32 tabular-nums"
        inputMode="numeric"
        placeholder="HH:mm"
        value={form[key]}
        onChange={(event) => set(key, event.target.value)}
        aria-invalid={errors[key] ? true : undefined}
      />
      {errors[key] && <span className="mt-1 block text-xs text-bad">{errors[key]}</span>}
    </label>
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
      },
      onError: (error) => {
        if (error instanceof ApiError) setErrors(error.fieldErrors);
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
          <ChoiceGroup
            label="Notify me on"
            value={form.notifyOn}
            onChange={(value) => set('notifyOn', value)}
            options={[
              { value: 'FIRST', label: 'First open only' },
              { value: 'EVERY', label: 'Every open (default)' },
              { value: 'EVERY_AFTER_GAP', label: 'Every open after a 1-hour gap' },
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
          <label className="block">
            <span className="label">Reader network addresses</span>
            <select className="input" value={form.ipMode} onChange={(event) => set('ipMode', event.target.value as Settings['ipMode'])}>
              <option value="TRUNCATED">Store shortened (IPv4 /24, IPv6 /48)</option>
              <option value="OFF">Do not store</option>
            </select>
          </label>
        </Section>

        <Section title="Alerts">
          <label className="block">
            <span className="label">Follow-up reminder when not opened after</span>
            <select className="input max-w-40" value={form.followUpHours} onChange={(event) => set('followUpHours', Number(event.target.value))}>
              {[24, 48, 72].map((hours) => (
                <option key={hours} value={hours}>
                  {hours} hours
                </option>
              ))}
            </select>
          </label>
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
            <label className="block">
              <span className="label">Send mode</span>
              <select className="input" value={form.sendMode} onChange={(event) => set('sendMode', event.target.value as Settings['sendMode'])}>
                <option value="PRESYNC">Add the tracking image when you click Send (default, never delays sending)</option>
                <option value="CANCEL_RESEND">Cancel, add the tracking image, send again (fallback)</option>
              </select>
            </label>
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
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              Save
            </button>
          </span>
        </div>
      )}

      <Dialog.Root open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-(--shadow-lg)">
            <Dialog.Title className="text-base font-semibold">Leave without saving?</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted">Your changes to the settings are not saved yet.</Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-quiet" onClick={() => blocker.reset?.()}>
                Stay
              </button>
              <button type="button" className="btn btn-danger" onClick={() => blocker.proceed?.()}>
                Leave
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
}
