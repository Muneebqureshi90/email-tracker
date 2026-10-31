import { Building2, SearchX, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { companyName, filterCompanies, replyRate, useCompanies, type CompanySummary } from '../api/companies';
import { useContact, useContactEmails, useContacts } from '../api/queries';
import type { ContactSummary } from '../api/types';
import { SearchField, Tabs } from '../components/controls';
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
  const view: ContactsView = list.get('view') === 'companies' ? 'companies' : 'people';

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Everyone you emailed with tracking, and how often they opened."
        actions={
          view === 'people' ? (
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
          ) : undefined
        }
      />
      <Tabs
        label="Contacts view"
        value={view}
        tabs={[
          { value: 'people', label: 'People' },
          { value: 'companies', label: 'Companies' },
        ]}
        onChange={(next) => list.update({ view: next === 'people' ? null : next }, { replace: true })}
      >
      {view === 'companies' ? (
        <CompaniesPanel now={now} />
      ) : (
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
      )}
      </Tabs>
    </>
  );
}

type ContactsView = 'people' | 'companies';

function companyColumns(now: number): Column<CompanySummary>[] {
  return [
    {
      key: 'company',
      header: 'Company',
      className: MAIN_COLUMN,
      cell: (company) => <span className={company.domain ? 'block truncate font-medium' : 'block truncate font-medium text-muted'}>{companyName(company)}</span>,
    },
    { key: 'contacts', header: 'Contacts', align: 'right', cell: (company) => company.contacts },
    { key: 'emails', header: 'Emails', align: 'right', cell: (company) => company.emails },
    { key: 'opened', header: 'Opened', align: 'right', cell: (company) => company.opened },
    { key: 'replyRate', header: 'Reply rate', align: 'right', cell: (company) => <RateBar rate={replyRate(company)} /> },
    { key: 'lastActivity', header: 'Last activity', className: 'whitespace-nowrap text-muted', cell: (company) => relativeTime(company.lastActivityAt, now) },
  ];
}

function CompaniesPanel({ now }: { now: number }) {
  const [text, setText] = useState('');
  const companies = useCompanies(true);
  const rows = companies.data ? filterCompanies(companies.data, text) : undefined;
  return (
    <Card>
      <div className="p-4">
        <SearchField label="Search companies" value={text} placeholder="Company domain" onSearch={setText} className="w-full sm:w-80" />
      </div>
      <DataTable
        label="Companies"
        columns={companyColumns(now)}
        rows={rows}
        rowKey={(company) => company.domain ?? '(personal)'}
        error={companies.error}
        onRetry={() => void companies.refetch()}
        empty={
          text ? (
            <Empty title={`No companies match "${text}"`} icon={SearchX}>
              Try another domain.
            </Empty>
          ) : (
            <Empty title="No companies yet" icon={Building2}>
              Companies appear after your first tracked email.
            </Empty>
          )
        }
        mobile={(list) => (
          <ul className="divide-y divide-line" aria-label="Companies">
            {list.map((company) => (
              <li key={company.domain ?? '(personal)'} className="px-4 py-3 text-sm">
                <span className="block truncate font-medium">{companyName(company)}</span>
                <span className="block truncate text-xs text-muted">
                  {count(company.contacts, 'contact')} · {count(company.emails, 'email')} · {company.opened} opened · {formatPercent(replyRate(company))} replied · {relativeTime(company.lastActivityAt, now)}
                </span>
              </li>
            ))}
          </ul>
        )}
      />
    </Card>
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
