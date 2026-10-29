import type { ActivityPage } from '../core/api-types';
import type { Broadcast } from '../core/messages';
import { notificationsFor, type NotificationSpec } from '../core/notify';
import { dueCalls, pruneExpired, settle, type Outcome } from '../core/queue';
import type { ApiClient } from './api';
import type { StateStore } from './storage';

const PAGE = 20;
const MAX_PAGES = 5;

export interface PollerDeps {
  api: ApiClient;
  store: StateStore;
  notify(specs: NotificationSpec[]): Promise<void>;
  broadcast(message: Broadcast): Promise<void>;
}

/**
 * One alarm tick of the notification feed (PLAN §4.6). The first run only remembers the newest id,
 * so installing the extension never floods the desktop with old opens.
 */
export async function pollActivity(deps: PollerDeps): Promise<number> {
  const state = await deps.store.read();
  if (state.lastActivityId === null) {
    const first = await deps.api.call<ActivityPage>('GET', '/api/activity?limit=1');
    if (first.ok) await deps.store.write({ lastActivityId: first.data.lastId });
    return 0;
  }
  let since = state.lastActivityId;
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await deps.api.call<ActivityPage>('GET', `/api/activity?since=${since}&limit=${PAGE}`);
    if (!result.ok) break;
    const { items, lastId } = result.data;
    if (lastId < since) {
      // The data was deleted in the dashboard: start again from the newest id.
      await deps.store.write({ lastActivityId: lastId });
      break;
    }
    const last = items.at(-1);
    if (!last) break;
    await deps.notify(notificationsFor(items));
    total += items.length;
    since = last.id;
    await deps.store.write({ lastActivityId: since });
    if (items.length < PAGE) break;
  }
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
