import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useAccounts, useEmails } from '../api/queries';
import { EmailTable } from '../components/EmailTable';
import { Card, Empty, PageHeader, Pagination, QueryState } from '../components/ui';
import { useNow } from '../lib/now';

const STATES = [
  { value: '', label: 'All' },
  { value: 'opened', label: 'Opened' },
  { value: 'not_opened', label: 'Not opened' },
  { value: 'clicked', label: 'Clicked' },
];

export function EmailsPage() {
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const state = params.get('state') ?? '';
  const account = params.get('account') ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '0') || 0;
  const [text, setText] = useState(q);
  const emails = useEmails({ state, account, q, page });
  const accounts = useAccounts();

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    update({ q: text.trim() });
  };

  return (
    <>
      <PageHeader
        title="Emails"
        description="Every tracked email you sent. Search covers subjects, names and addresses."
        actions={
          <>
          <div role="group" aria-label="Show" className="flex overflow-hidden rounded-md border border-line">
            {STATES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={state === option.value}
                onClick={() => update({ state: option.value })}
                className={`px-3 py-2 text-sm font-medium ${state === option.value ? 'bg-accent text-accent-fg' : 'bg-surface hover:bg-raised'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {(accounts.data?.length ?? 0) > 1 && (
            <label>
              <span className="sr-only">Account</span>
              <select className="input" value={account} onChange={(event) => update({ account: event.target.value })}>
                <option value="">All accounts</option>
                {accounts.data?.map((address) => (
                  <option key={address} value={address}>
                    {address}
                  </option>
                ))}
              </select>
            </label>
          )}
          <form onSubmit={search} className="flex min-w-0 flex-1 gap-2 sm:min-w-60" role="search">
            <label className="flex-1">
              <span className="sr-only">Search emails</span>
              <input className="input" type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Search subject, name or address" />
            </label>
            <button type="submit" className="btn btn-quiet">
              Search
            </button>
          </form>
          </>
        }
      />
      <Card>
        <QueryState query={emails}>
          {(result) =>
            result.total === 0 ? (
              <Empty title={q || state || account ? 'No emails match these filters' : 'No tracked emails yet'}>
                {q || state || account ? 'Try another filter.' : 'Send an email from Gmail with the MailPulse extension installed.'}
              </Empty>
            ) : (
              <>
                <EmailTable emails={result.items} now={now} />
                <Pagination page={result.page} size={result.size} total={result.total} onPage={(next) => update({ page: String(next) })} />
              </>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}
