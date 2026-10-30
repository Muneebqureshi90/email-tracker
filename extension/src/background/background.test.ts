import { describe, expect, it, vi } from 'vitest';
import type { ActivityItem } from '../core/api-types';
import type { Broadcast } from '../core/messages';
import type { NotificationSpec } from '../core/notify';
import { ApiClient, type FetchLike } from './api';
import { createHandlers, type HandlerDeps } from './handlers';
import { pollActivity, processQueue } from './poller';
import { createExclusive, memoryStateStore, type StoredState } from './storage';

const TOKEN = 'mp_abcdefghijklmnopqrstuvwxyz012345';
const EMAIL_ID = '7b0f3c52-1d9e-4f1a-9c41-2b9d6f0a1e11';

type Route = (path: string, init: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(route: Route, state: Partial<StoredState> = {}) {
  const store = memoryStateStore({ apiToken: TOKEN, ...state });
  const calls: { method: string; path: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    const path = input.replace('http://127.0.0.1:8080', '');
    calls.push({ method: init.method ?? 'GET', path, init });
    return Promise.resolve(route(path, init));
  };
  const api = new ApiClient(async () => {
    const current = await store.read();
    return { backendUrl: current.backendUrl, apiToken: current.apiToken };
  }, fetchImpl);
  const notified: NotificationSpec[] = [];
  const broadcasts: Broadcast[] = [];
  const applyDnr = vi.fn(() => Promise.resolve());
  const probePublic = vi.fn<(url: string) => Promise<boolean>>(() => Promise.resolve(true));
  const poll = vi.fn(() => Promise.resolve());
  const refreshConfig = vi.fn(() => Promise.resolve());
  const broadcast = (message: Broadcast) => {
    broadcasts.push(message);
    return Promise.resolve();
  };
  const deps: HandlerDeps = {
    api,
    store,
    now: () => 1_000_000,
    newId: () => 'queued-1',
    exclusive: createExclusive(),
    applyDnr,
    broadcast,
    probePublic,
    poll,
    extensionOrigin: 'chrome-extension://test',
    appIdSet: true,
  };
  const pollerDeps = {
    api,
    store,
    now: () => 1_000_000,
    refreshConfig,
    notify: (specs: NotificationSpec[]) => {
      notified.push(...specs);
      return Promise.resolve();
    },
    broadcast,
  };
  return { store, api, calls, deps, applyDnr, probePublic, poll, refreshConfig, handlers: createHandlers(deps), notified, broadcasts, pollerDeps };
}

function activity(id: number): ActivityItem {
  return {
    id,
    kind: 'OPEN',
    emailId: EMAIL_ID,
    subject: `Email ${id}`,
    recipients: 'jane@example.com',
    occurredAt: '2026-10-29T12:00:00Z',
    source: 'GMAIL_PROXY',
    linkUrl: null,
    shouldNotify: true,
    alertType: null,
    alertText: null,
  };
}

describe('ApiClient', () => {
  it('sends the bearer token and JSON, and parses JSON answers', async () => {
    const { api, calls } = setup(() => json({ id: EMAIL_ID }, 201));
    const result = await api.call<{ id: string }>('POST', '/api/emails', { account: 'me@gmail.com' });
    expect(result).toEqual({ ok: true, status: 201, data: { id: EMAIL_ID } });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(calls[0]!.init.body).toBe('{"account":"me@gmail.com"}');
    expect(calls[0]!.init.credentials).toBe('omit');
  });

  it('explains every way a call can fail', async () => {
    const answers: Record<string, () => Response> = {
      '/401': () => json({ title: 'Unauthorized' }, 401),
      '/cors': () => new Response('Invalid CORS request', { status: 403 }),
      '/400': () => json({ detail: 'status must be SENT' }, 400),
      '/500': () => new Response('', { status: 500 }),
      '/204': () => new Response(null, { status: 204 }),
    };
    const { api } = setup((path) => answers[path]!());
    expect(await api.call('GET', '/401')).toMatchObject({ ok: false, connection: 'unauthorized', retryable: false });
    expect(await api.call('GET', '/cors')).toMatchObject({ ok: false, connection: 'origin-rejected' });
    expect(await api.call('GET', '/400')).toMatchObject({ ok: false, connection: 'ok', message: 'status must be SENT', retryable: false });
    expect(await api.call('GET', '/500')).toMatchObject({ ok: false, connection: 'error', retryable: true });
    expect(await api.call('PATCH', '/204', {})).toEqual({ ok: true, status: 204, data: undefined });

    const offline = new ApiClient(() => Promise.resolve({ backendUrl: 'http://127.0.0.1:8080', apiToken: TOKEN }), () =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    expect(await offline.call('GET', '/x')).toMatchObject({ ok: false, connection: 'offline', retryable: true });
    const unconfigured = new ApiClient(() => Promise.resolve({ backendUrl: 'http://127.0.0.1:8080', apiToken: null }));
    expect(await unconfigured.call('GET', '/x')).toMatchObject({ ok: false, connection: 'unconfigured' });
  });
});

describe('activity poller', () => {
  it('starts from the newest id without notifying old activity', async () => {
    const { pollerDeps, store, notified } = setup(() => json({ items: [activity(41)], lastId: 41 }), { lastActivityId: null });
    expect(await pollActivity(pollerDeps)).toBe(0);
    expect(store.state.lastActivityId).toBe(41);
    expect(notified).toEqual([]);
  });

  it('notifies new items, advances the cursor and refreshes Gmail marks', async () => {
    const { pollerDeps, store, notified, broadcasts, calls } = setup(
      () => json({ items: [activity(42), { ...activity(43), emailId: '9c41ab52-1d9e-4f1a-9c41-2b9d6f0a1e22' }], lastId: 43 }),
      { lastActivityId: 41, connection: 'ok' },
    );
    expect(await pollActivity(pollerDeps)).toBe(2);
    expect(calls[0]!.path).toBe('/api/activity?since=41&limit=20');
    expect(notified.map((spec) => spec.title)).toEqual(['Opened: Email 42', 'Opened: Email 43']);
    expect(store.state.lastActivityId).toBe(43);
    expect(broadcasts).toEqual([{ type: 'mp:marksChanged' }]);
    expect(store.state).toMatchObject({ connection: 'ok', checkedAt: new Date(1_000_000).toISOString(), lastPollAt: 1_000_000 });
  });

  it('fetches the config again when the feed reports another configVersion', async () => {
    const config = { publicBaseUrl: 'https://pc.tail1234.ts.net', configVersion: 'aaaa000000000000' } as StoredState['config'];
    const same = setup(() => json({ items: [], lastId: 41, configVersion: 'aaaa000000000000' }), { lastActivityId: 41, config });
    await pollActivity(same.pollerDeps);
    expect(same.refreshConfig).not.toHaveBeenCalled();
    const changed = setup(() => json({ items: [], lastId: 41, configVersion: 'bbbb000000000000' }), { lastActivityId: 41, config });
    await pollActivity(changed.pollerDeps);
    expect(changed.refreshConfig).toHaveBeenCalledTimes(1);
  });

  it('shows no desktop notifications in quiet hours or when switched off, but still moves on', async () => {
    // now() is 00:16 UTC.
    const quiet = { quietHoursEnabled: true, quietHoursStart: '00:00', quietHoursEnd: '01:00', timeZone: 'UTC' } as StoredState['config'];
    const night = setup(() => json({ items: [activity(42)], lastId: 42 }), { lastActivityId: 41, config: quiet });
    expect(await pollActivity(night.pollerDeps)).toBe(1);
    expect(night.notified).toEqual([]);
    expect(night.store.state.lastActivityId).toBe(42);
    const off = setup(() => json({ items: [activity(42)], lastId: 42 }), { lastActivityId: 41, notificationsEnabled: false });
    await pollActivity(off.pollerDeps);
    expect(off.notified).toEqual([]);
  });

  it('records the backend going offline once', async () => {
    const { pollerDeps, store, broadcasts } = setup(() => Promise.reject(new TypeError('down')), { lastActivityId: 41, connection: 'ok' });
    await pollActivity(pollerDeps);
    expect(store.state.connection).toBe('offline');
    expect(broadcasts).toEqual([{ type: 'mp:statusChanged' }]);
  });

  it('resets the cursor after all data was deleted', async () => {
    const { pollerDeps, store, notified } = setup(() => json({ items: [], lastId: 0 }), { lastActivityId: 50 });
    await pollActivity(pollerDeps);
    expect(store.state.lastActivityId).toBe(0);
    expect(notified).toEqual([]);
  });
});

describe('send updates', () => {
  it('queue when the backend is down and deliver later', async () => {
    let up = false;
    const { handlers, store, deps, api } = setup(() => (up ? new Response(null, { status: 204 }) : Promise.reject(new TypeError('down'))));
    const result = await handlers['mp:update']({ type: 'mp:update', emailId: EMAIL_ID, update: { status: 'SENT' } });
    expect(result).toEqual({ delivered: false, queued: true });
    expect(store.state.queue).toHaveLength(1);

    up = true;
    const later = 1_000_000 + 31_000;
    expect(await processQueue({ api, store, now: () => later })).toBe(1);
    expect(store.state.queue).toHaveLength(0);
    expect(deps.now()).toBe(1_000_000);
  });

  it('are dropped when the backend rejects them as invalid', async () => {
    const { handlers, store } = setup(() => json({ detail: 'bad' }, 400));
    const result = await handlers['mp:update']({ type: 'mp:update', emailId: EMAIL_ID, update: { status: 'SENT' } });
    expect(result).toEqual({ delivered: false, queued: false });
    expect(store.state.queue).toHaveLength(0);
  });
});

describe('message handlers', () => {
  it('accept only a local backend URL and a MailPulse token', async () => {
    const { handlers, store } = setup(() => json({}));
    const remote = await handlers['mp:saveConnection']({ type: 'mp:saveConnection', backendUrl: 'https://evil.example', apiToken: TOKEN });
    expect(remote.connection).toBe('error');
    expect(store.state.backendUrl).toBe('http://127.0.0.1:8080');
    const badToken = await handlers['mp:saveConnection']({ type: 'mp:saveConnection', backendUrl: 'http://127.0.0.1:8080', apiToken: 'secret' });
    expect(badToken.message).toContain('mp_');
  });

  it('save a working connection, store the config and apply DNR rules', async () => {
    const config = { publicBaseUrl: 'https://pc.tail1234.ts.net', sendMode: 'PRESYNC', dnrBlocking: true };
    const { handlers, applyDnr, store } = setup(() => json(config), { apiToken: null });
    const status = await handlers['mp:saveConnection']({
      type: 'mp:saveConnection',
      backendUrl: 'http://localhost:8080/',
      apiToken: TOKEN,
    });
    expect(status).toMatchObject({ connection: 'ok', hasToken: true, backendUrl: 'http://localhost:8080' });
    expect(store.state.lastActivityId).toBeNull();
    expect(applyDnr).toHaveBeenCalledWith(config);
  });

  it('check the public address on Test connection and refresh Last checked', async () => {
    const config = { publicBaseUrl: 'https://pc.tail1234.ts.net', sendMode: 'PRESYNC', dnrBlocking: true };
    const { handlers, probePublic, store } = setup(() => json(config));
    probePublic.mockResolvedValueOnce(false);
    const status = await handlers['mp:testConnection']({ type: 'mp:testConnection' });
    expect(probePublic).toHaveBeenCalledWith('https://pc.tail1234.ts.net/t/mailpulse-health-check-0.gif');
    expect(status).toMatchObject({ connection: 'ok', publicCheck: 'down', checkedAt: new Date(1_000_000).toISOString() });
    expect(store.state.publicCheckedAt).toBe(new Date(1_000_000).toISOString());
  });

  it('fetch hover cards, documents and document links with checked ids only', async () => {
    const { handlers, calls } = setup((path) => (path.endsWith('/links') ? json({ id: 'l1', url: 'https://pc.tail1234.ts.net/d/x' }, 201) : json([])));
    expect(await handlers['mp:card']({ type: 'mp:card', emailId: 'not-an-id' })).toBeNull();
    await handlers['mp:card']({ type: 'mp:card', emailId: EMAIL_ID });
    await handlers['mp:documents']({ type: 'mp:documents' });
    expect(await handlers['mp:documentLink']({ type: 'mp:documentLink', documentId: '../x', emailId: EMAIL_ID })).toBeNull();
    const link = await handlers['mp:documentLink']({ type: 'mp:documentLink', documentId: 'doc-1', emailId: EMAIL_ID });
    expect(link).toEqual({ id: 'l1', url: 'https://pc.tail1234.ts.net/d/x' });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET /api/emails/${EMAIL_ID}/card`,
      'GET /api/documents',
      'POST /api/documents/doc-1/links',
    ]);
    expect(JSON.parse(calls[2]!.init.body as string)).toEqual({ emailId: EMAIL_ID });
  });

  it('run a quick activity check when a visible Gmail tab asks', async () => {
    const { handlers, poll } = setup(() => json({}));
    expect(await handlers['mp:tick']({ type: 'mp:tick' })).toBe(true);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('build mark queries from valid Gmail ids only', async () => {
    const { handlers, calls } = setup(() => json({ marks: {} }));
    await handlers['mp:marks']({ type: 'mp:marks', account: 'me@gmail.com', by: 'thread', ids: ['18a1b2c3', 'bad id', '18a1b2c3'] });
    expect(calls[0]!.path).toBe('/api/marks?account=me%40gmail.com&threadIds=18a1b2c3');
  });

  it('never register while paused', async () => {
    const { handlers, calls } = setup(() => json({}), { paused: true });
    const result = await handlers['mp:register']({
      type: 'mp:register',
      account: 'me@gmail.com',
      clientRef: '0b8f2c1a-3d4e-4f5a-8b6c-7d8e9f0a1b2c',
      trackLinks: false,
    });
    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
