import { SearchX, Users } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useContact, useContactEmails, useContacts } from '../api/queries';
import type { ContactSummary } from '../api/types';
import { SearchField } from '../components/controls';
import { DataTable, MAIN_COLUMN, type Column } from '../components/DataTable';
import { EmailTable } from '../components/EmailTable';
import { Avatar, RateBar } from '../components/marks';
import { Card, Empty, LoadingBlock, PageHeader, Pagination, QueryState, Stat, TextLink } from '../components/ui';
import { count, formatDateTime, formatPercent, relativeTime } from '../lib/format';
import { useNow } from '../lib/now';
import { useListParams } from '../lib/paging';

function openRate(contact: ContactSummary): number {
  return contact.emails > 0 ? contact.openedEmails / contact.emails : 0;
}

function contactColumns(now: number): Column<ContactSummary>[] {
  return [
    {
      key: 'contact',
      header: 'Contact',
      className: MAIN_COLUMN,
      cell: (contact) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={contact.name} email={contact.email} />
          <div className="min-w-0">
            <Link to={`/contacts/${encodeURIComponent(contact.email)}`} className="block truncate font-medium hover:underline">
              {contact.name || contact.email}
            </Link>
            {contact.name && <span className="block truncate text-xs text-muted">{contact.email}</span>}
          </div>
        </div>
      ),
    },
    { key: 'emails', header: 'Emails', sort: 'emails', align: 'right', cell: (contact) => contact.emails },
    { key: 'openRate', header: 'Open rate', sort: 'openRate', align: 'right', cell: (contact) => <RateBar rate={openRate(contact)} /> },
    { key: 'opens', header: 'Opens', sort: 'opens', align: 'right', cell: (contact) => contact.opens },
    { key: 'lastEmailed', header: 'Last emailed', sort: 'lastEmailed', className: 'whitespace-nowrap text-muted', cell: (contact) => relativeTime(contact.lastEmailedAt, now) },
    { key: 'lastOpened', header: 'Last opened', className: 'whitespace-nowrap text-muted', cell: (contact) => relativeTime(contact.lastOpenedAt, now) },
  ];
}

export function ContactsPage() {
  const now = useNow();
  const list = useListParams('', 'lastEmailed');
  const q = list.get('q');
  const contacts = useContacts(q, { page: list.page, size: list.size, sort: list.get('sort') || undefined, dir: list.get('dir') || undefined });
  const result = contacts.data;

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Everyone you emailed with tracking, and how often they opened."
        actions={
          <>
            <SearchField
              label="Search contacts"
              value={q}
              placeholder="Name or address"
              onSearch={(text) => list.update({ q: text }, { replace: true })}
              searching={Boolean(q) && contacts.isFetching}
              className="w-full sm:w-80"
            />
            {result && (
              <div className="ml-auto">
                <Pagination page={result.page} size={result.size} total={result.total} onPage={list.setPage} compact label="Pages (top)" />
              </div>
            )}
          </>
        }
      />
      <Card>
        <DataTable
          label="Contacts"
          columns={contactColumns(now)}
          rows={result?.items}
          rowKey={(contact) => contact.email}
          rowTo={(contact) => `/contacts/${encodeURIComponent(contact.email)}`}
          sort={list.sort}
          dir={list.dir}
          onSort={list.toggleSort}
          error={contacts.error}
          onRetry={() => void contacts.refetch()}
          busy={contacts.isPlaceholderData}
          stickyHeader
          empty={
            q ? (
              <Empty
                title={`No contacts match "${q}"`}
                icon={SearchX}
                action={
                  <button type="button" className="btn btn-quiet" onClick={() => list.update({ q: null }, { replace: true })}>
                    Clear search
                  </button>
                }
              >
                Try another name or address.
              </Empty>
            ) : (
              <Empty title="No contacts yet" icon={Users}>
                Contacts appear after your first tracked email.
              </Empty>
            )
          }
          mobile={(rows) => (
            <ul className="divide-y divide-line" aria-label="Contacts">
              {rows.map((contact) => (
                <li key={contact.email}>
                  <Link to={`/contacts/${encodeURIComponent(contact.email)}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-raised">
                    <Avatar name={contact.name} email={contact.email} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{contact.name || contact.email}</span>
                      <span className="block truncate text-xs text-muted">
                        {count(contact.emails, 'email')} · {formatPercent(openRate(contact))} opened · last opened {relativeTime(contact.lastOpenedAt, now)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        />
        {result && <Pagination page={result.page} size={result.size} total={result.total} onPage={list.setPage} onSize={list.setSize} />}
      </Card>
    </>
  );
}

export function ContactDetailPage() {
  const now = useNow();
  const { address = '' } = useParams();
  const contact = useContact(address);
  const list = useListParams('', 'sent');
  const emails = useContactEmails(address, { page: list.page, size: list.size, sort: list.get('sort') || undefined, dir: list.get('dir') || undefined });
  return (
    <QueryState query={contact} loading={<LoadingBlock lines={4} />}>
      {({ summary }) => (
        <>
          <PageHeader title={summary.name || summary.email} actions={<TextLink to="/contacts">All contacts</TextLink>} />
          <div className="mb-6 flex items-center gap-3">
            <Avatar name={summary.name} email={summary.email} size={40} />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{summary.email}</p>
              <p className="truncate text-muted">First emailed {formatDateTime(summary.firstSeenAt)}</p>
            </div>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Emails" value={summary.emails} hint={`last ${relativeTime(summary.lastEmailedAt, now)}`} />
            <Stat label="Opened" value={summary.openedEmails} hint={summary.emails ? `${formatPercent(summary.openedEmails / summary.emails)} of emails` : undefined} />
            <Stat label="Opens" value={summary.opens} hint={`last ${relativeTime(summary.lastOpenedAt, now)}`} />
            <Stat label="Clicks" value={summary.clicks} />
          </div>
          <Card title="Emails to this person">
            {emails.data && emails.data.total > emails.data.size && (
              <Pagination page={emails.data.page} size={emails.data.size} total={emails.data.total} onPage={list.setPage} position="top" label="Pages (top)" />
            )}
            <EmailTable
              label="Emails to this person"
              emails={emails.data?.items}
              now={now}
              sort={list.sort}
              dir={list.dir}
              onSort={list.toggleSort}
              error={emails.error}
              onRetry={() => void emails.refetch()}
              busy={emails.isPlaceholderData}
              empty={<Empty title="No tracked emails to this person" />}
            />
            {emails.data && <Pagination page={emails.data.page} size={emails.data.size} total={emails.data.total} onPage={list.setPage} onSize={list.setSize} />}
          </Card>
        </>
      )}
    </QueryState>
  );
}
