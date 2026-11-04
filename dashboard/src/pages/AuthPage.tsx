import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api } from '../api/client';
import { useAuthAction, useAuthStatus } from '../api/queries';
import { Logo } from '../components/Layout';
import { ErrorBox, Spinner } from '../components/ui';

const MIN_PASSWORD = 12;
const RESET_SCRIPT = '.\\scripts\\reset-password.ps1';

/**
 * First run: one-time setup code from the backend log plus a new password. Afterwards: sign in, or
 * "Forgot password?": a reset code that only the backend log on this PC shows, plus a new password.
 */
export function AuthPage() {
  const auth = useAuthStatus();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const setup = useAuthAction((input: { setupCode: string; password: string }) => api<void>('/api/auth/setup', { method: 'POST', body: input }));
  const login = useAuthAction((input: { password: string }) => api<void>('/api/auth/login', { method: 'POST', body: input }));
  const requestReset = useAuthAction(() => api<void>('/api/auth/reset/request', { method: 'POST' }));
  const reset = useAuthAction((input: { resetCode: string; password: string }) => api<void>('/api/auth/reset', { method: 'POST', body: input }));

  if (auth.isPending) return <Spinner />;
  if (auth.isError) return <div className="mx-auto max-w-md p-6"><ErrorBox error={auth.error} onRetry={() => void auth.refetch()} /></div>;
  if (auth.data.authenticated) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const setupRequired = auth.data.setupRequired;
  const forgot = !setupRequired && mode === 'forgot';
  const choosing = setupRequired || forgot;
  const action = setupRequired ? setup : forgot ? reset : login;

  const switchMode = (next: 'login' | 'forgot') => {
    setMode(next);
    setProblem(null);
    setPassword('');
    setRepeat('');
    setCode('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (choosing) {
      if (password.length < MIN_PASSWORD) return setProblem(`Use at least ${MIN_PASSWORD} characters.`);
      if (password !== repeat) return setProblem('The two passwords are different.');
    }
    if (setupRequired) setup.mutate({ setupCode: code.trim(), password });
    else if (forgot) reset.mutate({ resetCode: code.trim(), password });
    else login.mutate({ password });
  };

  const title = setupRequired ? 'Set up MailPulse' : forgot ? 'Reset your password' : 'Sign in';

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6" aria-labelledby="auth-title">
        <Logo />
        <div>
          <h1 id="auth-title" className="text-lg font-semibold">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {setupRequired
              ? 'Enter the one-time setup code from the backend log (docs\\SETUP.md section 5) and choose your password.'
              : forgot
                ? 'For your safety the reset code is not shown here: MailPulse writes it to its log on this PC.'
                : 'Your private MailPulse dashboard on this PC.'}
          </p>
        </div>

        {forgot && (
          <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
            <p className="font-medium">1. Get a reset code</p>
            <p className="text-muted">
              In PowerShell, in the MailPulse folder, run <code className="font-mono">{RESET_SCRIPT}</code>. It prints a code that works once for 15
              minutes.
            </p>
            <button
              type="button"
              className="btn btn-quiet w-full"
              disabled={requestReset.isPending}
              onClick={() => requestReset.mutate(undefined, { onSuccess: () => setCodeSent(true) })}
            >
              {codeSent ? 'Write a new code to the log' : 'Write a code to the log'}
            </button>
            {codeSent && <p role="status" className="text-good">A new code is in the log. Read it with the script above.</p>}
            {requestReset.isError && <ErrorBox error={requestReset.error} />}
            <p className="pt-1 font-medium">2. Enter it and choose a new password</p>
          </div>
        )}

        {choosing && (
          <label className="block">
            <span className="label">{setupRequired ? 'Setup code' : 'Reset code'}</span>
            <input className="input font-mono" value={code} onChange={(event) => setCode(event.target.value)} placeholder="XXXXX-XXXXX" required autoComplete="off" />
          </label>
        )}
        <label className="block">
          <span className="label">{choosing ? 'New password' : 'Password'}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={choosing ? 'new-password' : 'current-password'}
            required
            autoFocus={!forgot}
          />
        </label>
        {choosing && <p className="-mt-3 text-xs text-muted">At least {MIN_PASSWORD} characters.</p>}
        {choosing && (
          <label className="block">
            <span className="label">Repeat the password</span>
            <input className="input" type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {problem && <p role="alert" className="text-sm text-bad">{problem}</p>}
        {action.isError && <ErrorBox error={action.error} />}
        <button type="submit" className="btn btn-primary w-full" disabled={action.isPending}>
          {setupRequired ? 'Create password' : forgot ? 'Set new password and sign in' : 'Sign in'}
        </button>
        {!setupRequired && (
          <button type="button" className="btn btn-ghost w-full" onClick={() => switchMode(forgot ? 'login' : 'forgot')}>
            {forgot ? 'Back to sign in' : 'Forgot password?'}
          </button>
        )}
      </form>
    </main>
  );
}
