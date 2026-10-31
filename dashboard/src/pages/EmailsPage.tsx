import { Inbox, SearchX } from 'lucide-react';
import { useAccounts, useEmailCounts, useEmails } from '../api/queries';
import type { EmailCounts } from '../api/types';
import { SearchField, Segmented, Select } from '../components/controls';
import { EmailTable } from '../components/EmailTable';
import { Card, Empty, PageHeader, Pagination, TextLink } from '../components/ui';
import { useNow } from '../lib/now';
import { useListParams } from '../lib/paging';

const STATES: { value: string; label: string; count: keyof EmailCounts }[] = [
  { value: '', label: 'All', count: 'all' },
  { value: 'opened', label: 'Opened', count: 'opened' },
  { value: 'not_opened', label: 'Not opened', count: 'notOpened' },
  { value: 'clicked', label: 'Clicked', count: 'clicked' },
];

export function EmailsPage() {
  const now = useNow();
  const list = useListParams('', 'sent');
  const state = list.get('state');
  const account = list.get('account');
  const q = list.get('q');
  const emails = useEmails({ state, account, q, page: list.page, size: list.size, sort: list.get('sort') || undefined, dir: list.get('dir') || undefined });
  const counts = useEmailCounts(account, q);
  const accounts = useAccounts();
  const result = emails.data;
  const filtered = Boolean(q || state || account);

  const pager = (position: 'top' | 'bottom') =>
    result && (
      <Pagination
        page={result.page}
        size={result.size}
        total={result.total}
        onPage={list.setPage}
        onSize={position === 'bottom' ? list.setSize : undefined}
        compact={position === 'top'}
        label={position === 'top' ? 'Pages (top)' : 'Pages'}
      />
    );

  return (
    <>
      <PageHeader
        title="Emails"
        description="Every tracked email you sent. Search covers subjects, names and addresses."
        actions={
          <>
            <Segmented
              label="Show"
              value={state}
              options={STATES.map((option) => ({ value: option.value, label: option.label, count: counts.data?.[option.count] }))}
              onChange={(value) => list.update({ state: value })}
            />
            <SearchField
              label="Search emails"
              value={q}
              placeholder="Subject, name or address"
              onSearch={(text) => list.update({ q: text }, { replace: true })}
              searching={Boolean(q) && emails.isFetching}
              className="w-full shrink-0 sm:w-80 xl:w-96"
            />
            {(accounts.data?.length ?? 0) > 1 && (
              <Select
                label="Account"
                value={account}
                onChange={(value) => list.update({ account: value })}
                options={[{ value: '', label: 'All accounts' }, ...(accounts.data ?? []).map((address) => ({ value: address, label: address }))]}
                className="w-auto max-w-56"
              />
            )}
            <div className="ml-auto">{pager('top')}</div>
          </>
        }
      />
      {result && result.items.some((email) => email.repliedAt) && (
        <ul aria-label="Replied emails" className="mb-3 flex flex-wrap gap-2 text-sm">
          {result.items
            .filter((email) => email.repliedAt)
            .map((email) => (
              <li key={email.id} className="flex items-center gap-1">
                <span className="rounded-full border px-2 py-0.5 text-xs font-medium">Replied</span>
                <TextLink to={`/emails/${email.id}`}>{email.subject ?? '(no subject)'}</TextLink>
              </li>
            ))}
        </ul>
      )}
      <Card>
        <EmailTable
          emails={result?.items}
          now={now}
          sort={list.sort}
          dir={list.dir}
          onSort={list.toggleSort}
          error={emails.error}
          onRetry={() => void emails.refetch()}
          busy={emails.isPlaceholderData}
          stickyHeader
          empty={
            q ? (
              <Empty
                title={`No emails match "${q}"`}
                icon={SearchX}
                action={
                  <button type="button" className="btn btn-quiet" onClick={() => list.update({ q: null }, { replace: true })}>
                    Clear search
                  </button>
                }
              >
                Try another subject, name or address.
              </Empty>
            ) : filtered ? (
              <Empty title="No emails match these filters" icon={SearchX} action={<button type="button" className="btn btn-quiet" onClick={() => list.update({ q: null, state: null, account: null })}>Clear filters</button>}>
                Try another search or filter.
              </Empty>
            ) : (
              <Empty title="No tracked emails yet" icon={Inbox}>
                Send an email from Gmail with the MailPulse extension installed. It shows up here within seconds.
              </Empty>
            )
          }
        />
        {pager('bottom')}
      </Card>
    </>
  );
}
