import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { api } from '../api/client';
import { useAuthAction, useAuthStatus } from '../api/queries';
import { useLiveUpdates, type LiveState } from '../lib/live';
import { useTheme, type ThemeChoice } from '../lib/theme';
import { ErrorBox, Spinner } from './ui';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/emails', label: 'Emails' },
  { to: '/activity', label: 'Activity' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
  { to: '/tokens', label: 'Extension tokens' },
  { to: '/account', label: 'Account & data' },
];

const LIVE_TEXT: Record<LiveState, string> = { connecting: 'Connecting…', live: 'Live', offline: 'Offline' };

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <img src="/favicon.svg" alt="" width={24} height={24} />
      MailPulse
    </span>
  );
}

export function Layout() {
  const auth = useAuthStatus();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const authenticated = auth.data?.authenticated === true;
  const live = useLiveUpdates(authenticated);
  const logout = useAuthAction(() => api<void>('/api/auth/logout', { method: 'POST' }));

  if (auth.isPending) return <Spinner label="Opening MailPulse…" />;
  if (auth.isError) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorBox error={auth.error} onRetry={() => void auth.refetch()} />
      </div>
    );
  }
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-surface md:border-r md:border-b-0">
        <div className="md:sticky md:top-0">
          <div className="flex items-center justify-between px-4 py-3 md:py-5">
            <Logo />
            <button
              type="button"
              className="btn btn-quiet md:hidden"
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
          <nav id="main-nav" className={`${menuOpen ? 'block' : 'hidden'} space-y-1 px-3 pb-4 md:block`}>
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link" onClick={() => setMenuOpen(false)}>
                {item.label}
              </NavLink>
            ))}
            <div className="mt-6 space-y-3 border-t border-line px-3 pt-4 text-sm">
              <p className="flex items-center gap-2 text-muted">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${live.state === 'live' ? 'bg-good' : live.state === 'offline' ? 'bg-bad' : 'bg-warn'}`}
                />
                Updates: {LIVE_TEXT[live.state]}
              </p>
              <label className="block">
                <span className="label text-muted">Theme</span>
                <select className="input" value={theme} onChange={(event) => setTheme(event.target.value as ThemeChoice)}>
                  <option value="system">Same as Windows</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <button type="button" className="btn btn-quiet w-full" onClick={() => logout.mutate(undefined)} disabled={logout.isPending}>
                Sign out
              </button>
            </div>
          </nav>
          </div>
        </aside>
        <main className="mx-auto w-full max-w-6xl p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    );
  }
