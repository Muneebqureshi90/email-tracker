import type { ClientConfig } from '../core/api-types';
import type { Connection, PublicCheck } from '../core/messages';
import type { NotificationButton, NotificationTarget } from '../core/notify';
import type { QueuedCall } from '../core/queue';

export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8080';

/** Everything the service worker keeps in chrome.storage.local (never synced, never leaves the PC). */
export interface StoredState {
  backendUrl: string;
  apiToken: string | null;
  paused: boolean;
  /** The popup's switch: no desktop notifications at all from this browser. */
  notificationsEnabled: boolean;
  config: ClientConfig | null;
  configAt: number;
  connection: Connection;
  connectionMessage: string | null;
  checkedAt: string | null;
  publicCheck: PublicCheck;
  publicCheckedAt: string | null;
  lastActivityId: number | null;
  lastPollAt: number;
  queue: QueuedCall[];
  /** Click targets and buttons of the notifications on screen, by notification id (the worker may restart). */
  notificationTargets: Record<string, { target: NotificationTarget; buttons: NotificationButton[] }>;
}

export const DEFAULT_STATE: StoredState = {
  backendUrl: DEFAULT_BACKEND_URL,
  apiToken: null,
  paused: false,
  notificationsEnabled: true,
  config: null,
  configAt: 0,
  connection: 'unconfigured',
  connectionMessage: null,
  checkedAt: null,
  publicCheck: 'unknown',
  publicCheckedAt: null,
  lastActivityId: null,
  lastPollAt: 0,
  queue: [],
  notificationTargets: {},
};

export interface StateStore {
  read(): Promise<StoredState>;
  write(patch: Partial<StoredState>): Promise<void>;
}

export const chromeStateStore: StateStore = {
  async read() {
    const values: Record<string, unknown> = await chrome.storage.local.get(null);
    return { ...DEFAULT_STATE, ...(values as Partial<StoredState>) };
  },
  async write(patch) {
    await chrome.storage.local.set(patch);
  },
};

export function memoryStateStore(initial: Partial<StoredState> = {}): StateStore & { state: StoredState } {
  const store = {
    state: { ...DEFAULT_STATE, ...initial },
    read: () => Promise.resolve({ ...store.state }),
    write: (patch: Partial<StoredState>) => {
      store.state = { ...store.state, ...patch };
      return Promise.resolve();
    },
  };
  return store;
}

/** Runs async read-modify-write steps one at a time, so queue updates never overwrite each other. */
export function createExclusive(): <T>(task: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };
}
