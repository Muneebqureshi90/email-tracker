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

    const pdf = new File(['%PDF-1.7'], 'Cover letter.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('PDF file'), pdf);
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

    await userEvent.click(screen.getByRole('tab', { name: /Views, reads and downloads/ }));
    const read = await screen.findByText('Read: 2 min 14 s, 2 pages');
    const events = read.closest('table')!;
    expect(events.getAttribute('aria-label')).toBe('Views, reads and downloads');
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

vi.setConfig({ testTimeout: 60_000 });
