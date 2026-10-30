import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import type { EmailSummary, Settings } from '../api/types';
import { routes } from '../router';

export interface Call {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
}

type Answer = { status?: number; body?: unknown };
type Handler = Answer | ((call: Call) => Answer);

/**
 * Stubs fetch with answers keyed by "METHOD /path". Unknown requests fail the test with a 599.
 * A signed-in owner is assumed unless the test overrides GET /api/auth/status.
 */
export function mockApi(handlers: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  const all: Record<string, Handler> = {
    'GET /api/auth/status': { body: { setupRequired: false, authenticated: true } },
    'GET /api/alerts': { body: { items: [], page: 0, size: 25, total: 0, newCount: 0 } },
    'GET /api/settings': { body: SETTINGS },
    ...handlers,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init: RequestInit = {}) => {
      const url = new URL(input, 'http://127.0.0.1:8080');
      const call: Call = {
        method: init.method ?? 'GET',
        path: url.pathname,
        search: url.searchParams,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      };
      calls.push(call);
      const handler = all[`${call.method} ${call.path}`];
      const answer = typeof handler === 'function' ? handler(call) : (handler ?? { status: 599, body: { detail: `No mock for ${call.method} ${call.path}` } });
      const status = answer.status ?? 200;
      return Promise.resolve(
        new Response(status === 204 || answer.body === undefined ? null : JSON.stringify(answer.body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
  return calls;
}

export function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

export const SETTINGS: Settings = {
  trackingDefault: true,
  linkTrackingDefault: false,
  sendGraceSeconds: 10,
  selfViewWindowSeconds: 30,
  dedupeWindowSeconds: 60,
  followUpHours: 48,
  spikeOpens: 3,
  spikeWindowMinutes: 60,
  revivalDays: 7,
  retentionDays: 365,
  ipMode: 'TRUNCATED',
  countApplePrefetch: false,
  notifyOpens: true,
  notifyClicks: true,
  notifyAlerts: true,
  timeZone: 'Asia/Karachi',
  sendMode: 'PRESYNC',
  dnrBlocking: true,
  trackConfidential: true,
  timeZoneSource: 'USER',
  notifyOn: 'EVERY',
  notifyDocuments: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  docReadSeconds: 30,
};

export function email(overrides: Partial<EmailSummary> = {}): EmailSummary {
  return {
    id: '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11',
    account: 'me@gmail.com',
    subject: 'Quarterly plan',
    status: 'SENT',
    createdAt: '2026-10-29T09:00:00Z',
    sentAt: '2026-10-29T09:00:05Z',
    recipients: [{ email: 'jane@example.com', name: 'Jane Doe', kind: 'TO' }],
    openCount: 2,
    clickCount: 0,
    firstOpenedAt: '2026-10-29T09:30:00Z',
    lastOpenedAt: '2026-10-29T10:00:00Z',
    lastClickedAt: null,
    openStatusUnreliable: false,
    ...overrides,
  };
}

export const page = <T,>(items: T[], total = items.length) => ({ items, page: 0, size: 25, total });
