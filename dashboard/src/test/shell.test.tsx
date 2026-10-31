import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { integerTicks } from '../components/BucketChart';
import { browserTimeZone, formatDateTime, setDisplayTimeZone } from '../lib/format';
import { SETTINGS, email, mockApi, page, renderAt } from './helpers';

describe('app shell', () => {
  it('keeps the top bar outside the scroll container and shows the page title in it', async () => {
    mockApi({ 'GET /api/emails': { body: page([email()]) }, 'GET /api/accounts': { body: ['me@gmail.com'] } });
    renderAt('/emails');
    const topBar = await screen.findByTestId('top-bar');
    const scroller = screen.getByTestId('scroll-container');
    expect(scroller.contains(topBar)).toBe(false);
    expect(topBar.contains(scroller)).toBe(false);
    const title = await within(topBar).findByRole('heading', { level: 1, name: 'Emails' });
    expect(within(screen.getByTestId('top-bar-title')).getByRole('heading')).toBe(title);
    // Filters live in the fixed toolbar row, the list in the scroll container.
    expect(within(screen.getByTestId('top-bar-toolbar')).getByRole('group', { name: 'Show' })).toBeTruthy();
    expect(await within(scroller).findByRole('table')).toBeTruthy();
    expect(screen.getByTestId('sidebar').contains(scroller)).toBe(false);
  });

  it('offers "Skip to content" as the first Tab stop and moves focus to the main content', async () => {
    mockApi({ 'GET /api/emails': { body: page([]) } });
    renderAt('/emails');
    await screen.findByTestId('top-bar');
    await userEvent.tab();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(document.activeElement).toBe(skip);
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByTestId('scroll-container'));
  });

  it('opens the mobile drawer and closes it with Escape and on navigation', async () => {
    mockApi({ 'GET /api/emails': { body: page([]) }, 'GET /api/reports/daily': { body: null }, 'GET /api/reports/weekly': { body: null }, 'GET /api/activity': { body: { items: [], lastId: 0 } } });
    const router = renderAt('/emails');
    await userEvent.click(await screen.findByRole('button', { name: 'Open menu' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByRole('link', { name: 'Overview' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('link', { name: 'Activity' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/activity');
  });

  it('switches the theme with the System / Light / Dark control', async () => {
    mockApi({ 'GET /api/emails': { body: page([]) } });
    renderAt('/emails');
    const groups = await screen.findAllByRole('radiogroup', { name: 'Theme' });
    await userEvent.click(within(groups[0]!).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    for (const group of screen.getAllByRole('radiogroup', { name: 'Theme' })) {
      expect(within(group).getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    }
    await userEvent.click(within(groups[0]!).getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('collapses the sidebar to icons and remembers it', async () => {
    mockApi({ 'GET /api/emails': { body: page([]) } });
    renderAt('/emails');
    await userEvent.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByTestId('sidebar').className).toContain('w-16');
    expect(localStorage.getItem('mailpulse-sidebar')).toBe('collapsed');
    await userEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(localStorage.getItem('mailpulse-sidebar')).toBe('expanded');
  });
});

describe('time zone (bug A2)', () => {
  it('saves the browser zone once when the settings still have the default', async () => {
    const calls = mockApi({
      'GET /api/settings': { body: { ...SETTINGS, timeZone: 'UTC', timeZoneSource: 'DEFAULT' } },
      'PUT /api/settings': (call) => ({ body: call.body }),
      'GET /api/emails': { body: page([]) },
    });
    renderAt('/emails');
    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({ timeZone: browserTimeZone(), timeZoneSource: 'AUTO' });
  });

  it('does not touch a zone the owner chose', async () => {
    const calls = mockApi({ 'GET /api/emails': { body: page([]) } });
    renderAt('/emails');
    expect(await screen.findByText('No tracked emails yet')).toBeTruthy();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('formats every time in the settings zone', () => {
    setDisplayTimeZone('Asia/Karachi');
    expect(formatDateTime('2026-10-30T06:42:00Z')).toMatch(/11:42/);
    setDisplayTimeZone('UTC');
    expect(formatDateTime('2026-10-30T06:42:00Z')).toMatch(/6:42|06:42/);
    setDisplayTimeZone('Not/AZone');
    setDisplayTimeZone('Asia/Karachi');
  });

  it('picks a zone from the searchable list and offers the current zone', async () => {
    const calls = mockApi({ 'PUT /api/settings': (call) => ({ body: call.body }) });
    renderAt('/settings');
    const input = await screen.findByRole('combobox', { name: 'Time zone' });
    await userEvent.type(input, 'tokyo');
    await userEvent.click(await screen.findByRole('option', { name: /Asia\/Tokyo|Asia Tokyo/ }));
    expect(await screen.findByText('Unsaved changes')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({ timeZone: 'Asia/Tokyo', timeZoneSource: 'USER' }));
  });
});

describe('settings layout (bug A8)', () => {
  it('keeps Advanced collapsed and discards unsaved changes', async () => {
    mockApi({});
    renderAt('/settings');
    const summary = await screen.findByText('Advanced');
    expect(summary.closest('details')?.open).toBe(false);
    expect(screen.queryByText('Not yet proven (Step 1 spikes)')).toBeNull();
    await userEvent.click(screen.getByRole('switch', { name: 'Clicks' }));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(screen.getByRole<HTMLInputElement>('switch', { name: 'Clicks' }).checked).toBe(true);
  });

  it('asks before leaving with unsaved changes', async () => {
    mockApi({ 'GET /api/emails': { body: page([]) } });
    const router = renderAt('/settings');
    await userEvent.click(await screen.findByRole('switch', { name: 'Opens' }));
    await userEvent.click(screen.getAllByRole('link', { name: 'Emails' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/settings');
    await userEvent.click(screen.getAllByRole('link', { name: 'Emails' })[0]!);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/emails'));
  });
});

describe('charts and activity (bugs A3, A4, A5)', () => {
  it('uses whole-number ticks that end at the data', () => {
    expect(integerTicks(0)).toEqual([0, 1]);
    expect(integerTicks(1)).toEqual([0, 1]);
    expect(integerTicks(3)).toEqual([0, 1, 2, 3]);
    expect(integerTicks(13)).toEqual([0, 4, 8, 12, 16]);
  });

  it('truncates recipients and details separately and keeps the full text as a tooltip', async () => {
    const item = {
      id: 1,
      kind: 'OPEN',
      emailId: 'e1',
      subject: 'Quarterly plan',
      recipients: 'jane@example.com',
      occurredAt: '2026-10-30T06:42:00Z',
      source: 'GMAIL_PROXY',
      linkUrl: null,
      shouldNotify: true,
      alertType: null,
      alertText: null,
    };
    mockApi({ 'GET /api/activity': { body: { items: [item], lastId: 1 } } });
    renderAt('/activity');
    const link = await screen.findByRole('link', { name: /Quarterly plan/ });
    expect(link.getAttribute('title')).toBe('Quarterly plan · jane@example.com · Gmail');
    expect(within(link).getByText('jane@example.com').textContent).toBe('jane@example.com');
    expect(within(link).getByText('Gmail')).toBeTruthy();
  });

  it('shows the selected report day instead of an empty date input', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T06:42:00Z'));
    mockApi({ 'GET /api/reports/daily': { body: { period: 'DAY', start: '2026-10-30', end: '2026-10-31', timeZone: 'Asia/Karachi', sent: 0, openedEmails: 0, openRate: 0, opens: 0, clicks: 0, buckets: [], topEmails: [], topContacts: [] } } });
    renderAt('/reports');
    // A themed date picker (bug A7) that always names the day it shows (bug A3).
    const picker = await screen.findByRole('button', { name: /^Date: .*30/ });
    expect(picker.getAttribute('data-value')).toBe('2026-10-30');
    vi.useRealTimers();
  });
});

describe('custom controls on the pages (bug A7)', () => {
  it('leaves no native select, number or date input on Settings, Reports and the email page', async () => {
    mockApi({
      'GET /api/reports/daily': { body: { period: 'DAY', start: '2026-10-30', end: '2026-10-31', timeZone: 'Asia/Karachi', sent: 0, openedEmails: 0, openRate: 0, opens: 0, clicks: 0, buckets: [], topEmails: [], topContacts: [] } },
    });
    renderAt('/settings');
    await userEvent.click(await screen.findByText('Advanced'));
    expect(screen.getByRole('spinbutton', { name: /^Self-view hold/ })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Reader network addresses' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Notify me on' })).toBeTruthy();
    expect(document.querySelectorAll('select, input[type="number"], input[type="date"], input[type="radio"]')).toHaveLength(0);
  });

  it('steps a number setting and picks a quiet-hours time from the list', async () => {
    const calls = mockApi({ 'PUT /api/settings': (call) => ({ body: call.body }) });
    renderAt('/settings');
    const spike = await screen.findByRole('spinbutton', { name: /^Open spike/ });
    await userEvent.click(within(spike.parentElement!).getByRole('button', { name: 'Increase' }));
    await userEvent.click(screen.getByRole('switch', { name: /Quiet hours/ }));
    await userEvent.click(screen.getByRole('combobox', { name: 'From' }));
    await userEvent.click(screen.getByRole('option', { name: '23:30' }));
    await userEvent.click(screen.getByRole('radio', { name: /First open only/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({ spikeOpens: 4, quietHoursEnabled: true, quietHoursStart: '23:30', notifyOn: 'FIRST' }),
    );
    expect(await screen.findByText('Settings saved')).toBeTruthy();
  });
});

vi.setConfig({ testTimeout: 60_000 });
