import { Check, Copy, KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCreateToken, useRevokeToken, useTokens } from '../api/queries';
import type { ApiToken, CreatedToken } from '../api/types';
import { SearchField } from '../components/controls';
import { DataTable, MAIN_COLUMN, type Column } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/dialogs';
import { toast, toastError } from '../components/toast';
import { Badge, Button, Card, Empty, PageHeader, Pagination } from '../components/ui';
import { formatShortDateTime, relativeTime } from '../lib/format';
import { useNow } from '../lib/now';
import { clampPage, paginate, useListParams } from '../lib/paging';

export function TokensPage() {
  const now = useNow();
  const tokens = useTokens();
  const create = useCreateToken();
  const revoke = useRevokeToken();
  const list = useListParams();
  const [name, setName] = useState('Chrome extension');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);

  // Tokens come as one array, so the search filters in the browser without a request.
  const q = list.get('q');
  const needle = q.toLowerCase();
  const all = tokens.data?.filter((token) => !needle || token.name.toLowerCase().includes(needle) || token.prefix.toLowerCase().includes(needle));
  const page = all ? clampPage(list.page, list.size, all.length) : 0;
  const rows = all ? paginate(all, page, list.size) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setCopied(false);
    create.mutate(name.trim(), {
      onSuccess: setCreated,
      onError: (error) => toastError('The token was not created', error),
    });
  };
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
      toast({ title: 'Copy did not work', description: 'Select the token and copy it with Ctrl+C.', tone: 'error' });
    }
  };
  const confirmRevoke = () => {
    if (!revoking) return;
    const target = revoking;
    revoke.mutate(target.id, {
      onSuccess: () => {
        setRevoking(null);
        toast({ title: `"${target.name}" revoked`, description: 'The extension using it is signed out.', tone: 'success' });
      },
      onError: (error) => toastError('The token was not revoked', error),
    });
  };

  const columns: Column<ApiToken>[] = [
    {
      key: 'name',
      header: 'Name',
      className: MAIN_COLUMN,
      cell: (token) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{token.name}</span>
          <code className="text-xs text-muted">{token.prefix}…</code>
        </div>
      ),
    },
    { key: 'created', header: 'Created', className: 'whitespace-nowrap text-muted', cell: (token) => formatShortDateTime(token.createdAt, now) },
    { key: 'used', header: 'Last used', className: 'whitespace-nowrap text-muted', cell: (token) => relativeTime(token.lastUsedAt, now) },
    {
      key: 'status',
      header: 'Status',
      className: 'whitespace-nowrap',
      cell: (token) => (token.revokedAt ? <Badge>Revoked {formatShortDateTime(token.revokedAt, now)}</Badge> : <Badge tone="good">Active</Badge>),
    },
    {
      key: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      className: 'text-right',
      cell: (token) =>
        token.revokedAt ? null : (
          <button type="button" className="btn btn-quiet" onClick={() => setRevoking(token)} aria-label={`Revoke ${token.name}`}>
            Revoke
          </button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Extension tokens"
        description="The Chrome extension signs in with a token. It can only register emails and read marks and activity; it cannot change settings or export data."
      />
      <Card title="Create a token" className="mb-6">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-4">
          <label className="min-w-0 flex-1 basis-60">
            <span className="label">Name</span>
            <input className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} required />
          </label>
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>
            Create token
          </Button>
        </form>
      </Card>
      <Card
        title="Tokens"
        actions={<SearchField label="Search tokens" value={q} placeholder="Name or prefix" onSearch={(text) => list.update({ q: text }, { replace: true })} className="w-full max-w-72" />}
      >
        <DataTable
          label="Tokens"
          columns={columns}
          rows={rows}
          rowKey={(token) => token.id}
          error={tokens.error}
          onRetry={() => void tokens.refetch()}
          empty={
            q ? (
              <Empty
                title={`No tokens match "${q}"`}
                action={
                  <button type="button" className="btn btn-quiet" onClick={() => list.update({ q: null }, { replace: true })}>
                    Clear search
                  </button>
                }
              />
            ) : (
              <Empty title="No tokens yet" icon={KeyRound}>
                Create one above, then paste it in the extension: MailPulse icon → Settings → API token.
              </Empty>
            )
          }
          mobile={(items) => (
            <ul className="divide-y divide-line" aria-label="Tokens">
              {items.map((token) => (
                <li key={token.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{token.name}</span>
                      {token.revokedAt ? <Badge>Revoked</Badge> : <Badge tone="good">Active</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      <code>{token.prefix}…</code> · last used {relativeTime(token.lastUsedAt, now)}
                    </span>
                  </span>
                  {!token.revokedAt && (
                    <button type="button" className="btn btn-quiet" onClick={() => setRevoking(token)} aria-label={`Revoke ${token.name}`}>
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        />
        {all && <Pagination page={page} size={list.size} total={all.length} onPage={list.setPage} onSize={list.setSize} />}
      </Card>

      <Modal
        open={created !== null}
        onOpenChange={(open) => {
          if (!open) setCreated(null);
        }}
        title="Copy your new token"
        description="It is shown only once. Paste it in the extension: MailPulse icon → Settings → API token → Save and connect."
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>
            Done
          </button>
        }
      >
        {created && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm break-all" data-testid="new-token">
              {created.token}
            </code>
            <button type="button" className="btn btn-quiet" onClick={() => void copy(created.token)}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={`Revoke "${revoking?.name ?? ''}"?`}
        description="The extension using this token stops working until you give it a new token. This cannot be undone."
        confirmLabel="Revoke"
        busy={revoke.isPending}
        onConfirm={confirmRevoke}
      />
    </>
  );
}
