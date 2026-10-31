import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, formatMinutes } from '../api/system';
import { mockApi, renderAt } from './helpers';

const HOUR = 3_600_000;

function status(downtimes: { from: string; to: string; minutes: number }[]) {
  return {
    lastHeartbeatAt: new Date(Date.now() - 30_000).toISOString(),
    downtimes,
    databaseBytes: 12 * 1024 * 1024,
    documentBytes: 2048,
    emails: 7,
    documents: 1,
  };
}

const RECENT = [
  { from: new Date(Date.now() - 5 * HOUR).toISOString(), to: new Date(Date.now() - 3 * HOUR).toISOString(), minutes: 120 },
  { from: new Date(Date.now() - 50 * HOUR).toISOString(), to: new Date(Date.now() - 48 * HOUR - 40 * 60_000).toISOString(), minutes: 80 },
];

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('system status', () => {
  it('formats durations and sizes', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(200)).toBe('3 h 20 min');
    expect(formatMinutes(1500)).toBe('1 d 1 h');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('shows the Overview banner for downtime in the last 7 days and hides it when dismissed', async () => {
    mockApi({ 'GET /api/system/status': { body: status(RECENT) } });
    renderAt('/');
    const banner = await screen.findByText(/MailPulse was off 2 times in the last 7 days \(3 h 20 min in total\)/);
    expect(within(banner).getByRole('link', { name: 'Details' }).getAttribute('href')).toBe('/account');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/MailPulse was off/)).toBeNull();
  });

  it('shows no banner without recent downtime', async () => {
    const old = [{ from: new Date(Date.now() - 10 * 24 * HOUR).toISOString(), to: new Date(Date.now() - 9 * 24 * HOUR).toISOString(), minutes: 1440 }];
    const calls = mockApi({ 'GET /api/system/status': { body: status(old) } });
    renderAt('/');
    await screen.findByRole('heading', { name: 'Overview' });
    await vi.waitFor(() => expect(calls.some((call) => call.path === '/api/system/status')).toBe(true));
    expect(screen.queryByText(/MailPulse was off/)).toBeNull();
  });

  it('lists storage and downtime on the Account page', async () => {
    mockApi({ 'GET /api/system/status': { body: status(RECENT) } });
    renderAt('/account');
    expect(await screen.findByText('12 MB')).toBeTruthy();
    expect(screen.getByText('2.0 KB (1 document)')).toBeTruthy();
    expect(screen.getByText('2 h')).toBeTruthy();
    expect(screen.getByText('1 h 20 min')).toBeTruthy();
  });
});
