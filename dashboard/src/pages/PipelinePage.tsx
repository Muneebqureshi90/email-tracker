import { ArrowLeft, ArrowRight, Pencil, Plus, SquareKanban, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  APPLICATION_STATUSES,
  useApplications,
  useCreateApplication,
  useDeleteApplication,
  useUpdateApplication,
  type Application,
  type ApplicationInput,
  type ApplicationStatus,
} from '../api/applications';
import { useEmails } from '../api/queries';
import type { EmailSummary } from '../api/types';
import { Select, type Option } from '../components/controls';
import { ConfirmDialog, Modal } from '../components/dialogs';
import { toastError } from '../components/toast';
import { Badge, Button, Empty, ErrorBox, LoadingBlock, PageHeader } from '../components/ui';
import { formatDate } from '../lib/format';

interface Draft {
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedOn: string;
  notes: string;
  /** '' means no linked email. */
  emailId: string;
}

const EMPTY_DRAFT: Draft = { company: '', role: '', status: 'APPLIED', appliedOn: '', notes: '', emailId: '' };

function draftOf(item: Application): Draft {
  return { company: item.company, role: item.role, status: item.status, appliedOn: item.appliedOn ?? '', notes: item.notes ?? '', emailId: item.emailId ?? '' };
}

function emailLabel(email: EmailSummary): string {
  const subject = email.subject && email.subject.trim() !== '' ? email.subject : '(no subject)';
  const to = email.recipients.map((recipient) => recipient.email).join(', ');
  return to === '' ? subject : `${subject} — ${to}`;
}

function emailOptions(emails: EmailSummary[], editing: Application | null): Option<string>[] {
  const options: Option<string>[] = [{ value: '', label: 'None' }, ...emails.map((email) => ({ value: email.id, label: emailLabel(email) }))];
  if (editing?.emailId && !emails.some((email) => email.id === editing.emailId)) {
    options.push({ value: editing.emailId, label: editing.emailSubject && editing.emailSubject.trim() !== '' ? editing.emailSubject : '(no subject)' });
  }
  return options;
}

function ApplicationForm({ editing, open, onOpenChange }: { editing: Application | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [draft, setDraft] = useState<Draft>(editing ? draftOf(editing) : EMPTY_DRAFT);
  const create = useCreateApplication();
  const update = useUpdateApplication();
  const emails = useEmails({ page: 0, size: 50 });
  const busy = create.isPending || update.isPending;
  const valid = draft.company.trim() !== '' && draft.role.trim() !== '';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    const fields = {
      company: draft.company.trim(),
      role: draft.role.trim(),
      status: draft.status,
      appliedOn: draft.appliedOn === '' ? null : draft.appliedOn,
      notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
      emailId: draft.emailId === '' ? null : draft.emailId,
    };
    const done = { onSuccess: () => onOpenChange(false) };
    if (editing) {
      update.mutate({ id: editing.id, changes: fields }, { ...done, onError: (error) => toastError('Could not save the application', error) });
    } else {
      const input: ApplicationInput = fields;
      create.mutate(input, { ...done, onError: (error) => toastError('Could not add the application', error) });
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={editing ? 'Edit application' : 'Add application'} description="Only you see these details.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">Company</span>
          <input className="input" value={draft.company} maxLength={200} required onChange={(event) => setDraft({ ...draft, company: event.target.value })} />
        </label>
        <label className="block">
          <span className="label">Role</span>
          <input className="input" value={draft.role} maxLength={200} required onChange={(event) => setDraft({ ...draft, role: event.target.value })} />
        </label>
        <div>
          <span id="application-status-label" className="label">
            Status
          </span>
          <Select labelledBy="application-status-label" value={draft.status} options={APPLICATION_STATUSES} onChange={(status) => setDraft({ ...draft, status })} />
        </div>
        <label className="block">
          <span className="label">Applied on</span>
          <input type="date" className="input" value={draft.appliedOn} onChange={(event) => setDraft({ ...draft, appliedOn: event.target.value })} />
        </label>
        <div>
          <span id="application-email-label" className="label">
            Linked email (optional)
          </span>
          <Select
            labelledBy="application-email-label"
            value={draft.emailId}
            options={emailOptions(emails.data?.items ?? [], editing)}
            onChange={(emailId) => setDraft({ ...draft, emailId })}
          />
          {emails.isError && <p className="mt-1 text-xs text-bad">Could not load your tracked emails.</p>}
        </div>
        <label className="block">
          <span className="label">Notes</span>
          <textarea className="input min-h-20" value={draft.notes} maxLength={2000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!valid}>
            {editing ? 'Save' : 'Add application'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ApplicationCard({ item, onEdit, onDelete }: { item: Application; onEdit: () => void; onDelete: () => void }) {
  const update = useUpdateApplication();
  const index = APPLICATION_STATUSES.findIndex((status) => status.value === item.status);
  const previous = index > 0 ? APPLICATION_STATUSES[index - 1] : undefined;
  const next = index < APPLICATION_STATUSES.length - 1 ? APPLICATION_STATUSES[index + 1] : undefined;

  function move(status: ApplicationStatus) {
    update.mutate({ id: item.id, changes: { status } }, { onError: (error) => toastError('Could not move the application', error) });
  }

  return (
    <li className="rounded-lg border border-line bg-surface p-3 shadow-(--shadow-sm)">
      <p className="truncate font-medium">{item.company}</p>
      <p className="truncate text-sm text-muted">{item.role}</p>
      {item.appliedOn && <p className="mt-1 text-xs text-muted">Applied {formatDate(item.appliedOn)}</p>}
      {item.notes && <p className="mt-1 line-clamp-3 text-xs break-words whitespace-pre-line">{item.notes}</p>}
      {item.emailId && (
        <div className="mt-2 space-y-1">
          <Link to={`/emails/${encodeURIComponent(item.emailId)}`} className="block truncate text-sm font-medium text-accent hover:underline">
            {item.emailSubject && item.emailSubject.trim() !== '' ? item.emailSubject : '(no subject)'}
          </Link>
          <div className="flex flex-wrap gap-1">
            {item.opens > 0 ? <Badge tone="good">Opened {item.opens}×</Badge> : <Badge>Not opened</Badge>}
            {item.clicks > 0 && <Badge tone="accent">Clicked</Badge>}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {previous && (
          <Button variant="ghost" className="px-2" aria-label={`Move ${item.company} to ${previous.label}`} title={`Move to ${previous.label}`} disabled={update.isPending} onClick={() => move(previous.value)}>
            <ArrowLeft size={14} aria-hidden="true" />
          </Button>
        )}
        {next && (
          <Button variant="ghost" className="px-2" aria-label={`Move ${item.company} to ${next.label}`} title={`Move to ${next.label}`} disabled={update.isPending} onClick={() => move(next.value)}>
            <ArrowRight size={14} aria-hidden="true" />
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" className="px-2" aria-label={`Edit ${item.company}`} title="Edit" onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" />
        </Button>
        <Button variant="ghost" className="px-2" aria-label={`Delete ${item.company}`} title="Delete" onClick={onDelete}>
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

export function PipelinePage() {
  const applications = useApplications();
  const remove = useDeleteApplication();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState<Application | null>(null);

  function openForm(item: Application | null) {
    setEditing(item);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }

  const items = applications.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Track your job applications from applied to offer."
        actions={
          <Button variant="primary" onClick={() => openForm(null)}>
            <Plus size={16} aria-hidden="true" />
            Add application
          </Button>
        }
      />
      {applications.isPending ? (
        <LoadingBlock />
      ) : applications.isError ? (
        <ErrorBox error={applications.error} onRetry={() => void applications.refetch()} />
      ) : items.length === 0 ? (
        <Empty title="No applications yet" icon={SquareKanban}>
          Choose “Add application” for each job you apply to, then move it from Applied to Interview, Offer or Rejected as you hear back.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {APPLICATION_STATUSES.map((column) => {
            const cards = items.filter((item) => item.status === column.value);
            return (
              <section key={column.value} aria-labelledby={`pipeline-${column.value}`} className="min-w-0 rounded-xl border border-line bg-bg p-3">
                <h2 id={`pipeline-${column.value}`} className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold">
                  {column.label}
                  <Badge>{cards.length}</Badge>
                </h2>
                {cards.length === 0 ? (
                  <p className="text-sm text-muted">Nothing here.</p>
                ) : (
                  <ul className="space-y-2">
                    {cards.map((item) => (
                      <ApplicationCard key={item.id} item={item} onEdit={() => openForm(item)} onDelete={() => setDeleting(item)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      {formOpen && <ApplicationForm key={formKey} editing={editing} open={formOpen} onOpenChange={setFormOpen} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this application?"
        description={deleting ? `${deleting.company} (${deleting.role}) leaves the pipeline. The tracked email stays.` : ''}
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: (error) => toastError('Could not delete the application', error),
          });
        }}
      />
    </div>
  );
}
