import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ActivityItem } from '../api/types';
import { ActivityList } from '../components/ActivityList';
import { mockApi, page, renderAt } from './helpers';

const THIS_WEEK = { from: '2026-10-26T00:00:00Z', to: '2026-10-31T12:00:00Z', sent: 7, opened: 4, clicked: 2, documentViews: 3 };
const LAST_WEEK = { from: '2026-10-19T00:00:00Z', to: '2026-10-26T00:00:00Z', sent: 12, opened: 8, replied: 3, interviews: 1, documentViews: 5 };
const TEXT = 'Last week: 12 sent, 8 opened, 3 replied, 1 interview';
const ALERT = {
  id: 'a-weekly',
  type: 'WEEKLY',
  text: TEXT,
  status: 'NEW',
  createdAt: new Date().toISOString(),
  snoozedUntil: null,
  emailId: null,
  subject: null,
  recipients: '',
};

describe('weekly summary alert', () => {
  it('shows a Last week card on Reports', async () => {
    mockApi({
      'GET /api/reports/this-week': { body: THIS_WEEK },
      'GET /api/reports/last-week': { body: LAST_WEEK },
      'GET /api/reports/best-time': { body: { timezone: 'UTC', totalOpens: 0, cells: [] } },
    });
    renderAt('/reports');
    const card = await screen.findByRole('region', { name: 'Last week' });
    expect(await screen.findByText('CV views')).toBeTruthy();
    expect(card.textContent).toContain('Replied');
    expect(card.textContent).toContain('Interviews');
    expect(card.textContent).toContain('12');
  });

  it('links a WEEKLY activity item to Reports, with no Gmail button', () => {
    const item: ActivityItem = {
      id: 9,
      kind: 'ALERT',
      emailId: null,
      subject: null,
      recipients: '',
      occurredAt: new Date().toISOString(),
      source: null,
      linkUrl: null,
      shouldNotify: true,
      alertType: 'WEEKLY',
      alertText: TEXT,
      documentId: null,
    };
    render(
      <MemoryRouter>
        <ActivityList items={[item]} now={Date.now()} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/reports');
    expect(link.textContent).toContain('Weekly summary');
    expect(link.textContent).toContain(TEXT);
  });

  it('shows a WEEKLY alert linked to Reports on the Alerts page', async () => {
    mockApi({ 'GET /api/alerts': { body: page([ALERT]) } });
    renderAt('/alerts');
    expect(await screen.findByText(TEXT)).toBeTruthy();
    expect(screen.getByText('Weekly summary')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See reports' }).getAttribute('href')).toBe('/reports');
  });
});
