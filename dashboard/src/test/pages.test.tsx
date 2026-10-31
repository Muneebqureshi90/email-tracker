import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EmailDetail } from '../api/types';
import { DELETE_CONFIRMATION } from '../pages/AccountPage';
import { mondayOf } from '../pages/ReportsPage';
import { validateSettings } from '../pages/SettingsPage';
import { SETTINGS, email, mockApi, page, renderAt } from './helpers';

const REPORT = {
  period: 'DAY',
  start: '2026-10-29',
  end: '2026-10-30',
  timeZone: 'Asia/Karachi',
  sent: 4,
  openedEmails: 3,
  openRate: 0.75,
  opens: 9,
  clicks: 2,
  buckets: Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, '0')}:00`, opens: hour === 10 ? 5 : 0, clicks: 0 })),
  topEmails: [{ id: '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11', subject: 'Quarterly plan', recipients: 'jane@example.com', opens: 5, clicks: 1 }],
  topContacts: [{ email: 'jane@example.com', name: 'Jane Doe', opens: 5 }],
};


describe('sign-in', () => {
  it('asks for the setup code on first run and checks the two passwords', async () => {
    const calls = mockApi({ 'GET /api/auth/status': { body: { setupRequired: true, authenticated: false } } });
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Setup code'), 'ABCDE-12345');
    await userEvent.type(screen.getByLabelText('New password'), 'correct horse battery');
    await userEvent.type(screen.getByLabelText('Repeat the password'), 'something else entirely');
    await userEvent.click(screen.getByRole('button', { name: 'Create password' }));
    expect(screen.getByRole('alert').textContent).toBe('The two passwords are different.');
    expect(calls.some((call) => call.path === '/api/auth/setup')).toBe(false);
  });

  it('shows the server message when the password is wrong', async () => {
    mockApi({
      'GET /api/auth/status': { body: { setupRequired: false, authenticated: false } },
      'POST /api/auth/login': { status: 401, body: { title: 'Unauthorized', detail: 'Wrong password' } },
    });
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Password'), 'not my password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Wrong password');
  });

  it('sends signed-out visitors to the sign-in page', async () => {
    mockApi({ 'GET /api/auth/status': { body: { setupRequired: false, authenticated: false } } });
    const router = renderAt('/emails');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('emails', () => {
  it('lists emails with their marks and filters by state', async () => {
    const calls = mockApi({ 'GET /api/emails': { body: page([email(), email({ id: 'e2', subject: 'Unopened offer', openCount: 0, lastOpenedAt: null })]) } });
    renderAt('/emails');
    // The table shows skeleton rows first, then the emails.
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('Quarterly plan')).toBeTruthy();
    // The contract display rule: two or more opens show the count ("Opened N×").
    expect(within(table).getByRole('img', { name: 'Opened 2 times' })).toBeTruthy();
    expect(within(table).getByRole('img', { name: 'Sent' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Opened' }));
    await waitFor(() => expect(calls.at(-1)?.search.get('state')).toBe('opened'));
  });

  it('shows an empty state and an error state with retry', async () => {
    let fail = true;
    mockApi({ 'GET /api/emails': () => (fail ? { status: 500, body: { detail: 'Database is down' } } : { body: page([]) }) });
    renderAt('/emails');
    expect((await screen.findByRole('alert')).textContent).toContain('Database is down');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No tracked emails yet')).toBeTruthy();
  });
});

describe('email detail', () => {
  const detail: EmailDetail = {
    summary: email(),
    trackOpens: true,
    trackLinks: false,
    trackingEnabled: true,
    notifications: true,
    followUpHours: null,
    gmailMessageId: '18a1',
    gmailThreadId: '18a0',
    cancelledAt: null,
    links: [],
    events: [
      { id: 2, type: 'OPEN', receivedAt: '2026-10-29T10:00:00Z', verdict: 'COUNTED', reason: null, source: 'GMAIL_PROXY', linkId: null, userAgent: 'GoogleImageProxy', ipPrefix: null },
      { id: 1, type: 'OPEN', receivedAt: '2026-10-29T09:00:07Z', verdict: 'IGNORED', reason: 'SEND_GRACE', source: 'GMAIL_PROXY', linkId: null, userAgent: '<b>not html</b>', ipPrefix: '203.0.113.0' },
    ],
  };

  it('explains every request and mutes notifications', async () => {
    const calls = mockApi({
      [`GET /api/emails/${detail.summary.id}`]: { body: detail },
      [`PATCH /api/emails/${detail.summary.id}/preferences`]: { status: 204 },
    });
    renderAt(`/emails/${detail.summary.id}`);
    expect(await screen.findByText('Within seconds of sending: Gmail showing your sent copy')).toBeTruthy();
    expect(screen.getByText('<b>not html</b>')).toBeTruthy();
    await userEvent.click(screen.getByRole('switch', { name: /Notifications/ }));
    await waitFor(() => expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ notifications: false }));
  });
});

describe('settings', () => {
  it('validates ranges like the backend', () => {
    expect(validateSettings(SETTINGS)).toEqual({});
    expect(validateSettings({ ...SETTINGS, selfViewWindowSeconds: 2, followUpHours: 36, timeZone: ' ' })).toEqual({
      selfViewWindowSeconds: 'Enter a whole number from 5 to 120.',
      followUpHours: 'Choose 24, 48 or 72 hours.',
      timeZone: 'Enter a time zone such as Asia/Karachi.',
    });
    expect(validateSettings({ ...SETTINGS, timeZone: 'Mars/Olympus', quietHoursStart: '25:00', docReadSeconds: 5 })).toEqual({
      timeZone: 'Choose a time zone from the list.',
      quietHoursStart: 'Use a time such as 22:00.',
      docReadSeconds: 'Enter a whole number from 10 to 600.',
    });
  });

  it('blocks invalid values and saves valid ones', async () => {
    const calls = mockApi({ 'GET /api/settings': { body: SETTINGS }, 'PUT /api/settings': (call) => ({ body: call.body }) });
    renderAt('/settings');
    await userEvent.click(await screen.findByText('Advanced'));
    const hold = await screen.findByLabelText(/^Self-view hold/);
    await userEvent.clear(hold);
    await userEvent.type(hold, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a whole number from 5 to 120.')).toBeTruthy();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);

    await userEvent.clear(hold);
    await userEvent.type(hold, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({ selfViewWindowSeconds: 15, sendMode: 'PRESYNC' });
  });
});

describe('tokens and data', () => {
  it('shows a new extension token once', async () => {
    mockApi({
      'GET /api/tokens': { body: [] },
      'POST /api/tokens': { status: 201, body: { id: 't1', name: 'Chrome extension', prefix: 'mp_abcd', token: 'mp_abcdefghijklmnopqrstuvwx', createdAt: '2026-10-29T10:00:00Z' } },
    });
    renderAt('/tokens');
    await userEvent.click(await screen.findByRole('button', { name: 'Create token' }));
    expect((await screen.findByTestId('new-token')).textContent).toBe('mp_abcdefghijklmnopqrstuvwx');
  });

  it('deletes all data only after the exact confirmation and the password', async () => {
    const calls = mockApi({ 'DELETE /api/data': { status: 204 } });
    renderAt('/account');
    const button = await screen.findByRole('button', { name: 'Delete all data' });
    await userEvent.type(screen.getByLabelText(/Type/), 'delete all my data');
    await userEvent.type(screen.getAllByLabelText('Password').at(-1)!, 'correct horse battery staple');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText(/Type/));
    await userEvent.type(screen.getByLabelText(/Type/), DELETE_CONFIRMATION);
    await userEvent.click(button);
    expect(await screen.findByText('All tracking data was deleted.')).toBeTruthy();
    expect(calls.find((call) => call.method === 'DELETE')?.body).toEqual({ confirm: DELETE_CONFIRMATION, password: 'correct horse battery staple' });
  });
});

describe('overview and reports', () => {
  it('shows today and an empty state before the first email', async () => {
    mockApi({
      'GET /api/reports/daily': { body: REPORT },
      'GET /api/reports/weekly': { body: { ...REPORT, period: 'WEEK', buckets: REPORT.buckets.slice(0, 7) } },
      'GET /api/activity': { body: { items: [], lastId: 0 } },
      'GET /api/emails': { body: page([]) },
    });
    renderAt('/');
    expect(await screen.findByText('No tracked emails yet')).toBeTruthy();
    expect(screen.getByText('75% of today\'s emails')).toBeTruthy();
  });

  it('reports top emails and contacts, and weeks start on Monday', async () => {
    mockApi({ 'GET /api/reports/daily': { body: REPORT } });
    renderAt('/reports');
    expect(await screen.findByRole('link', { name: 'Quarterly plan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Jane Doe' })).toBeTruthy();
    expect(mondayOf('2026-10-29')).toBe('2026-10-26');
    expect(mondayOf('2026-10-26')).toBe('2026-10-26');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });
});

describe('alerts and per-email extras (Phase 5)', () => {
  it('lists open alerts, shows the badge and snoozes one', async () => {
    const alert = {
      id: 'a1',
      type: 'OPEN_SPIKE',
      text: 'Opened 3 times within 60 minutes',
      status: 'NEW',
      createdAt: '2026-10-29T10:00:00Z',
      snoozedUntil: null,
      emailId: '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11',
      subject: 'Quarterly plan',
      recipients: 'Jane Doe',
    };
    const calls = mockApi({
      'GET /api/alerts': { body: { items: [alert], page: 0, size: 25, total: 1, newCount: 1 } },
      'PATCH /api/alerts/a1': (call) => ({ body: { ...alert, ...(call.body as object) } }),
    });
    renderAt('/alerts');
    expect(await screen.findByText('Opened 3 times within 60 minutes')).toBeTruthy();
    expect(screen.getByText('Hot')).toBeTruthy();
    expect(await screen.findByLabelText('1 new')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Snooze 1 day' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'SNOOZED', snoozeHours: 24 }));
  });

  it('sets the follow-up time per email and warns when open status is unreliable', async () => {
    const id = '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11';
    const detail = {
      summary: email({ openCount: 0, lastOpenedAt: null, firstOpenedAt: null, openStatusUnreliable: true }),
      trackOpens: true,
      trackLinks: false,
      trackingEnabled: true,
      notifications: true,
      followUpHours: null,
      gmailMessageId: null,
      gmailThreadId: null,
      cancelledAt: null,
      links: [],
      events: [],
    };
    const calls = mockApi({ [`GET /api/emails/${id}`]: { body: detail }, [`PATCH /api/emails/${id}/preferences`]: { status: 204 } });
    renderAt(`/emails/${id}`);
    expect((await screen.findByRole('note')).textContent).toContain('Open status may be unreliable');
    await userEvent.click(screen.getByRole('combobox', { name: /Follow-up reminder/ }));
    await userEvent.click(screen.getByRole('option', { name: '72 hours' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ followUpHours: 72 }));
  });
});

// The first visit to a lazy page imports it and the chart library cold; on a busy PC that took 17 s.
vi.setConfig({ testTimeout: 60_000 });
