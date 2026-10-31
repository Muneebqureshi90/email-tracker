import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bestWindow } from '../pages/ReportsPage';
import { mockApi, renderAt } from './helpers';

const WEEK = { from: '2026-10-26T00:00:00Z', to: '2026-10-31T12:00:00Z', sent: 7, opened: 4, clicked: 2, documentViews: 3 };
const CELLS = [
  { weekday: 2, hour: 9, opens: 6 },
  { weekday: 2, hour: 10, opens: 4 },
  { weekday: 5, hour: 15, opens: 2 },
];

describe('best time to send and this week', () => {
  it('shows this week and a heat grid with the busiest two hours', async () => {
    mockApi({
      'GET /api/reports/this-week': { body: WEEK },
      'GET /api/reports/best-time': { body: { timezone: 'Asia/Karachi', totalOpens: 12, cells: CELLS } },
    });
    renderAt('/reports');
    expect(await screen.findByText('Recruiters open your emails most on Tuesday 9–11.')).toBeTruthy();
    expect(screen.getByLabelText('Tuesday 10:00: 4 opens')).toBeTruthy();
    expect(screen.getByLabelText('Friday 15:00: 2 opens')).toBeTruthy();
    expect(await screen.findByText('Document views')).toBeTruthy();
    expect(screen.getByText('This week')).toBeTruthy();
  });

  it('shows an empty state with fewer than 10 opens', async () => {
    mockApi({
      'GET /api/reports/this-week': { body: WEEK },
      'GET /api/reports/best-time': { body: { timezone: 'UTC', totalOpens: 3, cells: CELLS.slice(2) } },
    });
    renderAt('/reports');
    expect(await screen.findByText('Not enough opens yet (3 of 10 needed in the last 180 days)')).toBeTruthy();
    expect(screen.queryByText(/Recruiters open your emails most/)).toBeNull();
  });

  it('picks the two neighbouring hours with the most opens', () => {
    expect(bestWindow(CELLS)).toBe('Tuesday 9–11');
    expect(bestWindow([{ weekday: 7, hour: 22, opens: 1 }, { weekday: 7, hour: 23, opens: 5 }])).toBe('Sunday 22–24');
  });
});
