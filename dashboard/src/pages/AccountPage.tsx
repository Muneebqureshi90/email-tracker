import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { useDeleteAllData } from '../api/queries';
import { Card, ErrorBox, PageHeader } from '../components/ui';

export const DELETE_CONFIRMATION = 'DELETE ALL MY DATA';

export function AccountPage() {
  return (
    <>
      <PageHeader title="Account & data" description="Your password, a full export, and deleting everything." />
      <div className="grid gap-6 lg:grid-cols-2">
        <PasswordCard />
        <Card title="Export">
          <div className="space-y-3 p-4 text-sm">
            <p className="text-muted">
              One JSON file with every email, recipient, link, event and contact, decrypted. Keep it somewhere safe: it contains
              email addresses and subjects in plain text.
            </p>
            <a className="btn btn-quiet" href="/api/export" download>
              Download export
            </a>
          </div>
        </Card>
        <DeleteCard />
      </div>
    </>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => api<void>('/api/auth/password', { method: 'PUT', body: input }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setRepeat('');
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (next.length < 12) return setProblem('Use at least 12 characters.');
    if (next !== repeat) return setProblem('The two new passwords are different.');
    change.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <Card title="Change password">
      <form onSubmit={submit} className="space-y-3 p-4">
        <label className="block">
          <span className="label">Current password</span>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
        </label>
        <label className="block">
          <span className="label">New password</span>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} required />
        </label>
        <label className="block">
          <span className="label">Repeat the new password</span>
          <input className="input" type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} required />
        </label>
        <p className="hint">Other signed-in browsers are signed out.</p>
        {problem && <p role="alert" className="text-sm text-bad">{problem}</p>}
        {change.isError && <ErrorBox error={change.error} />}
        {change.isSuccess && <p role="status" className="text-sm text-good">Password changed.</p>}
        <button type="submit" className="btn btn-primary" disabled={change.isPending}>
          Change password
        </button>
      </form>
    </Card>
  );
}

function DeleteCard() {
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const remove = useDeleteAllData();
  const ready = confirm === DELETE_CONFIRMATION && password.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    remove.mutate(
      { confirm, password },
      {
        onSuccess: () => {
          setConfirm('');
          setPassword('');
        },
      },
    );
  };

  return (
    <Card title="Delete all data" className="border-bad/50 lg:col-span-2">
      <form onSubmit={submit} className="space-y-3 p-4">
        <p className="text-sm">
          Deletes every tracked email, event, link, contact and Gmail account from MailPulse. Your password, settings and extension
          tokens stay. <strong>This cannot be undone.</strong> Download an export first if you want a copy.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">
              Type <code className="font-mono">{DELETE_CONFIRMATION}</code>
            </span>
            <input className="input" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
        </div>
        {remove.isError && <ErrorBox error={remove.error} />}
        {remove.isSuccess && <p role="status" className="text-sm text-good">All tracking data was deleted.</p>}
        <button type="submit" className="btn btn-danger" disabled={!ready || remove.isPending}>
          Delete all data
        </button>
      </form>
    </Card>
  );
}
