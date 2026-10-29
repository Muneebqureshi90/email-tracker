import { useState, type FormEvent } from 'react';
import { useCreateToken, useRevokeToken, useTokens } from '../api/queries';
import type { CreatedToken } from '../api/types';
import { Card, Empty, ErrorBox, PageHeader, QueryState } from '../components/ui';
import { formatDateTime } from '../lib/format';

export function TokensPage() {
  const tokens = useTokens();
  const create = useCreateToken();
  const revoke = useRevokeToken();
  const [name, setName] = useState('Chrome extension');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setCopied(false);
    create.mutate(name.trim(), { onSuccess: setCreated });
  };
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Extension tokens"
        description="The Chrome extension signs in with a token. It can only register emails and read marks and activity; it cannot change settings or export data."
      />
      <Card title="Create a token" className="mb-6">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-4">
          <label className="min-w-60 flex-1">
            <span className="label">Name</span>
            <input className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} required />
          </label>
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !name.trim()}>
            Create token
          </button>
        </form>
        {create.isError && <div className="px-4 pb-4"><ErrorBox error={create.error} /></div>}
        {created && (
          <div className="m-4 mt-0 rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
            <p className="font-medium">Copy this token now. It is shown only once.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded bg-surface px-2 py-1 font-mono break-all" data-testid="new-token">
                {created.token}
              </code>
              <button type="button" className="btn btn-quiet" onClick={() => void copy(created.token)}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-2 text-muted">Paste it in the extension: MailPulse icon → Settings → API token → Save and connect.</p>
          </div>
        )}
      </Card>
      <Card title="Tokens">
        <QueryState query={tokens}>
          {(list) =>
            list.length === 0 ? (
              <Empty title="No tokens yet">Create one above for the Chrome extension.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((token) => (
                  <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      <span className="font-medium">{token.name}</span> <code className="text-muted">{token.prefix}…</code>
                      <span className="block text-xs text-muted">
                        Created {formatDateTime(token.createdAt)} · last used {formatDateTime(token.lastUsedAt)}
                      </span>
                    </span>
                    {token.revokedAt ? (
                      <span className="chip">Revoked {formatDateTime(token.revokedAt)}</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={revoke.isPending}
                        onClick={() => {
                          if (window.confirm(`Revoke "${token.name}"? The extension using it stops working until it gets a new token.`)) {
                            revoke.mutate(token.id);
                          }
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </Card>
    </>
  );
}
