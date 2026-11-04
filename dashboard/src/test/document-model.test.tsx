import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocEventView, DocumentSummary } from '../api/types';
import { mockApi, page, renderAt } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const SUMMARY: DocumentSummary = {
  id: 'd1',
  name: 'Resume.pdf',
  sizeBytes: 184_320,
  pageCount: 2,
  version: 1,
  createdAt: '2026-10-30T09:00:00Z',
  updatedAt: '2026-10-30T09:00:00Z',
  views: 2,
  reads: 0,
  downloads: 0,
  lastActivityAt: '2026-10-31T08:00:00Z',
};

function view(overrides: Partial<DocEventView>): DocEventView {
  return {
    id: 1,
    linkId: 'l1',
    type: 'DOC_VIEW',
    at: '2026-10-31T08:00:00Z',
    verdict: 'COUNTED',
    reason: null,
    source: 'DIRECT',
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    ipPrefix: '203.0.113.0/24',
    readSeconds: null,
    pagesViewed: null,
    deviceModel: null,
    ...overrides,
  };
}

describe('Document events', () => {
  it('shows the phone model an Android browser reported, and nothing for a view without one', async () => {
    const samsung = view({ id: 1, deviceModel: 'SM-S911B' });
    const iphone = view({ id: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', deviceModel: null });
    mockApi({
      'GET /api/documents/d1': { body: { summary: SUMMARY, links: [], events: [samsung, iphone] } },
      'GET /api/documents/d1/links': { body: page([]) },
      'GET /api/documents/d1/events': { body: page([samsung, iphone]) },
    });
    renderAt('/documents/d1');
    await userEvent.click(await screen.findByRole('tab', { name: /All events/ }));
    const model = await screen.findByText('Device: Samsung Galaxy S series (SM-S911B)');
    const table = model.closest('table')!;
    expect(table.getAttribute('aria-label')).toBe('All events');
    expect(within(table).getAllByText(/^Device:/)).toHaveLength(1);
  });
});
