import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useContact, useContacts } from '../api/queries';
import { EmailTable } from '../components/EmailTable';
import { Card, Empty, PageHeader, Pagination, QueryState, Stat, TextLink } from '../components/ui';
import { count, formatDateTime, formatPercent, relativeTime } from '../lib/format';
import { useNow } from '../lib/now';

export function ContactsPage() {
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '0') || 0;
  const [text, setText] = useState(q);
  const contacts = useContacts(q, { page, size: 25 });

  const search = (event: FormEvent) => {
    event.preventDefault();
    setParams(text.trim() ? { q: text.trim() } : {});
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Everyone you emailed with tracking, and how often they opened."
        actions={
        <form onSubmit={search} className="flex w-full max-w-xl gap-2" role="search">
          <label className="flex-1">
            <span className="sr-only">Search contacts</span>
            <input className="input" type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Search name or address" />
          </label>
          <button type="submit" className="btn btn-quiet">
            Search
          </button>
        </form>
        }
      />
      <Card>
        <QueryState query={contacts}>
          {(result) =>
            result.total === 0 ? (
              <Empty title={q ? 'No contact matches' : 'No contacts yet'}>{q ? 'Try another search.' : 'Contacts appear after your first tracked email.'}</Empty>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {result.items.map((contact) => (
                    <li key={contact.email}>
                      <Link
                        to={`/contacts/${encodeURIComponent(contact.email)}`}
                        className="grid gap-1 px-4 py-3 text-sm hover:bg-raised/60 sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{contact.name || contact.email}</span>
                          {contact.name && <span className="block truncate text-xs text-muted">{contact.email}</span>}
                        </span>
                        <span className="text-xs text-muted sm:text-right">
                          {count(contact.emails, 'email')} · {contact.openedEmails} opened · {count(contact.opens, 'open')} · last opened {relativeTime(contact.lastOpenedAt, now)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={result.page}
                  size={result.size}
                  total={result.total}
                  onPage={(next) => setParams(q ? { q, page: String(next) } : { page: String(next) })}
                />
              </>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}

export function ContactDetailPage() {
  const now = useNow();
  const { address = '' } = useParams();
  const contact = useContact(address);
  return (
    <QueryState query={contact}>
      {({ summary, emails }) => (
        <>
          <PageHeader
            title={summary.name || summary.email}
            description={`${summary.email} · first emailed ${formatDateTime(summary.firstSeenAt)}`}
            actions={<TextLink to="/contacts">All contacts</TextLink>}
          />
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Emails" value={summary.emails} hint={`last ${relativeTime(summary.lastEmailedAt, now)}`} />
            <Stat label="Opened" value={summary.openedEmails} hint={summary.emails ? `${formatPercent(summary.openedEmails / summary.emails)} of emails` : undefined} />
            <Stat label="Opens" value={summary.opens} hint={`last ${relativeTime(summary.lastOpenedAt, now)}`} />
            <Stat label="Clicks" value={summary.clicks} />
          </div>
          <Card title="Emails to this person">
            <EmailTable emails={emails} now={now} />
          </Card>
        </>
      )}
    </QueryState>
  );
}
