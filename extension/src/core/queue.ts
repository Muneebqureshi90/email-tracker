/**
 * Retry queue for send updates that could not reach the backend (PLAN §4.1 step 4). Pure functions
 * over an array that the service worker keeps in chrome.storage.local.
 */

export interface QueuedCall {
  id: string;
  method: 'PATCH' | 'POST';
  path: string;
  body: unknown;
  attempts: number;
  nextAt: number;
  createdAt: number;
}

export const MAX_QUEUE = 200;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_RETRY_MS = 30_000;
const MAX_RETRY_MS = 60 * 60 * 1000;

export function backoffMs(attempts: number): number {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1));
}

/** Adds a call; a newer call to the same method and path replaces the older one (the latest state wins). */
export function enqueue(
  queue: readonly QueuedCall[],
  call: { method: QueuedCall['method']; path: string; body: unknown },
  now: number,
  id: string,
): QueuedCall[] {
  const kept = queue.filter((item) => !(item.method === call.method && item.path === call.path));
  kept.push({ id, ...call, attempts: 0, nextAt: now + FIRST_RETRY_MS, createdAt: now });
  return kept.slice(-MAX_QUEUE);
}

export function dueCalls(queue: readonly QueuedCall[], now: number): QueuedCall[] {
  return queue.filter((item) => item.nextAt <= now && now - item.createdAt <= MAX_AGE_MS);
}

export type Outcome = 'done' | 'retry' | 'drop';

export function settle(queue: readonly QueuedCall[], id: string, outcome: Outcome, now: number): QueuedCall[] {
  if (outcome !== 'retry') return queue.filter((item) => item.id !== id);
  return queue.map((item) => {
    if (item.id !== id) return item;
    const attempts = item.attempts + 1;
    return { ...item, attempts, nextAt: now + backoffMs(attempts) };
  });
}

export function pruneExpired(queue: readonly QueuedCall[], now: number): QueuedCall[] {
  return queue.filter((item) => now - item.createdAt <= MAX_AGE_MS);
}
