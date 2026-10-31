import { Check, Clock, Copy, FileText, Link2, Upload } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  EXPIRY_CHOICES,
  expiresAtFor,
  expiryText,
  maxViewsOf,
  maxViewsProblem,
  useCreateSafeLink,
  useDocumentPages,
  type ExpiryChoice,
} from '../api/documentInsights';
import {
  useDeleteDocument,
  useDocument,
  useDocumentEvents,
  useDocumentLinks,
  useDocuments,
  useRenameDocument,
  useReplaceDocument,
  useUpdateLink,
  useUploadDocument,
} from '../api/queries';
import type { DocEventView, DocLinkView, DocumentDetail, DocumentSummary } from '../api/types';
import { SearchField, Tabs } from '../components/controls';
import { DataTable, MAIN_COLUMN, type Column } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/dialogs';
import { toast, toastError } from '../components/toast';
import { Badge, Button, Card, Empty, ErrorBox, LoadingBlock, PageHeader, Pagination, QueryState, Stat, TextLink, Toggle } from '../components/ui';
import { REASONS, SOURCES, count, duration, fileSize, formatDateTime, formatShortDateTime, relativeTime } from '../lib/format';
import { useNow } from '../lib/now';
import { clampPage, paginate, useListParams } from '../lib/paging';

/** The backend limit (D-077); checked here too so a big file fails before it uploads. */
const MAX_BYTES = 10 * 1024 * 1024;

function pdfProblem(file: File): string | null {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'Choose a PDF file.';
  if (file.size > MAX_BYTES) return `This file is ${fileSize(file.size)}; MailPulse accepts PDFs up to 10 MB.`;
  return null;
}

function sizeLine(document: DocumentSummary): string {
  const pages = document.pageCount ? ` · ${count(document.pageCount, 'page')}` : '';
  return `${fileSize(document.sizeBytes)}${pages}`;
}

async function copyText(text: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast({ title: 'Copy did not work', description: `Select the ${what} and copy it with Ctrl+C.`, tone: 'error' });
    return false;
  }
}

/** A PDF picker with an upload button and a progress bar; used for new documents and new versions. */
function PdfUpload({
  label,
  busy,
  onUpload,
}: {
  label: string;
  busy: boolean;
  onUpload: (file: File, onProgress: (fraction: number) => void) => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const problem = file ? pdfProblem(file) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || problem) return;
    setProgress(0);
    try {
      await onUpload(file, setProgress);
      setFile(null);
      if (input.current) input.current.value = '';
    } finally {
      setProgress(null);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <span id={labelId} className="label">
            PDF file
          </span>
          {/* The native picker is visually hidden; the styled span is its visible face (bug: plain "Choose File"). */}
          <label className="flex min-w-0 cursor-pointer items-center gap-3">
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              className="peer sr-only"
              aria-labelledby={labelId}
              disabled={busy}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <span className="btn btn-quiet shrink-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
              <FileText size={16} aria-hidden="true" />
              Choose PDF
            </span>
            <span className={`min-w-0 truncate text-sm ${file ? 'text-fg' : 'text-muted'}`}>{file ? file.name : 'No PDF chosen'}</span>
          </label>
        </div>
        <Button type="submit" variant="primary" loading={busy} disabled={!file || problem !== null}>
          <Upload size={16} aria-hidden="true" />
          {label}
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-bad">
          {problem}
        </p>
      )}
      {progress !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-chip" role="progressbar" aria-label="Upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <p className="text-xs text-muted">PDF only, up to 10 MB, at most 100 documents. Recipients can open it only while this PC is on.</p>
    </form>
  );
}

export function DocumentsPage() {
  const now = useNow();
  const documents = useDocuments();
  const uploadDocument = useUploadDocument();
  const remove = useDeleteDocument();
  const list = useListParams();
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null);

  // Documents come as one array, so the search filters in the browser without a request.
  const q = list.get('q');
  const needle = q.toLowerCase();
  const all = documents.data?.filter((document) => !needle || document.name.toLowerCase().includes(needle));
  const page = all ? clampPage(list.page, list.size, all.length) : 0;
  const rows = all ? paginate(all, page, list.size) : undefined;

  const upload = (file: File, onProgress: (fraction: number) => void) =>
    uploadDocument.mutateAsync(
      { file, onProgress },
      {
        onSuccess: (document) =>
          toast({ title: `"${document.name}" uploaded`, description: 'In Gmail: Compose → MailPulse → Insert tracked file.', tone: 'success' }),
        onError: (error) => toastError('The PDF was not uploaded', error),
      },
    );
  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    remove.mutate(target.id, {
      onSuccess: () => {
        setDeleting(null);
        toast({ title: `"${target.name}" deleted`, description: 'Its links no longer open.', tone: 'success' });
      },
      onError: (error) => toastError('The document was not deleted', error),
    });
  };

  const columns: Column<DocumentSummary>[] = [
    {
      key: 'name',
      header: 'Document',
      className: MAIN_COLUMN,
      cell: (document) => (
        <div className="min-w-0">
          <TextLink to={`/documents/${encodeURIComponent(document.id)}`}>
            <span className="block truncate font-medium">{document.name}</span>
          </TextLink>
          <span className="block truncate text-xs text-muted">{sizeLine(document)}</span>
        </div>
      ),
    },
    { key: 'views', header: 'Views', align: 'right', cell: (document) => document.views },
    { key: 'reads', header: 'Reads', align: 'right', cell: (document) => document.reads },
    { key: 'downloads', header: 'Downloads', align: 'right', cell: (document) => document.downloads },
    { key: 'last', header: 'Last activity', className: 'whitespace-nowrap text-muted', cell: (document) => relativeTime(document.lastActivityAt, now) },
    { key: 'uploaded', header: 'Uploaded', className: 'whitespace-nowrap text-muted', cell: (document) => formatShortDateTime(document.createdAt, now) },
    {
      key: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      className: 'text-right',
      cell: (document) => (
        <button type="button" className="btn btn-quiet" onClick={() => setDeleting(document)} aria-label={`Delete ${document.name}`}>
          Delete
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Documents"
        description="PDFs you share as tracked links, such as your resume. See when they are opened, how long they are read and whether they are downloaded."
      />
      <Card title="Upload a PDF" className="mb-6">
        <PdfUpload label="Upload" busy={uploadDocument.isPending} onUpload={upload} />
      </Card>
      <Card
        title="Your documents"
        actions={<SearchField label="Search documents" value={q} placeholder="Name" onSearch={(text) => list.update({ q: text }, { replace: true })} className="w-full max-w-72" />}
      >
        <DataTable
          label="Documents"
          columns={columns}
          rows={rows}
          rowKey={(document) => document.id}
          rowTo={(document) => `/documents/${encodeURIComponent(document.id)}`}
          error={documents.error}
          onRetry={() => void documents.refetch()}
          empty={
            q ? (
              <Empty
                title={`No documents match "${q}"`}
                action={
                  <button type="button" className="btn btn-quiet" onClick={() => list.update({ q: null }, { replace: true })}>
                    Clear search
                  </button>
                }
              />
            ) : (
              <Empty title="No documents yet" icon={FileText}>
                Upload a PDF above. Then in Gmail: Compose → MailPulse → Insert tracked file.
              </Empty>
            )
          }
          mobile={(items) => (
            <ul className="divide-y divide-line" aria-label="Documents">
              {items.map((document) => (
                <li key={document.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <TextLink to={`/documents/${encodeURIComponent(document.id)}`}>
                      <span className="block truncate font-medium">{document.name}</span>
                    </TextLink>
                    <span className="block truncate text-xs text-muted">
                      {count(document.views, 'view')} · {count(document.reads, 'read')} · {count(document.downloads, 'download')}
                    </span>
                  </span>
                  <button type="button" className="btn btn-quiet" onClick={() => setDeleting(document)} aria-label={`Delete ${document.name}`}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        />
        {all && <Pagination page={page} size={list.size} total={all.length} onPage={list.setPage} onSize={list.setSize} />}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.name ?? ''}"?`}
        description="Every link to it stops working and its views, reads and downloads are deleted. This cannot be undone."
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const document = useDocument(id);
  return <QueryState query={document}>{(detail) => <DocumentView detail={detail} />}</QueryState>;
}

function linkTitle(link: DocLinkView): string {
  return link.label || link.emailSubject || 'Share link';
}

function linkStatus(link: DocLinkView, now: number): { text: string; tone: 'good' | 'neutral' | 'warn' } {
  if (link.revokedAt) return { text: 'Revoked', tone: 'neutral' };
  if (link.expiresAt && Date.parse(link.expiresAt) <= now) return { text: 'Expired', tone: 'warn' };
  return { text: 'Active', tone: 'good' };
}

const EVENT_TEXT: Record<DocEventView['type'], string> = { DOC_VIEW: 'Viewed', DOC_READ: 'Read', DOC_DOWNLOAD: 'Downloaded' };

const VERDICT_TONE: Record<DocEventView['verdict'], string> = {
  COUNTED: 'text-good',
  IGNORED: 'text-muted',
  PENDING: 'text-warn',
};

function eventWhat(event: DocEventView): string {
  if (event.type !== 'DOC_READ') return EVENT_TEXT[event.type];
  const parts = [event.readSeconds !== null ? duration(event.readSeconds) : null, event.pagesViewed !== null ? count(event.pagesViewed, 'page') : null];
  const details = parts.filter((part) => part !== null).join(', ');
  return details ? `Read: ${details}` : 'Read';
}

type DetailTab = 'links' | 'events';

/** One bar per page with its reading time and readers; the most-read page is highlighted. */
function PageTimes({ documentId }: { documentId: string }) {
  const pages = useDocumentPages(documentId);
  if (pages.data === undefined) {
    return pages.error ? (
      <div className="p-4">
        <ErrorBox error={pages.error} onRetry={() => void pages.refetch()} />
      </div>
    ) : (
      <LoadingBlock />
    );
  }
  if (pages.data.length === 0) {
    return (
      <Empty title="No reading time yet" icon={Clock}>
        When someone reads the PDF, the time spent on each page shows here.
      </Empty>
    );
  }
  const sorted = [...pages.data].sort((a, b) => a.page - b.page);
  const most = Math.max(...sorted.map((entry) => entry.seconds));
  const top = sorted.find((entry) => entry.seconds === most && most > 0)?.page ?? null;
  return (
    <ul className="space-y-3 p-4" aria-label="Time per page">
      {sorted.map((entry) => (
        <li key={entry.page} className="text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <span className={entry.page === top ? 'font-semibold' : ''}>
              Page {entry.page} · {duration(entry.seconds)} · {count(entry.readers, 'reader')}
            </span>
            {entry.page === top && <Badge tone="accent">Most read</Badge>}
          </span>
          <span className="mt-1 block h-2 overflow-hidden rounded-full bg-chip" aria-hidden="true">
            <span
              className={`block h-full rounded-full ${entry.page === top ? 'bg-accent' : 'bg-accent-soft'}`}
              style={{ width: `${most > 0 ? Math.max(2, Math.round((entry.seconds / most) * 100)) : 0}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function DocumentView({ detail }: { detail: DocumentDetail }) {
  const now = useNow();
  const navigate = useNavigate();
  const { summary } = detail;
  const rename = useRenameDocument();
  const replace = useReplaceDocument();
  const remove = useDeleteDocument();
  const createLink = useCreateSafeLink(summary.id);
  const [expiry, setExpiry] = useState<ExpiryChoice>('never');
  const [maxViews, setMaxViews] = useState('');
  const limitProblem = maxViewsProblem(maxViews);
  const updateLink = useUpdateLink();
  const [name, setName] = useState(summary.name);
  const [deleting, setDeleting] = useState(false);
  const [label, setLabel] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [created, setCreated] = useState<DocLinkView | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<DocLinkView | null>(null);
  const [tab, setTab] = useState<DetailTab>('links');
  const linkList = useListParams('links');
  const eventList = useListParams('events');
  const links = useDocumentLinks(summary.id, { page: linkList.page, size: linkList.size });
  const events = useDocumentEvents(summary.id, { page: eventList.page, size: eventList.size });
  const linkNames = new Map([...detail.links, ...(links.data?.items ?? [])].map((link) => [link.id, linkTitle(link)]));

  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    rename.mutate(
      { id: summary.id, name: name.trim() },
      {
        onSuccess: (document) => toast({ title: `Renamed to "${document.name}"`, tone: 'success' }),
        onError: (error) => toastError('The name was not changed', error),
      },
    );
  };
  const upload = (file: File, onProgress: (fraction: number) => void) =>
    replace.mutateAsync(
      { id: summary.id, file, onProgress },
      {
        onSuccess: () => toast({ title: 'New version uploaded', description: 'Every existing link now opens the new file.', tone: 'success' }),
        onError: (error) => toastError('The new version was not uploaded', error),
      },
    );
  const confirmDelete = () =>
    remove.mutate(summary.id, {
      onSuccess: () => {
        toast({ title: `"${summary.name}" deleted`, description: 'Its links no longer open.', tone: 'success' });
        void navigate('/documents');
      },
      onError: (error) => toastError('The document was not deleted', error),
    });
  const submitLink = (event: FormEvent) => {
    event.preventDefault();
    if (limitProblem) return;
    setCopiedId(null);
    const expiresAt = expiresAtFor(expiry, Date.now());
    createLink.mutate(
      {
        ...(label.trim() ? { label: label.trim() } : {}),
        allowDownload,
        ...(expiresAt ? { expiresAt } : {}),
        ...(maxViews.trim() ? { maxViews: Number(maxViews) } : {}),
      },
      {
        onSuccess: (link) => {
          setCreated(link);
          setLabel('');
          setExpiry('never');
          setMaxViews('');
        },
        onError: (error) => toastError('The link was not created', error),
      },
    );
  };
  const copyLink = async (link: DocLinkView) => {
    if (await copyText(link.url, 'link')) setCopiedId(link.id);
  };
  const confirmRevoke = () => {
    if (!revoking) return;
    const target = revoking;
    updateLink.mutate(
      { id: target.id, change: { revoked: true } },
      {
        onSuccess: () => {
          setRevoking(null);
          toast({ title: `"${linkTitle(target)}" revoked`, description: 'This link no longer opens the document.', tone: 'success' });
        },
        onError: (error) => toastError('The link was not revoked', error),
      },
    );
  };

  const linkColumns: Column<DocLinkView>[] = [
    {
      key: 'link',
      header: 'Link',
      className: MAIN_COLUMN,
      cell: (link) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{linkTitle(link)}</span>
          <span className="block truncate text-xs text-muted">{link.recipients ? `To ${link.recipients}` : link.emailId ? 'From an email' : `Created ${formatShortDateTime(link.createdAt, now)}`}</span>
        </div>
      ),
    },
    { key: 'views', header: 'Views', align: 'right', cell: (link) => link.views },
    { key: 'reads', header: 'Reads', align: 'right', cell: (link) => link.reads },
    { key: 'downloads', header: 'Downloads', align: 'right', cell: (link) => (link.allowDownload ? link.downloads : '—') },
    { key: 'last', header: 'Last activity', className: 'whitespace-nowrap text-muted', cell: (link) => relativeTime(link.lastActivityAt, now) },
    {
      key: 'limits',
      header: 'Limits',
      className: 'whitespace-nowrap text-xs text-muted',
      cell: (link) => {
        const ends = expiryText(link.expiresAt, now);
        const limit = maxViewsOf(link);
        if (!ends && limit === null) return '—';
        return (
          <>
            {ends && <span className="block">{ends}</span>}
            {limit !== null && <span className="block">{`${link.views} of ${limit} views`}</span>}
          </>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      className: 'whitespace-nowrap',
      cell: (link) => {
        const status = linkStatus(link, now);
        return <Badge tone={status.tone}>{status.text}</Badge>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      className: 'whitespace-nowrap text-right',
      cell: (link) => (
        <span className="inline-flex gap-1">
          <button type="button" className="btn btn-quiet" onClick={() => void copyLink(link)} aria-label={`Copy link ${linkTitle(link)}`}>
            {copiedId === link.id ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copiedId === link.id ? 'Copied' : 'Copy'}
          </button>
          {!link.revokedAt && (
            <button type="button" className="btn btn-quiet" onClick={() => setRevoking(link)} aria-label={`Revoke ${linkTitle(link)}`}>
              Revoke
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={summary.name}
        description={`${sizeLine(summary)} · version ${summary.version} · uploaded ${formatDateTime(summary.createdAt)}`}
        actions={<TextLink to="/documents">Back to documents</TextLink>}
      />
      <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Views" value={summary.views} />
        <Stat label="Reads" value={summary.reads} />
        <Stat label="Downloads" value={summary.downloads} />
        <Stat label="Last activity" value={relativeTime(summary.lastActivityAt, now)} hint={summary.lastActivityAt ? formatDateTime(summary.lastActivityAt) : undefined} />
      </div>
      <p className="mb-6 text-xs text-muted">Bots, link previews and your own views are listed under All events but not counted.</p>

      <Card title="Time per page" className="mb-6">
        <PageTimes documentId={summary.id} />
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Share link">
          <form onSubmit={submitLink} className="space-y-2 p-4">
            <label className="block">
              <span className="label">Name (only you see it)</span>
              <input className="input" value={label} maxLength={200} placeholder="For example: LinkedIn message to Jane" onChange={(event) => setLabel(event.target.value)} />
            </label>
            <Toggle label="Allow download" description="Off: the reader can only view the PDF in the browser." checked={allowDownload} onChange={setAllowDownload} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="label">Expires</span>
                <select className="input" value={expiry} onChange={(event) => setExpiry(event.target.value as ExpiryChoice)}>
                  {EXPIRY_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Max views (optional)</span>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  step={1}
                  value={maxViews}
                  placeholder="No limit"
                  aria-invalid={limitProblem !== null}
                  onChange={(event) => setMaxViews(event.target.value)}
                />
              </label>
            </div>
            {limitProblem && (
              <p role="alert" className="text-sm text-bad">
                {limitProblem}
              </p>
            )}
            <Button type="submit" variant="primary" loading={createLink.isPending} disabled={limitProblem !== null}>
              <Link2 size={16} aria-hidden="true" />
              Create link
            </Button>
            <p className="text-xs text-muted">For a link outside Gmail. In Gmail use Compose → MailPulse → Insert tracked file; that link shows the email here.</p>
          </form>
        </Card>
        <Card title="This document">
          <form onSubmit={submitRename} className="flex flex-wrap items-end gap-3 p-4 pb-0">
            <label className="min-w-0 flex-1 basis-48">
              <span className="label">Name</span>
              <input className="input" value={name} maxLength={500} onChange={(event) => setName(event.target.value)} required />
            </label>
            <Button type="submit" loading={rename.isPending} disabled={!name.trim() || name.trim() === summary.name}>
              Rename
            </Button>
          </form>
          <PdfUpload label="Upload new version" busy={replace.isPending} onUpload={upload} />
          <div className="border-t border-line px-4 py-3">
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete document
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <Tabs<DetailTab>
          label="Document"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'links', label: 'Links', count: links.data?.total },
            { value: 'events', label: 'All events', count: events.data?.total },
          ]}
        >
          {tab === 'links' ? (
            <>
              <DataTable
                label="Links"
                columns={linkColumns}
                rows={links.data?.items}
                rowKey={(link) => link.id}
                busy={links.isPlaceholderData}
                error={links.error}
                onRetry={() => void links.refetch()}
                empty={
                  <Empty title="No links yet" icon={Link2}>
                    Create a share link above, or insert this document in a Gmail email.
                  </Empty>
                }
              />
              {links.data && <Pagination page={linkList.page} size={linkList.size} total={links.data.total} onPage={linkList.setPage} onSize={linkList.setSize} />}
            </>
          ) : (
            <>
              {events.data === undefined && events.error ? (
                <div className="p-4">
                  <ErrorBox error={events.error} onRetry={() => void events.refetch()} />
                </div>
              ) : events.data && events.data.items.length === 0 ? (
                <Empty title="No views yet">Nobody has opened a link to this document yet.</Empty>
              ) : (
                <div className="table-wrap">
                  <table className="table" aria-label="All events" aria-busy={events.data === undefined}>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>What</th>
                        <th>Result</th>
                        <th>Link</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(events.data?.items ?? []).map((event) => (
                        <tr key={event.id}>
                          <td className="whitespace-nowrap">{formatDateTime(event.at)}</td>
                          <td>{eventWhat(event)}</td>
                          <td>
                            <span className={`font-semibold ${VERDICT_TONE[event.verdict]}`}>
                              {event.verdict === 'COUNTED' ? 'Counted' : event.verdict === 'PENDING' ? 'Waiting' : 'Not counted'}
                            </span>
                            {event.reason && <span className="block text-xs text-muted">{REASONS[event.reason] ?? event.reason}</span>}
                          </td>
                          <td>{linkNames.get(event.linkId) ?? 'Link'}</td>
                          <td className="max-w-xs text-xs break-words text-muted">
                            {SOURCES[event.source] ?? event.source}
                            {event.userAgent && <span className="block">{event.userAgent}</span>}
                            {event.ipPrefix && <span className="block">Network {event.ipPrefix}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {events.data && events.data.total > 0 && (
                <Pagination page={eventList.page} size={eventList.size} total={events.data.total} onPage={eventList.setPage} onSize={eventList.setSize} />
              )}
            </>
          )}
        </Tabs>
      </Card>

      <Modal
        open={created !== null}
        onOpenChange={(open) => {
          if (!open) setCreated(null);
        }}
        title="Your new link"
        description="Send it anywhere. Views, reads and downloads show up on this page while this PC is on."
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>
            Done
          </button>
        }
      >
        {created && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm break-all" data-testid="new-link">
              {created.url}
            </code>
            <button type="button" className="btn btn-quiet" onClick={() => void copyLink(created)}>
              {copiedId === created.id ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copiedId === created.id ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete "${summary.name}"?`}
        description="Every link to it stops working and its views, reads and downloads are deleted. This cannot be undone."
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={`Revoke "${revoking ? linkTitle(revoking) : ''}"?`}
        description="Anyone who opens this link sees that it no longer works. Other links keep working. This cannot be undone."
        confirmLabel="Revoke"
        busy={updateLink.isPending}
        onConfirm={confirmRevoke}
      />
    </>
  );
}
