import type {
  ActivityPage,
  ClientConfig,
  MarksResponse,
  RegisterResponse,
  TokenLookup,
} from '../core/api-types';
import type { Broadcast, Request, RequestOf, RequestType, ResponseMap, Status } from '../core/messages';
import { TOKEN_PATTERN } from '../core/pixel';
import { enqueue } from '../core/queue';
import type { ApiClient, ApiResult } from './api';
import type { StateStore } from './storage';

const LOCAL_BACKEND = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/;
const API_TOKEN = /^mp_[A-Za-z0-9_-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GMAIL_ID = /^[A-Za-z0-9:_-]{1,64}$/;

export interface HandlerDeps {
  api: ApiClient;
  store: StateStore;
  now(): number;
  newId(): string;
  exclusive<T>(task: () => Promise<T>): Promise<T>;
  applyDnr(config: ClientConfig | null): Promise<void>;
  broadcast(message: Broadcast): Promise<void>;
  extensionOrigin: string;
  appIdSet: boolean;
}

type Handlers = { [K in RequestType]: (request: RequestOf<K>) => Promise<ResponseMap[K]> };

export async function readStatus(deps: HandlerDeps): Promise<Status> {
  const state = await deps.store.read();
  return {
    backendUrl: state.backendUrl,
    hasToken: state.apiToken !== null,
    connection: state.apiToken === null ? 'unconfigured' : state.connection,
    message: state.connectionMessage,
    checkedAt: state.checkedAt,
    paused: state.paused,
    config: state.config,
    queued: state.queue.length,
    extensionOrigin: deps.extensionOrigin,
    appIdSet: deps.appIdSet,
  };
}

/** Remembers connection problems so the popup and options page can explain them. */
async function noteResult(deps: HandlerDeps, result: ApiResult<unknown>): Promise<void> {
  if (result.ok) return;
  if (result.connection === 'ok') return;
  await deps.store.write({
    connection: result.connection,
    connectionMessage: result.message,
    checkedAt: new Date(deps.now()).toISOString(),
  });
}

/** Fetches /api/config, stores it and applies the matching DNR rules. */
export async function testConnection(deps: HandlerDeps): Promise<Status> {
  const result = await deps.api.call<ClientConfig>('GET', '/api/config', undefined, 4000);
  const checkedAt = new Date(deps.now()).toISOString();
  if (result.ok) {
    await deps.store.write({ config: result.data, configAt: deps.now(), connection: 'ok', connectionMessage: null, checkedAt });
    await deps.applyDnr(result.data);
  } else {
    await deps.store.write({ connection: result.connection === 'ok' ? 'error' : result.connection, connectionMessage: result.message, checkedAt });
  }
  await deps.broadcast({ type: 'mp:statusChanged' });
  return readStatus(deps);
}

export function createHandlers(deps: HandlerDeps): Handlers {
  return {
    'mp:status': () => readStatus(deps),
    'mp:testConnection': () => testConnection(deps),
    'mp:saveConnection': async ({ backendUrl, apiToken }) => {
      const url = backendUrl.trim().replace(/\/+$/, '');
      const token = apiToken.trim();
      if (!LOCAL_BACKEND.test(url)) {
        await deps.store.write({ connection: 'error', connectionMessage: 'The backend URL must be http://127.0.0.1:<port> or http://localhost:<port>.' });
        return readStatus(deps);
      }
      if (!API_TOKEN.test(token)) {
        await deps.store.write({ connection: 'error', connectionMessage: 'That does not look like a MailPulse API token (it starts with mp_).' });
        return readStatus(deps);
      }
      await deps.store.write({ backendUrl: url, apiToken: token, lastActivityId: null });
      return testConnection(deps);
    },
    'mp:setPaused': async ({ paused }) => {
      await deps.store.write({ paused });
      await deps.broadcast({ type: 'mp:statusChanged' });
      return readStatus(deps);
    },
    'mp:register': async ({ account, clientRef, trackLinks }) => {
      const state = await deps.store.read();
      if (state.paused || !UUID.test(clientRef)) return null;
      const result = await deps.api.call<RegisterResponse>('POST', '/api/emails', { account, clientRef, trackOpens: true, trackLinks });
      await noteResult(deps, result);
      return result.ok ? result.data : null;
    },
    'mp:lookupToken': async ({ token }) => {
      if (!TOKEN_PATTERN.test(token)) return null;
      const result = await deps.api.call<TokenLookup>('GET', `/api/emails/by-token/${token}`);
      return result.ok ? result.data : null;
    },
    'mp:update': async ({ emailId, update }) => {
      if (!UUID.test(emailId)) return { delivered: false, queued: false };
      const path = `/api/emails/${emailId}`;
      const result = await deps.api.call('PATCH', path, update);
      if (result.ok) return { delivered: true, queued: false };
      await noteResult(deps, result);
      if (!result.retryable && result.connection === 'ok') return { delivered: false, queued: false };
      await deps.exclusive(async () => {
        const state = await deps.store.read();
        await deps.store.write({ queue: enqueue(state.queue, { method: 'PATCH', path, body: update }, deps.now(), deps.newId()) });
      });
      return { delivered: false, queued: true };
    },
    'mp:selfView': async ({ account, tokens, context }) => {
      const valid = [...new Set(tokens.filter((token) => TOKEN_PATTERN.test(token)))].slice(0, 50);
      if (valid.length === 0) return false;
      const result = await deps.api.call('POST', '/api/self-views', { account, tokens: valid, context });
      return result.ok;
    },
    'mp:marks': async ({ account, by, ids }) => {
      const valid = [...new Set(ids.filter((id) => GMAIL_ID.test(id)))].slice(0, 100);
      if (valid.length === 0) return {};
      const parameter = by === 'thread' ? 'threadIds' : 'messageIds';
      const query = `account=${encodeURIComponent(account)}&${parameter}=${valid.map(encodeURIComponent).join(',')}`;
      const result = await deps.api.call<MarksResponse>('GET', `/api/marks?${query}`);
      return result.ok ? result.data.marks : null;
    },
    'mp:activity': async ({ limit }) => {
      const size = Math.min(Math.max(Math.trunc(limit), 1), 50);
      const result = await deps.api.call<ActivityPage>('GET', `/api/activity?limit=${size}`);
      return result.ok ? result.data.items : null;
    },
  };
}

export function dispatch(handlers: Handlers, request: Request): Promise<unknown> {
  // TypeScript cannot correlate the request type with its handler, so the lookup is widened here.
  const handler = handlers[request.type] as (request: Request) => Promise<unknown>;
  return handler(request);
}
