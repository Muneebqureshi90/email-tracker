import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { email, mockApi, page, renderAt } from './helpers';

const ID = '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11';
const REPORT = {
  period: 'DAY',
  start: '2026-10-30',
  end: '2026-10-31',
  timeZone: 'Asia/Karachi',
  sent: 1,
  openedEmails: 1,
  openRate: 1,
  opens: 1,
  clicks: 0,
  buckets: [{ label: '11:00', opens: 1, clicks: 0 }],
  topEmails: [],
  topContacts: [],
};
const DETAIL = {
  summary: email(),
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
const CONTACT = {
  summary: { email: 'jane@example.com', name: 'Jane Doe', emails: 1, openedEmails: 1, opens: 2, clicks: 0, firstSeenAt: '2026-10-29T09:00:00Z', lastEmailedAt: null, lastOpenedAt: null },
  emails: [email()],
};

const PAGES: [path: string, title: string][] = [
  ['/', 'Overview'],
  ['/emails', 'Emails'],
  [`/emails/${ID}`, 'Quarterly plan'],
  ['/activity', 'Activity'],
  ['/alerts', 'Alerts'],
  ['/contacts', 'Contacts'],
  ['/contacts/jane%40example.com', 'Jane Doe'],
  ['/reports', 'Reports'],
  ['/settings', 'Settings'],
  ['/tokens', 'Extension tokens'],
  ['/account', 'Account & data'],
];

describe('every page at 360 px', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    window.dispatchEvent(new Event('resize'));
  });

  it.each(PAGES)('%s renders its title in the top bar', async (path, title) => {
    mockApi({
      'GET /api/reports/daily': { body: REPORT },
      'GET /api/reports/weekly': { body: { ...REPORT, period: 'WEEK' } },
      'GET /api/activity': { body: { items: [], lastId: 0 } },
      'GET /api/emails': { body: page([email()]) },
      'GET /api/accounts': { body: ['me@gmail.com'] },
      [`GET /api/emails/${ID}`]: { body: DETAIL },
      'GET /api/contacts': { body: page([CONTACT.summary]) },
      'GET /api/contacts/jane%40example.com': { body: CONTACT },
      'GET /api/tokens': { body: [] },
    });
    renderAt(path);
    const topBar = await screen.findByTestId('top-bar');
    expect(await within(topBar).findByRole('heading', { level: 1, name: title })).toBeTruthy();
  });

  it('shows the not-found page for an unknown address', async () => {
    mockApi({});
    renderAt('/no-such-page');
    expect(await screen.findByText('Page not found')).toBeTruthy();
  });
});

vi.setConfig({ testTimeout: 60_000 });
