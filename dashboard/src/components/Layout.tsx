import * as Dialog from '@radix-ui/react-dialog';
import {
  Activity,
  BarChart3,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { Navigate, NavigationType, NavLink, Outlet, useLocation, useNavigationType } from 'react-router';
import { api } from '../api/client';
import { useAlerts, useAuthAction, useAuthStatus, useSaveSettings, useSettings } from '../api/queries';
import { browserTimeZone, displayTimeZone, isValidTimeZone, setDisplayTimeZone } from '../lib/format';
import { useLiveUpdates, type LiveState } from '../lib/live';
import { useTheme, type ThemeChoice } from '../lib/theme';
import { TopBarContext, type TopBarSlots } from './shell';
import { Toaster } from './toast';
import { ErrorBox, Spinner } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/emails', label: 'Emails', icon: Mail },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/tokens', label: 'Extension tokens', icon: KeyRound },
  { to: '/account', label: 'Account & data', icon: UserRound },
];

const LIVE_TEXT: Record<LiveState, string> = { connecting: 'Reconnecting', live: 'Live', offline: 'Offline' };
const COLLAPSE_KEY = 'mailpulse-sidebar';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <img src="/favicon.svg" alt="" width={24} height={24} />
      <span className={compact ? 'sr-only' : ''}>MailPulse</span>
    </span>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/** System / Light / Dark as an icon segmented control. */
export function ThemeSwitch({ vertical = false }: { vertical?: boolean }) {
  const [theme, setTheme] = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={`inline-flex gap-0.5 rounded-lg border border-line bg-bg p-0.5 ${vertical ? 'flex-col' : ''}`}>
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors lg:h-7 lg:w-7 ${
            theme === value ? 'bg-surface text-fg shadow-(--shadow-sm)' : 'text-muted hover:text-fg'
          }`}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function Navigation({ collapsed, newAlerts, onNavigate }: { collapsed: boolean; newAlerts: number; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink to={to} end={end} className={`nav-link ${collapsed ? 'justify-center px-0' : ''}`} title={collapsed ? label : undefined} onClick={onNavigate}>
            <span className="relative">
              <Icon size={18} aria-hidden="true" />
              {collapsed && to === '/alerts' && newAlerts > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-warn" aria-hidden="true" />}
            </span>
            <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>
            {to === '/alerts' && newAlerts > 0 && (
              <span
                className={collapsed ? 'sr-only' : 'rounded-full bg-warn px-2 text-xs font-semibold text-bad-fg dark:text-bg'}
                aria-label={`${newAlerts} new`}
              >
                {newAlerts}
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function LiveIndicator({ state, collapsed }: { state: LiveState; collapsed: boolean }) {
  const tone = state === 'live' ? 'bg-good' : state === 'offline' ? 'bg-bad' : 'bg-warn';
  return (
    <p className={`flex items-center gap-2 text-xs text-muted ${collapsed ? 'justify-center' : ''}`} title={`Updates: ${LIVE_TEXT[state]}`}>
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />
      <span className={collapsed ? 'sr-only' : ''}>Updates: {LIVE_TEXT[state]}</span>
    </p>
  );
}

/** Once: a fresh install still says UTC (DEFAULT), so the browser zone is saved as AUTO (D-091). */
function useTimeZoneMigration(enabled: boolean) {
  const settings = useSettings(enabled);
  const save = useSaveSettings();
  const done = useRef(false);
  const data = settings.data;
  useEffect(() => {
    if (!data || data.timeZoneSource !== 'DEFAULT' || done.current) return;
    const zone = browserTimeZone();
    if (!isValidTimeZone(zone)) return;
    done.current = true;
    save.mutate({ ...data, timeZone: zone, timeZoneSource: 'AUTO' });
  }, [data, save]);
  return settings;
}

/** The scroll container starts at the top on every new page and gets its old position back on Back. */
function useScrollMemory() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const ref = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const [scrolled, setScrolled] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const saved = navigationType === NavigationType.Pop ? positions.current.get(location.key) : undefined;
    element.scrollTop = saved ?? 0;
  }, [location.key, navigationType]);

  const onScroll = (event: UIEvent<HTMLElement>) => {
    const top = event.currentTarget.scrollTop;
    positions.current.set(location.key, top);
    setScrolled(top > 0);
  };
  return { ref, scrolled, onScroll };
}

export function Layout() {
  const auth = useAuthStatus();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // State setters are stable callback refs, so the slots are set once and never loop.
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const slots = useMemo<TopBarSlots>(() => ({ title: titleSlot, actions: actionsSlot, toolbar: toolbarSlot }), [titleSlot, actionsSlot, toolbarSlot]);
  const authenticated = auth.data?.authenticated === true;
  const live = useLiveUpdates(authenticated);
  const settings = useTimeZoneMigration(authenticated);
  const logout = useAuthAction(() => api<void>('/api/auth/logout', { method: 'POST' }));
  const alerts = useAlerts('active', 0, authenticated);
  const newAlerts = authenticated ? (alerts.data?.newCount ?? 0) : 0;
  const { ref: scrollRef, scrolled, onScroll } = useScrollMemory();

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, current ? 'expanded' : 'collapsed');
      } catch {
        // storage blocked: the choice lasts for this tab only
      }
      return !current;
    });
  };

  if (auth.isPending) return <Spinner label="Opening MailPulse…" />;
  if (auth.isError) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorBox error={auth.error} onRetry={() => void auth.refetch()} />
      </div>
    );
  }
  if (!authenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;

  // Times wait for the settings so they never show in the wrong zone first; a failed load falls back to the browser zone.
  const zoneReady = !settings.isPending;
  if (settings.data) setDisplayTimeZone(settings.data.timeZone);
  const zone = displayTimeZone();

  const footer = (compact: boolean) => (
    <div className={`space-y-3 border-t border-line p-3 ${compact ? 'flex flex-col items-center' : ''}`}>
      <LiveIndicator state={live.state} collapsed={compact} />
      <ThemeSwitch vertical={compact} />
      <button
        type="button"
        className={`btn btn-ghost w-full ${compact ? 'px-0' : 'justify-start'}`}
        onClick={() => logout.mutate(undefined)}
        disabled={logout.isPending}
        title={compact ? 'Sign out' : undefined}
      >
        <LogOut size={16} aria-hidden="true" />
        <span className={compact ? 'sr-only' : ''}>Sign out</span>
      </button>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside
        data-testid="sidebar"
        aria-label="Sidebar"
        className={`hidden h-full shrink-0 flex-col border-r border-line bg-surface lg:flex ${collapsed ? 'w-16' : 'w-60'}`}
      >
        <div className={`flex h-(--mp-topbar-h) shrink-0 items-center gap-2 px-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <Logo compact={collapsed} />
          <button
            type="button"
            className="icon-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={16} aria-hidden="true" /> : <ChevronsLeft size={16} aria-hidden="true" />}
          </button>
        </div>
        <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <Navigation collapsed={collapsed} newAlerts={newAlerts} />
        </nav>
        {footer(collapsed)}
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header
          data-testid="top-bar"
          data-scrolled={scrolled}
          className={`z-20 shrink-0 border-b bg-surface transition-shadow ${scrolled ? 'border-line shadow-(--shadow-sm)' : 'border-transparent'}`}
        >
          <div className="flex min-h-(--mp-topbar-h) items-center gap-2 px-2 sm:px-4 lg:px-8">
            <button type="button" className="icon-btn lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
              <Menu size={20} aria-hidden="true" />
            </button>
            <div ref={setTitleSlot} data-testid="top-bar-title" className="min-w-0 flex-1" />
            <div ref={setActionsSlot} className="flex items-center gap-1" />
            <div className="lg:hidden">
              <ThemeSwitch />
            </div>
          </div>
          <div ref={setToolbarSlot} data-testid="top-bar-toolbar" className="px-4 pb-3 empty:hidden lg:px-8" />
        </header>
        <main
          id="content"
          ref={scrollRef}
          onScroll={onScroll}
          tabIndex={-1}
          data-testid="scroll-container"
          className="relative min-h-0 flex-1 overflow-y-auto scroll-pt-4 outline-none"
        >
          <div className="mx-auto w-full max-w-6xl p-4 pb-12 lg:p-8">
            <TopBarContext.Provider value={slots}>{zoneReady ? <Outlet key={zone} /> : <Spinner />}</TopBarContext.Provider>
          </div>
        </main>
      </div>
      <Toaster />

      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay animate-[mp-fade-in_150ms_ease-out] lg:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-(--shadow-lg) outline-none animate-[mp-drawer-in_200ms_ease-out] lg:hidden"
          >
            <div className="flex h-(--mp-topbar-h) shrink-0 items-center justify-between px-3">
              <Dialog.Title asChild>
                <span>
                  <Logo />
                </span>
              </Dialog.Title>
              <Dialog.Close className="icon-btn" aria-label="Close menu">
                <X size={20} aria-hidden="true" />
              </Dialog.Close>
            </div>
            <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              <Navigation collapsed={false} newAlerts={newAlerts} onNavigate={() => setMenuOpen(false)} />
            </nav>
            {footer(false)}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
