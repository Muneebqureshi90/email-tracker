import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityItem } from '../api/types';
import { email, mockApi, page, renderAt } from './helpers';

afterEach(() => vi.useRealTimers());

const emailCalls = (calls: ReturnType<typeof mockApi>) => calls.filter((call) => call.path === '/api/emails');

/** Types the text; the field applies it 300 ms after the last key (real timers, callers waitFor). */
async function typeAndPause(box: HTMLElement, text: string) {
  await userEvent.type(box, text);
}

describe('Emails list', () => {
  it('shows counts in the filters, sorts by a column and keeps it in the URL', async () => {
    const calls = mockApi({
      'GET /api/emails': (call) => ({ body: { items: [email()], page: 0, size: Number(call.search.get('size') ?? 25), total: 60 } }),
      'GET /api/emails/counts': { body: { all: 60, opened: 40, notOpened: 20, clicked: 5 } },
      'GET /api/accounts': { body: ['me@gmail.com'] },
    });
    const router = renderAt('/emails');
    expect(await screen.findByRole('button', { name: 'Opened 40' })).toBeTruthy();
    const table = await screen.findByRole('table', { name: 'Emails' });
    await userEvent.click(within(table).getByRole('button', { name: 'Opens' }));
    await waitFor(() => expect(router.state.location.search).toBe('?sort=opens'));
    await waitFor(() => expect(emailCalls(calls).at(-1)?.search.get('sort')).toBe('opens'));
    expect(within(table).getByRole('columnheader', { name: /Opens/ }).getAttribute('aria-sort')).toBe('descending');
    await userEvent.click(within(table).getByRole('button', { name: 'Opens' }));
    await waitFor(() => expect(emailCalls(calls).at(-1)?.search.get('dir')).toBe('asc'));
  });

  it('searches as you type: one request 300 ms after the last key, back on page 1', async () => {
    const calls = mockApi({ 'GET /api/emails': (call) => ({ body: call.search.get('q') ? page([]) : { items: [email()], page: 1, size: 25, total: 60 } }) });
    const router = renderAt('/emails?page=1');
    await typeAndPause(await screen.findByRole('searchbox', { name: 'Search emails' }), 'jane');
    await waitFor(() => expect(emailCalls(calls).filter((call) => call.search.get('q') === 'jane')).toHaveLength(1));
    expect(emailCalls(calls).filter((call) => call.search.get('q') !== null && call.search.get('q') !== 'jane')).toHaveLength(0);
    expect(emailCalls(calls).at(-1)?.search.get('page')).toBe('0');
    expect(router.state.location.search).toBe('?q=jane');
    // Untrusted text stays text; Clear search (or Escape) drops the filter.
    expect(await screen.findByText('No emails match "jane"')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('changes the page size and asks the API for it', async () => {
    const calls = mockApi({ 'GET /api/emails': (call) => ({ body: { items: [email()], page: 0, size: Number(call.search.get('size') ?? 25), total: 60 } }) });
    const router = renderAt('/emails');
    const bottom = await screen.findByRole('navigation', { name: 'Pages' });
    await userEvent.click(within(bottom).getByRole('combobox', { name: 'Per page' }));
    await userEvent.click(screen.getByRole('option', { name: '50' }));
    await waitFor(() => expect(router.state.location.search).toBe('?size=50'));
    await waitFor(() => expect(emailCalls(calls).at(-1)?.search.get('size')).toBe('50'));
  });
});

describe('Emails list replies', () => {
  it('shows a Replied badge in the list and in the row of an email with a reply', async () => {
    mockApi({
      'GET /api/emails': {
        body: { items: [email({ id: 'e-replied', subject: 'Offer letter', repliedAt: '2026-10-30T10:00:00Z' })], page: 0, size: 25, total: 1 },
      },
      'GET /api/emails/counts': { body: { all: 1, opened: 0, notOpened: 1, clicked: 0 } },
      'GET /api/accounts': { body: ['me@gmail.com'] },
    });
    renderAt('/emails');
    const replied = await screen.findByRole('list', { name: 'Replied emails' });
    expect(within(replied).getByText('Replied')).toBeTruthy();
    expect(within(replied).getByRole('link', { name: 'Offer letter' }).getAttribute('href')).toBe('/emails/e-replied');
    const table = await screen.findByRole('table', { name: 'Emails' });
    expect(within(table).getAllByText('Replied').length).toBeGreaterThan(0);
  });

  it('shows no Replied badge when no email has a reply', async () => {
    mockApi({
      'GET /api/emails': { body: { items: [email({ repliedAt: null })], page: 0, size: 25, total: 1 } },
      'GET /api/emails/counts': { body: { all: 1, opened: 0, notOpened: 1, clicked: 0 } },
      'GET /api/accounts': { body: ['me@gmail.com'] },
    });
    renderAt('/emails');
    const table = await screen.findByRole('table', { name: 'Emails' });
    expect(screen.queryByRole('list', { name: 'Replied emails' })).toBeNull();
    expect(within(table).queryByText('Replied')).toBeNull();
  });
});

describe('Email detail reply', () => {
  it('shows when the reply came', async () => {
    const summary = email({ id: 'e-replied', subject: 'Offer letter', repliedAt: '2026-10-30T10:00:00Z' });
    mockApi({
      'GET /api/emails/e-replied': {
        body: {
          summary,
          trackOpens: true,
          trackLinks: true,
          trackingEnabled: true,
          notifications: true,
          followUpHours: null,
          gmailMessageId: null,
          gmailThreadId: null,
          cancelledAt: null,
          links: [],
          events: [],
          opens: [],
        },
      },
    });
    renderAt('/emails/e-replied');
    const badge = await screen.findByText('Replied');
    expect(badge.closest('[role="status"]')?.textContent).toMatch(/Replied.*\(/);
  });
});

describe('Contacts', () => {
  it('lists contacts with avatars and open rates and sorts them', async () => {
    const contact = { email: 'jane@example.com', name: 'Jane Doe', emails: 4, openedEmails: 3, opens: 9, clicks: 1, firstSeenAt: '2026-10-01T09:00:00Z', lastEmailedAt: '2026-10-29T09:00:00Z', lastOpenedAt: '2026-10-29T10:00:00Z' };
    const calls = mockApi({ 'GET /api/contacts': { body: page([contact]) } });
    renderAt('/contacts');
    const table = await screen.findByRole('table', { name: 'Contacts' });
    expect(await within(table).findByText('75%')).toBeTruthy();
    expect(within(table).getByText('JD')).toBeTruthy();
    await userEvent.click(within(table).getByRole('button', { name: 'Open rate' }));
    await waitFor(() => expect(calls.filter((call) => call.path === '/api/contacts').at(-1)?.search.get('sort')).toBe('openRate'));
  });

  it('searches as you type and offers to clear an empty result', async () => {
    const calls = mockApi({ 'GET /api/contacts': (call) => ({ body: call.search.get('q') ? page([]) : { items: [], page: 1, size: 25, total: 30 } }) });
    const router = renderAt('/contacts?page=1');
    await typeAndPause(await screen.findByRole('searchbox', { name: 'Search contacts' }), 'omar');
    const contactCalls = () => calls.filter((call) => call.path === '/api/contacts');
    await waitFor(() => expect(contactCalls().filter((call) => call.search.get('q') === 'omar')).toHaveLength(1));
    expect(contactCalls().filter((call) => call.search.get('q') !== null && call.search.get('q') !== 'omar')).toHaveLength(0);
    expect(contactCalls().at(-1)?.search.get('page')).toBe('0');
    expect(await screen.findByText('No contacts match "omar"')).toBeTruthy();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search contacts' }), '{Escape}');
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('pages the emails sent to one contact', async () => {
    const contact = { email: 'jane@example.com', name: 'Jane Doe', emails: 30, openedEmails: 3, opens: 9, clicks: 1, firstSeenAt: '2026-10-01T09:00:00Z', lastEmailedAt: null, lastOpenedAt: null };
    const calls = mockApi({
      'GET /api/contacts/jane%40example.com': { body: { summary: contact, emails: [] } },
      'GET /api/contacts/jane%40example.com/emails': (call) => ({ body: { items: [email({ subject: `Page ${call.search.get('page') ?? 0}` })], page: Number(call.search.get('page') ?? 0), size: 25, total: 30 } }),
    });
    renderAt('/contacts/jane%40example.com');
    expect(await screen.findAllByText('Page 0')).toBeTruthy();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Pages' })).getByRole('button', { name: 'Next page' }));
    expect(await screen.findAllByText('Page 1')).toBeTruthy();
    expect(calls.filter((call) => call.path.endsWith('/emails')).at(-1)?.search.get('size')).toBe('25');
  });
});

function activity(id: number, occurredAt: string, overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id,
    kind: 'OPEN',
    emailId: 'e1',
    subject: `Email ${id}`,
    recipients: 'jane@example.com',
    occurredAt,
    source: 'GMAIL_PROXY',
    linkUrl: null,
    shouldNotify: true,
    alertType: null,
    alertText: null,
    ...overrides,
  };
}

describe('Activity', () => {
  it('groups by day in the settings zone, filters by kind and loads older items', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T07:00:00Z'));
    const calls = mockApi({
      'GET /api/activity': (call) => {
        if (call.search.get('before') === '3') return { body: { items: [activity(1, '2026-10-20T10:00:00Z')], lastId: 4, hasMore: false } };
        return {
          body: {
            items: [
              activity(3, '2026-10-29T10:00:00Z', { openNumber: 3, account: 'me@gmail.com', gmailThreadId: '18a0b2c3d4e5f6a7' }),
              activity(4, '2026-10-30T06:00:00Z', { kind: 'DOC_READ', documentId: 'd1', documentName: 'Resume.pdf', readSeconds: 134, pagesViewed: 3, pageCount: 3 }),
            ],
            lastId: 4,
            hasMore: true,
          },
        };
      },
    });
    const router = renderAt('/activity');
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeTruthy();
    expect(screen.getByText('2 min 14 s · 3/3 pages')).toBeTruthy();
    expect(screen.getByText('Opened again')).toBeTruthy();
    expect(screen.getByText('3rd open · Gmail')).toBeTruthy();
    const gmail = screen.getByRole('link', { name: 'Open in Gmail: Email 3' });
    expect(gmail.getAttribute('href')).toBe('https://mail.google.com/mail/?authuser=me%40gmail.com#all/18a0b2c3d4e5f6a7');
    expect(screen.getByRole('link', { name: /Resume\.pdf/ }).getAttribute('href')).toBe('/documents/d1');

    await userEvent.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByText('Email 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Documents' }));
    await waitFor(() => expect(router.state.location.search).toBe('?show=documents'));
    await waitFor(() => expect(calls.at(-1)?.search.get('kinds')).toBe('DOC_VIEW,DOC_READ,DOC_DOWNLOAD'));
  });
});

describe('Extension tokens', () => {
  it('filters the tokens in the browser as you type, without a request', async () => {
    const calls = mockApi({
      'GET /api/tokens': {
        body: [
          { id: 't1', name: 'Old laptop', prefix: 'mp_Zx9q', createdAt: '2026-10-01T09:00:00Z', lastUsedAt: null, revokedAt: null },
          { id: 't2', name: 'Chrome extension', prefix: 'mp_Ab3d', createdAt: '2026-10-02T09:00:00Z', lastUsedAt: null, revokedAt: null },
        ],
      },
    });
    const router = renderAt('/tokens');
    const table = await screen.findByRole('table', { name: 'Tokens' });
    await within(table).findByText('Old laptop');
    const before = calls.length;
    await typeAndPause(screen.getByRole('searchbox', { name: 'Search tokens' }), 'chrome');
    await waitFor(() => expect(within(table).queryByText('Old laptop')).toBeNull());
    expect(within(table).getByText('Chrome extension')).toBeTruthy();
    expect(router.state.location.search).toBe('?q=chrome');
    expect(calls.slice(before).filter((call) => call.path === '/api/tokens')).toHaveLength(0);
  });

  it('shows a new token once in a dialog and asks before revoking', async () => {
    const calls = mockApi({
      'GET /api/tokens': { body: [{ id: 't1', name: 'Old laptop', prefix: 'mp_Zx9q', createdAt: '2026-10-01T09:00:00Z', lastUsedAt: null, revokedAt: null }] },
      'POST /api/tokens': { status: 201, body: { id: 't2', name: 'Chrome extension', prefix: 'mp_abcd', token: 'mp_abcdefghijklmnopqrstuvwx', createdAt: '2026-10-29T10:00:00Z' } },
      'DELETE /api/tokens/t1': { status: 204 },
    });
    renderAt('/tokens');
    await userEvent.click(await screen.findByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Copy your new token' });
    expect(within(dialog).getByTestId('new-token').textContent).toBe('mp_abcdefghijklmnopqrstuvwx');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The table and the phone list both render in jsdom; use the table's button.
    await userEvent.click(within(screen.getByRole('table', { name: 'Tokens' })).getByRole('button', { name: 'Revoke Old laptop' }));
    const confirm = await screen.findByRole('dialog', { name: 'Revoke "Old laptop"?' });
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/tokens/t1')).toBe(true));
    expect(await screen.findByText('"Old laptop" revoked')).toBeTruthy();
  });
});

vi.setConfig({ testTimeout: 60_000 });
