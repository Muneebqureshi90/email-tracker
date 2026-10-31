import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocEventView, DocLinkView, DocumentSummary } from '../api/types';
import { mockApi, page, renderAt } from './helpers';

afterEach(() => vi.unstubAllGlobals());

function summary(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id: 'd1',
    name: 'Resume.pdf',
    sizeBytes: 184_320,
    pageCount: 2,
    version: 1,
    createdAt: '2026-10-30T09:00:00Z',
    updatedAt: '2026-10-30T09:00:00Z',
    views: 3,
    reads: 2,
    downloads: 1,
    lastActivityAt: '2026-10-31T08:00:00Z',
    ...overrides,
  };
}

function link(overrides: Partial<DocLinkView> = {}): DocLinkView {
  return {
    id: 'l1',
    url: 'https://mailhome.example.ts.net/d/AbCdEfGhIjKlMnOpQrStUvWx',
    label: null,
    emailId: 'e1',
    emailSubject: 'Application For Java Developer',
    recipients: 'hr@example.com',
    createdAt: '2026-10-30T09:05:00Z',
    expiresAt: null,
    revokedAt: null,
    allowDownload: true,
    views: 3,
    reads: 2,
    downloads: 1,
    lastActivityAt: '2026-10-31T08:00:00Z',
    ...overrides,
  };
}

const READ: DocEventView = {
  id: 7,
  linkId: 'l1',
  type: 'DOC_READ',
  at: '2026-10-31T08:00:00Z',
  verdict: 'COUNTED',
  reason: null,
  source: 'DIRECT',
  userAgent: 'Mozilla/5.0',
  ipPrefix: '203.0.113.0/24',
  readSeconds: 134,
  pagesViewed: 2,
};

/** XMLHttpRequest stand-in for uploads (the API client uses it for progress); answers 201 with `body`. */
function fakeUpload(body: unknown) {
  const sent: { method: string; path: string; file: unknown }[] = [];
  class FakeXhr {
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    status = 0;
    responseText = '';
    withCredentials = false;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private method = '';
    private path = '';
    open(method: string, path: string) {
      this.method = method;
      this.path = path;
    }
    setRequestHeader() {}
    abort() {}
    send(form: FormData) {
      sent.push({ method: this.method, path: this.path, file: form.get('file') });
      this.status = 201;
      this.responseText = JSON.stringify(body);
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return sent;
}

describe('Documents', () => {
  it('lists documents with their counts and uploads a PDF', async () => {
    mockApi({ 'GET /api/documents': { body: [summary()] } });
    const sent = fakeUpload(summary({ id: 'd2', name: 'Cover letter.pdf' }));
    renderAt('/documents');
    const table = await screen.findByRole('table', { name: 'Documents' });
    const row = (await within(table).findByText('Resume.pdf')).closest('tr')!;
    expect(within(row).getByText('180 KB · 2 pages')).toBeTruthy();
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent).slice(1, 4)).toEqual(['3', '2', '1']);

    expect(screen.getByText('No PDF chosen')).toBeTruthy();
    const pdf = new File(['%PDF-1.7'], 'Cover letter.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('PDF file'), pdf);
    expect(screen.getByText('Cover letter.pdf')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'POST', path: '/api/documents', file: pdf });
    expect(await screen.findByText('"Cover letter.pdf" uploaded')).toBeTruthy();
  });

  it('refuses a file over 10 MB before uploading it', async () => {
    mockApi({ 'GET /api/documents': { body: [] } });
    const sent = fakeUpload(summary());
    renderAt('/documents');
    expect(await screen.findByText('No documents yet')).toBeTruthy();
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'Huge.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('PDF file'), big);
    expect(screen.getByRole('alert').textContent).toContain('up to 10 MB');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Upload' }).disabled).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('asks before deleting a document', async () => {
    const calls = mockApi({ 'GET /api/documents': { body: [summary()] }, 'DELETE /api/documents/d1': { status: 204 } });
    renderAt('/documents');
    const table = await screen.findByRole('table', { name: 'Documents' });
    await userEvent.click(await within(table).findByRole('button', { name: 'Delete Resume.pdf' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete "Resume.pdf"?' });
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/documents/d1')).toBe(true));
  });

  it('shows a document: totals, its links, and every view with the reading time', async () => {
    mockApi({
      'GET /api/documents/d1': { body: { summary: summary(), links: [link()], events: [READ] } },
      'GET /api/documents/d1/links': { body: page([link()]) },
      'GET /api/documents/d1/events': { body: page([READ]) },
    });
    renderAt('/documents/d1');
    const row = (await screen.findByText('To hr@example.com')).closest('tr')!;
    expect(row.closest('table')?.getAttribute('aria-label')).toBe('Links');
    expect(within(row).getByText('Application For Java Developer')).toBeTruthy();
    expect(within(row).getByText('Active')).toBeTruthy();

    // The cards count only counted events; the hint says why the All events list can hold more.
    expect(screen.getByText('Bots, link previews and your own views are listed under All events but not counted.')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: /All events/ }));
    const read = await screen.findByText('Read: 2 min 14 s, 2 pages');
    const events = read.closest('table')!;
    expect(events.getAttribute('aria-label')).toBe('All events');
    expect(within(events).getByText('Counted')).toBeTruthy();
    expect(within(events).getByText('Application For Java Developer')).toBeTruthy();
  });

  it('creates a share link and shows its address to copy', async () => {
    const calls = mockApi({
      'GET /api/documents/d1': { body: { summary: summary(), links: [], events: [] } },
      'GET /api/documents/d1/links': { body: page([]) },
      'GET /api/documents/d1/events': { body: page([]) },
      'POST /api/documents/d1/links': { status: 201, body: link({ id: 'l2', label: 'LinkedIn', emailId: null, emailSubject: null, recipients: null, allowDownload: false }) },
    });
    renderAt('/documents/d1');
    await userEvent.type(await screen.findByLabelText('Name (only you see it)'), 'LinkedIn');
    await userEvent.click(screen.getByRole('switch', { name: /Allow download/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
    const dialog = await screen.findByRole('dialog', { name: 'Your new link' });
    expect(within(dialog).getByTestId('new-link').textContent).toBe('https://mailhome.example.ts.net/d/AbCdEfGhIjKlMnOpQrStUvWx');
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ label: 'LinkedIn', allowDownload: false });
  });
});

describe('Document reading insights and link limits', () => {
  const base = {
    'GET /api/documents/d1/links': { body: page([]) },
    'GET /api/documents/d1/events': { body: page([]) },
  };

  it('shows the time per page and highlights the most-read page', async () => {
    mockApi({
      ...base,
      'GET /api/documents/d1': { body: { summary: summary(), links: [], events: [] } },
      'GET /api/documents/d1/pages': {
        body: [
          { page: 2, seconds: 90, readers: 1 },
          { page: 1, seconds: 45, readers: 2 },
        ],
      },
    });
    renderAt('/documents/d1');
    const list = await screen.findByRole('list', { name: 'Time per page' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]?.textContent).toBe('Page 1 · 45 s · 2 readers');
    expect(items[1]?.textContent).toBe('Page 2 · 1 min 30 s · 1 readerMost read');
  });

  it('says when nobody has read the document yet', async () => {
    mockApi({
      ...base,
      'GET /api/documents/d1': { body: { summary: summary(), links: [], events: [] } },
      'GET /api/documents/d1/pages': { body: [] },
    });
    renderAt('/documents/d1');
    expect(await screen.findByText('No reading time yet')).toBeTruthy();
  });

  it('sends an expiry and a view limit with a new link', async () => {
    const calls = mockApi({
      ...base,
      'GET /api/documents/d1': { body: { summary: summary(), links: [], events: [] } },
      'GET /api/documents/d1/pages': { body: [] },
      'POST /api/documents/d1/links': { status: 201, body: { ...link({ id: 'l2' }), maxViews: 5 } },
    });
    renderAt('/documents/d1');
    await userEvent.selectOptions(await screen.findByLabelText('Expires'), '7 days');
    await userEvent.type(screen.getByLabelText('Max views (optional)'), '5');
    const before = Date.now();
    await userEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await screen.findByRole('dialog', { name: 'Your new link' });
    const body = calls.find((call) => call.method === 'POST')?.body as { expiresAt: string; maxViews: number; allowDownload: boolean };
    expect(body.maxViews).toBe(5);
    expect(body.allowDownload).toBe(true);
    const week = 7 * 86_400_000;
    expect(Date.parse(body.expiresAt)).toBeGreaterThanOrEqual(before + week - 1000);
    expect(Date.parse(body.expiresAt)).toBeLessThanOrEqual(Date.now() + week);
  });

  it('refuses a view limit over 1000', async () => {
    mockApi({
      ...base,
      'GET /api/documents/d1': { body: { summary: summary(), links: [], events: [] } },
      'GET /api/documents/d1/pages': { body: [] },
    });
    renderAt('/documents/d1');
    await userEvent.type(await screen.findByLabelText('Max views (optional)'), '1001');
    expect(screen.getByRole('alert').textContent).toContain('from 1 to 1000');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Create link' }).disabled).toBe(true);
  });

  it('shows days left and views used in the links table', async () => {
    const soon = { ...link({ id: 'l1', expiresAt: new Date(Date.now() + 2.5 * 86_400_000).toISOString(), views: 2 }), maxViews: 5 };
    const old = { ...link({ id: 'l3', recipients: 'old@example.com', expiresAt: '2020-01-01T00:00:00Z' }), maxViews: null };
    mockApi({
      'GET /api/documents/d1': { body: { summary: summary(), links: [soon, old], events: [] } },
      'GET /api/documents/d1/links': { body: page([soon, old]) },
      'GET /api/documents/d1/events': { body: page([]) },
      'GET /api/documents/d1/pages': { body: [] },
    });
    renderAt('/documents/d1');
    const row = (await screen.findByText('To hr@example.com')).closest('tr')!;
    expect(within(row).getByText('Expires in 3 days')).toBeTruthy();
    expect(within(row).getByText('2 of 5 views')).toBeTruthy();
    const expired = screen.getByText('To old@example.com').closest('tr')!;
    expect(within(expired).getAllByText('Expired').length).toBeGreaterThan(0);
  });
});

vi.setConfig({ testTimeout: 60_000 });
