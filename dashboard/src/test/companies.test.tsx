import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CompanySummary } from '../api/companies';
import { mockApi, page, renderAt } from './helpers';

const acme: CompanySummary = { domain: 'acme.com', contacts: 2, emails: 5, opened: 4, clicked: 1, replied: 1, lastActivityAt: '2026-10-30T10:00:00Z' };
const beta: CompanySummary = { domain: 'beta.io', contacts: 1, emails: 9, opened: 2, clicked: 0, replied: 0, lastActivityAt: null };
const personal: CompanySummary = { domain: null, contacts: 3, emails: 1, opened: 0, clicked: 0, replied: 0, lastActivityAt: null };

describe('Companies tab', () => {
  it('lists companies by emails, shows personal addresses and filters by search', async () => {
    mockApi({
      'GET /api/contacts': { body: page([]) },
      'GET /api/contacts/companies': { body: [acme, personal, beta] },
    });
    const router = renderAt('/contacts');
    await userEvent.click(await screen.findByRole('tab', { name: 'Companies' }));
    expect(router.state.location.search).toContain('view=companies');
    const table = await screen.findByRole('table', { name: 'Companies' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['beta.io', 'acme.com', 'Personal addresses']);
    expect(within(rows[1] as HTMLElement).getByText('20%')).toBeTruthy();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search companies' }), 'acme');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));

    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(await screen.findByRole('searchbox', { name: 'Search contacts' })).toBeTruthy();
  });
});
