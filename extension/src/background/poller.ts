import type { ActivityPage } from '../core/api-types';
import type { Broadcast } from '../core/messages';
import { notificationsFor, type NotificationSpec } from '../core/notify';
import { dueCalls, pruneExpired, settle, type Outcome } from '../core/queue';
import { inQuietHours } from '../core/time';
import type { ApiClient } from './api';
import type { StateStore } from './storage';

const PAGE = 20;
const MAX_PAGES = 5;

export interface PollerDeps {
  api: ApiClient;
  store: StateStore;
  now(): number;
  notify(specs: NotificationSpec[]): Promise<void>;
  broadcast(message: Broadcast): Promise<void>;
  /** The settings changed on the backend (another configVersion): fetch /api/config again. */
  refreshConfig(): Promise<void>;
}

/**
 * One check of the notification feed (PLAN §4.6): every 30 s by alarm, every 5 s while a Gmail tab is
 * visible. The first run only remembers the newest id, so installing the extension never floods the
 * desktop with old opens. A successful check also refreshes "Last checked".
 */
export async function pollActivity(deps: PollerDeps): Promise<number> {
  const state = await deps.store.read();
  const now = deps.now();
  if (state.lastActivityId === null) {
    const first = await deps.api.call<ActivityPage>('GET', '/api/activity?limit=1');
    if (first.ok) await deps.store.write({ lastActivityId: first.data.lastId, lastPollAt: now, connection: 'ok', checkedAt: new Date(now).toISOString() });
    return 0;
  }
  let since = state.lastActivityId;
  let total = 0;
  let reached = false;
  let configVersion: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await deps.api.call<ActivityPage>('GET', `/api/activity?since=${since}&limit=${PAGE}`);
    if (!result.ok) {
      if (result.connection !== 'ok' && result.connection !== state.connection) {
        await deps.store.write({ connection: result.connection, connectionMessage: result.message, checkedAt: new Date(now).toISOString() });
        await deps.broadcast({ type: 'mp:statusChanged' });
      }
      break;
    }
    reached = true;
    configVersion = result.data.configVersion ?? configVersion;
    const { items, lastId } = result.data;
    if (lastId < since) {
      // The data was deleted in the dashboard: start again from the newest id.
      await deps.store.write({ lastActivityId: lastId });
      break;
    }
    const last = items.at(-1);
    if (!last) break;
    const quiet =
      state.config?.quietHoursEnabled === true &&
      inQuietHours(now, state.config.quietHoursStart, state.config.quietHoursEnd, state.config.timeZone);
    if (state.notificationsEnabled && !quiet) await deps.notify(notificationsFor(items, { now, timeZone: state.config?.timeZone }));
    total += items.length;
    since = last.id;
    await deps.store.write({ lastActivityId: since });
    if (items.length < PAGE) break;
  }
  if (reached) {
    const wasDown = state.connection !== 'ok';
    await deps.store.write({ lastPollAt: now, connection: 'ok', connectionMessage: null, checkedAt: new Date(now).toISOString() });
    if (wasDown) await deps.broadcast({ type: 'mp:statusChanged' });
  }
  if (configVersion !== undefined && configVersion !== state.config?.configVersion) await deps.refreshConfig();
  if (total > 0) await deps.broadcast({ type: 'mp:marksChanged' });
  return total;
}

/** Retries queued send updates. Stops early while the backend is unreachable. */
export async function processQueue(deps: { api: ApiClient; store: StateStore; now(): number }): Promise<number> {
  const state = await deps.store.read();
  const now = deps.now();
  let queue = pruneExpired(state.queue, now);
  let delivered = 0;
  for (const call of dueCalls(queue, now)) {
    const result = await deps.api.call(call.method, call.path, call.body);
    let outcome: Outcome = 'drop';
    if (result.ok) {
      outcome = 'done';
      delivered++;
    } else if (result.retryable || result.connection === 'unauthorized' || result.connection === 'origin-rejected') {
      outcome = 'retry';
    }
    queue = settle(queue, call.id, outcome, now);
    if (!result.ok && result.connection === 'offline') break;
  }
  await deps.store.write({ queue });
  return delivered;
}
