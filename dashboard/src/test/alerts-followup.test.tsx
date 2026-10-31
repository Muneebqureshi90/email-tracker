import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderAt } from './helpers';

const noReply = {
  id: 'n1',
  type: 'NO_REPLY',
  text: 'Opened 4 times, no reply yet: a good time to follow up',
  status: 'NEW',
  createdAt: new Date().toISOString(),
  snoozedUntil: null,
  emailId: 'e42',
  subject: 'Application: Backend Engineer',
  recipients: 'Hiring team',
};

describe('follow-up alerts', () => {
  it('shows the opened-several-times, no-reply alert with its text and a link to the email', async () => {
    mockApi({ 'GET /api/alerts': { body: { items: [noReply], page: 0, size: 25, total: 1, newCount: 1 } } });
    renderAt('/alerts');
    expect(await screen.findByText('Opened 4 times, no reply yet: a good time to follow up')).toBeTruthy();
    expect(screen.getByText('No reply yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Application: Backend Engineer' }).getAttribute('href')).toBe('/emails/e42');
  });

  it('still lists an alert of a kind the page does not know', async () => {
    mockApi({ 'GET /api/alerts': { body: { items: [{ ...noReply, id: 'u1', type: 'SOMETHING_NEW', text: 'A new kind of alert' }], page: 0, size: 25, total: 1, newCount: 1 } } });
    renderAt('/alerts');
    expect(await screen.findByText('A new kind of alert')).toBeTruthy();
    expect(screen.getByText('Alert')).toBeTruthy();
  });
});
