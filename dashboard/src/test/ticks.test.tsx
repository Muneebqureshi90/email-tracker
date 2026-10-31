import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EmailDetail } from '../api/types';
import { StatusMark, markOf } from '../components/marks';
import { email, mockApi, renderAt } from './helpers';

const DOUBLE = 'M1 8.6l3 3L10.6 5M7 11.6L13.6 5';
const SINGLE = 'M3 8.6l3 3L13 4.6';
const unopened = { openCount: 0, clickCount: 0, firstOpenedAt: null, lastOpenedAt: null };

describe('ticks: sent, delivered, opened', () => {
  it('picks the tick from opens, clicks and deliveredAt', () => {
    expect(markOf(email(unopened))).toMatchObject({ state: 'sent', label: 'Sent' });
    expect(markOf(email({ ...unopened, deliveredAt: null }))).toMatchObject({ state: 'sent', label: 'Sent' });
    expect(markOf(email({ ...unopened, deliveredAt: '2026-10-29T09:01:00Z' }))).toMatchObject({ state: 'delivered', label: 'Delivered' });
    expect(markOf(email({ openCount: 1, deliveredAt: '2026-10-29T09:01:00Z' }))).toMatchObject({ state: 'opened', label: 'Opened' });
    expect(markOf(email({ ...unopened, clickCount: 1, deliveredAt: null })).state).toBe('clicked');
    expect(markOf(email({ ...unopened, openStatusUnreliable: true })).state).toBe('unreliable');
    expect(markOf(email({ ...unopened, deliveredAt: '2026-10-29T09:01:00Z', status: 'DRAFT' })).state).toBe('none');
  });

  it('draws a grey double tick for sent and delivered (D-132), a green double for opened, a single for unreliable', () => {
    const { unmount } = render(<StatusMark email={email(unopened)} />);
    let mark = screen.getByRole('img', { name: 'Sent' });
    expect(mark.className).toContain('text-muted');
    expect(mark.querySelector('path')?.getAttribute('d')).toBe(DOUBLE);
    unmount();

    const unreliable = render(<StatusMark email={email({ ...unopened, openStatusUnreliable: true })} />);
    mark = screen.getByRole('img', { name: /open status may be unreliable/ });
    expect(mark.querySelector('path')?.getAttribute('d')).toBe(SINGLE);
    unreliable.unmount();

    const delivered = render(<StatusMark email={email({ ...unopened, deliveredAt: '2026-10-29T09:01:00Z' })} showLabel />);
    mark = screen.getByRole('img', { name: 'Delivered' });
    expect(mark.className).toContain('text-muted');
    expect(mark.querySelector('path')?.getAttribute('d')).toBe(DOUBLE);
    expect(mark.textContent).toContain('Delivered');
    delivered.unmount();

    render(<StatusMark email={email({ openCount: 1 })} />);
    mark = screen.getByRole('img', { name: 'Opened' });
    expect(mark.className).toContain('text-good');
    expect(mark.querySelector('path')?.getAttribute('d')).toBe(DOUBLE);
  });

  it('shows the delivered tick and time on the email page until the first open', async () => {
    const detail: EmailDetail = {
      summary: email({ ...unopened, deliveredAt: '2026-10-29T09:01:00Z' }),
      trackOpens: true,
      trackLinks: false,
      trackingEnabled: true,
      notifications: true,
      followUpHours: null,
      gmailMessageId: '18a1',
      gmailThreadId: '18a0',
      cancelledAt: null,
      links: [],
      events: [],
    };
    mockApi({ [`GET /api/emails/${detail.summary.id}`]: { body: detail } });
    renderAt(`/emails/${detail.summary.id}`);
    const mark = await screen.findByRole('img', { name: 'Delivered' });
    expect(mark.querySelector('path')?.getAttribute('d')).toBe(DOUBLE);
    expect(screen.getByText(/^Delivered \S/)).toBeTruthy();
  });
});
