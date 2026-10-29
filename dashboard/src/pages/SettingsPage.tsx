import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { useSaveSettings, useSettings } from '../api/queries';
import type { Settings } from '../api/types';
import { Card, ErrorBox, PageHeader, QueryState, Toggle } from '../components/ui';

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
};

export function validateSettings(settings: Settings): Partial<Record<keyof Settings, string>> {
  const errors: Partial<Record<keyof Settings, string>> = {};
  for (const [field, [min, max]] of Object.entries(RANGES) as [keyof typeof RANGES, [number, number]][]) {
    const value = settings[field];
    if (!Number.isInteger(value) || value < min || value > max) errors[field] = `Enter a whole number from ${min} to ${max}.`;
  }
  if (![24, 48, 72].includes(settings.followUpHours)) errors.followUpHours = 'Choose 24, 48 or 72 hours.';
  if (!settings.timeZone.trim()) errors.timeZone = 'Enter a time zone such as Asia/Karachi.';
  return errors;
}

export function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="Settings" description="Rules for counting, alerts and notifications. The extension picks up changes within five minutes." />
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

function SettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState<Settings>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Settings, string>>>({});
  const [saved, setSaved] = useState(false);
  const save = useSaveSettings();
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const number = (key: NumberField, label: string, unit: string, hint?: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <span className="flex items-center gap-2">
        <input
          className="input max-w-32"
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateSettings(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(form, {
      onSuccess: () => setSaved(true),
      onError: (error) => {
        if (error instanceof ApiError) setErrors(error.fieldErrors);
      },
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-2">
      <Section title="Tracking" description="What a new compose window starts with. You can still switch per email in Gmail.">
        <Toggle label="Track new emails" checked={form.trackingDefault} onChange={(value) => set('trackingDefault', value)} />
        <Toggle
          label="Track links in new emails"
          description="Off by default: while this PC is off, tracked links show recipients an error page."
          checked={form.linkTrackingDefault}
          onChange={(value) => set('linkTrackingDefault', value)}
        />
      </Section>

      <Section title="Not yet proven (Step 1 spikes)" description="Defaults follow the plan; change them when the spike results say so.">
        {number('selfViewWindowSeconds', 'Self-view hold', 'seconds', 'Opens wait this long so your own Gmail views can cancel them (spike 3 tests 15 s).')}
        <label className="block">
          <span className="label">Send mode</span>
          <select className="input" value={form.sendMode} onChange={(event) => set('sendMode', event.target.value as Settings['sendMode'])}>
            <option value="PRESYNC">Insert the pixel at send (default, never delays sending)</option>
            <option value="CANCEL_RESEND">Cancel, add the pixel, send again (fallback)</option>
          </select>
        </label>
        <Toggle
          label="Block my own views in Chrome"
          description="Extension rules stop your browser from loading your own pixel."
          checked={form.dnrBlocking}
          onChange={(value) => set('dnrBlocking', value)}
        />
        <Toggle label="Track confidential-mode emails" checked={form.trackConfidential} onChange={(value) => set('trackConfidential', value)} />
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

      <Section title="Desktop notifications">
        <Toggle label="Opens" checked={form.notifyOpens} onChange={(value) => set('notifyOpens', value)} />
        <Toggle label="Clicks" checked={form.notifyClicks} onChange={(value) => set('notifyClicks', value)} />
        <Toggle label="Alerts" checked={form.notifyAlerts} onChange={(value) => set('notifyAlerts', value)} />
      </Section>

      <Section title="Data">
        {number('retentionDays', 'Keep emails and events for', 'days')}
        <label className="block">
          <span className="label">Time zone for reports</span>
          <input className="input" list="time-zones" value={form.timeZone} onChange={(event) => set('timeZone', event.target.value)} aria-invalid={errors.timeZone ? true : undefined} />
          <datalist id="time-zones">
            {zones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          {errors.timeZone && <span className="mt-1 block text-xs text-bad">{errors.timeZone}</span>}
        </label>
      </Section>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>
          Save settings
        </button>
        {saved && <span role="status" className="text-sm text-good">Saved.</span>}
        {Object.keys(errors).length > 0 && <span role="alert" className="text-sm text-bad">Fix the highlighted fields.</span>}
        {save.isError && !(save.error instanceof ApiError && Object.keys(save.error.fieldErrors).length > 0) && <ErrorBox error={save.error} />}
      </div>
    </form>
  );
}
