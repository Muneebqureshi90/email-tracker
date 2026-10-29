import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api } from '../api/client';
import { useAuthAction, useAuthStatus } from '../api/queries';
import { Logo } from '../components/Layout';
import { ErrorBox, Spinner } from '../components/ui';

const MIN_PASSWORD = 12;

/** First run: one-time setup code from the backend log plus a new password. Afterwards: sign in. */
export function AuthPage() {
  const auth = useAuthStatus();
  const location = useLocation();
  const [setupCode, setSetupCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const setup = useAuthAction((input: { setupCode: string; password: string }) => api<void>('/api/auth/setup', { method: 'POST', body: input }));
  const login = useAuthAction((input: { password: string }) => api<void>('/api/auth/login', { method: 'POST', body: input }));

  if (auth.isPending) return <Spinner />;
  if (auth.isError) return <div className="mx-auto max-w-md p-6"><ErrorBox error={auth.error} onRetry={() => void auth.refetch()} /></div>;
  if (auth.data.authenticated) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const setupRequired = auth.data.setupRequired;
  const action = setupRequired ? setup : login;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (setupRequired) {
      if (password.length < MIN_PASSWORD) return setProblem(`Use at least ${MIN_PASSWORD} characters.`);
      if (password !== repeat) return setProblem('The two passwords are different.');
      setup.mutate({ setupCode: setupCode.trim(), password });
    } else {
      login.mutate({ password });
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6" aria-labelledby="auth-title">
        <Logo />
        <div>
          <h1 id="auth-title" className="text-lg font-semibold">
            {setupRequired ? 'Set up MailPulse' : 'Sign in'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {setupRequired
              ? 'Enter the one-time setup code from the backend log (docs\\SETUP.md section 5) and choose your password.'
              : 'Your private MailPulse dashboard on this PC.'}
          </p>
        </div>
        {setupRequired && (
          <label className="block">
            <span className="label">Setup code</span>
            <input className="input font-mono" value={setupCode} onChange={(event) => setSetupCode(event.target.value)} placeholder="XXXXX-XXXXX" required autoComplete="off" />
          </label>
        )}
        <label className="block">
          <span className="label">{setupRequired ? 'New password' : 'Password'}</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={setupRequired ? 'new-password' : 'current-password'}
            required
            autoFocus
          />
        </label>
        {setupRequired && (
          <label className="block">
            <span className="label">Repeat the password</span>
            <input className="input" type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {problem && <p role="alert" className="text-sm text-bad">{problem}</p>}
        {action.isError && <ErrorBox error={action.error} />}
        <button type="submit" className="btn btn-primary w-full" disabled={action.isPending}>
          {setupRequired ? 'Create password' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
