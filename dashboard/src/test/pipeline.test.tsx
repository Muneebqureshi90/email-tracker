import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '../api/applications';
import { email, mockApi, renderAt } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

function application(overrides: Partial<Application>): Application {
  return {
    id: 'a1',
    company: 'Acme',
    role: 'Backend engineer',
    status: 'APPLIED',
    appliedOn: '2026-10-20',
    notes: null,
    emailId: null,
    emailSubject: null,
    opens: 0,
    clicks: 0,
    createdAt: '2026-10-20T09:00:00Z',
    updatedAt: '2026-10-20T09:00:00Z',
    ...overrides,
  };
}

describe('PipelinePage', () => {
  it('shows the four columns with counts and the linked email with its opens and clicks', async () => {
    mockApi({
      'GET /api/applications': {
        body: [
          application({ id: 'a1', company: 'Acme', emailId: 'e1', emailSubject: 'Application: backend role', opens: 3, clicks: 1 }),
          application({ id: 'a2', company: 'Globex', role: 'Platform engineer', status: 'INTERVIEW' }),
        ],
      },
    });
    renderAt('/pipeline');

    const applied = await screen.findByRole('region', { name: /Applied/ });
    expect(within(applied).getByText('Acme')).toBeTruthy();
    expect(within(applied).getByText('1')).toBeTruthy();
    expect(within(applied).getByText('Opened 3×')).toBeTruthy();
    expect(within(applied).getByText('Clicked')).toBeTruthy();
    expect(within(applied).getByRole('link', { name: 'Application: backend role' }).getAttribute('href')).toBe('/emails/e1');
    expect(within(screen.getByRole('region', { name: /Interview/ })).getByText('Globex')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: /Offer/ })).getByText('0')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: /Rejected/ })).getByText('Nothing here.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pipeline' })).toBeTruthy();
  });

  it('moves a card to the next status with a button', async () => {
    const calls = mockApi({
      'GET /api/applications': { body: [application({})] },
      'PATCH /api/applications/a1': (call) => ({ body: application({ status: (call.body as { status: Application['status'] }).status }) }),
    });
    renderAt('/pipeline');

    await userEvent.click(await screen.findByRole('button', { name: 'Move Acme to Interview' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH' && call.path === '/api/applications/a1')).toBe(true));
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'INTERVIEW' });
  });

  it('explains the empty board and adds an application from the form', async () => {
    let items: Application[] = [];
    const calls = mockApi({
      'GET /api/applications': () => ({ body: items }),
      'POST /api/applications': (call) => {
        const created = application({ ...(call.body as Partial<Application>), id: 'a9' });
        items = [created];
        return { status: 201, body: created };
      },
      'GET /api/emails': { body: { items: [], page: 0, size: 50, total: 0 } },
    });
    renderAt('/pipeline');

    expect(await screen.findByText('No applications yet')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Add application' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add application' });
    await userEvent.type(within(dialog).getByLabelText('Company'), 'Initech');
    await userEvent.type(within(dialog).getByLabelText('Role'), 'Data engineer');
    await userEvent.type(within(dialog).getByLabelText('Notes'), 'Referred by <b>Sam</b>');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add application' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      company: 'Initech',
      role: 'Data engineer',
      status: 'APPLIED',
      appliedOn: null,
      notes: 'Referred by <b>Sam</b>',
      emailId: null,
    });
    expect(await screen.findByText('Initech')).toBeTruthy();
    expect(screen.getByText('Referred by <b>Sam</b>')).toBeTruthy();
  });

  it('links a tracked email from the form and sends its id', async () => {
    const calls = mockApi({
      'GET /api/applications': { body: [] },
      'GET /api/emails': { body: { items: [email({ id: 'e7', subject: 'Backend role at Hooli' })], page: 0, size: 50, total: 1 } },
      'POST /api/applications': (call) => ({ status: 201, body: application({ ...(call.body as Partial<Application>), id: 'a7' }) }),
    });
    renderAt('/pipeline');

    await userEvent.click(await screen.findByRole('button', { name: 'Add application' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add application' });
    await userEvent.type(within(dialog).getByLabelText('Company'), 'Hooli');
    await userEvent.type(within(dialog).getByLabelText('Role'), 'Backend engineer');
    const linked = within(dialog).getByRole('combobox', { name: /Linked email/ });
    expect(linked.textContent).toContain('None');
    await userEvent.click(linked);
    await userEvent.click(await screen.findByRole('option', { name: 'Backend role at Hooli — jane@example.com' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add application' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({ company: 'Hooli', emailId: 'e7' });
  });

  it('deletes an application after confirming', async () => {
    let items: Application[] = [application({})];
    const calls = mockApi({
      'GET /api/applications': () => ({ body: items }),
      'DELETE /api/applications/a1': () => {
        items = [];
        return { status: 204 };
      },
    });
    renderAt('/pipeline');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Acme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this application?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/applications/a1')).toBe(true));
    expect(await screen.findByText('No applications yet')).toBeTruthy();
  });
});
