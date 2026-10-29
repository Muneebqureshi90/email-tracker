import type {
  ActivityItem,
  ClientConfig,
  EmailUpdate,
  Mark,
  Preferences,
  RegisterLinksResponse,
  RegisterResponse,
  SelfViewContext,
  TokenLookup,
} from './api-types';

/** Messages from the Gmail content script, popup and options page to the service worker. */
export type Request =
  | { type: 'mp:status' }
  | { type: 'mp:testConnection' }
  | { type: 'mp:saveConnection'; backendUrl: string; apiToken: string }
  | { type: 'mp:setPaused'; paused: boolean }
  | { type: 'mp:register'; account: string; clientRef: string; trackLinks: boolean }
  | { type: 'mp:lookupToken'; token: string }
  | { type: 'mp:update'; emailId: string; update: EmailUpdate }
  | { type: 'mp:selfView'; account: string; tokens: string[]; context: SelfViewContext }
  | { type: 'mp:marks'; account: string; by: 'thread' | 'message'; ids: string[] }
  | { type: 'mp:activity'; limit: number }
  | { type: 'mp:registerLinks'; emailId: string; urls: string[] }
  | { type: 'mp:preferences'; emailId: string; preferences: Preferences };

export type RequestType = Request['type'];
export type RequestOf<K extends RequestType> = Extract<Request, { type: K }>;

export type Connection = 'ok' | 'unconfigured' | 'offline' | 'unauthorized' | 'origin-rejected' | 'error';

/** What the extension knows about its backend connection. */
export interface Status {
  backendUrl: string;
  hasToken: boolean;
  connection: Connection;
  message: string | null;
  checkedAt: string | null;
  paused: boolean;
  config: ClientConfig | null;
  queued: number;
  extensionOrigin: string;
  appIdSet: boolean;
}

export interface UpdateResult {
  delivered: boolean;
  queued: boolean;
}

export interface ResponseMap {
  'mp:status': Status;
  'mp:testConnection': Status;
  'mp:saveConnection': Status;
  'mp:setPaused': Status;
  'mp:register': RegisterResponse | null;
  'mp:lookupToken': TokenLookup | null;
  'mp:update': UpdateResult;
  'mp:selfView': boolean;
  'mp:marks': Record<string, Mark> | null;
  'mp:activity': ActivityItem[] | null;
  'mp:registerLinks': RegisterLinksResponse | null;
  'mp:preferences': boolean;
}

/** Messages from the service worker to Gmail tabs. */
export type Broadcast = { type: 'mp:marksChanged' } | { type: 'mp:statusChanged' };

const REQUEST_TYPES: ReadonlySet<string> = new Set<RequestType>([
  'mp:status',
  'mp:testConnection',
  'mp:saveConnection',
  'mp:setPaused',
  'mp:register',
  'mp:lookupToken',
  'mp:update',
  'mp:selfView',
  'mp:marks',
  'mp:activity',
  'mp:registerLinks',
  'mp:preferences',
]);

export function isRequest(message: unknown): message is Request {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof message.type === 'string' &&
    REQUEST_TYPES.has(message.type)
  );
}

export function isBroadcast(message: unknown): message is Broadcast {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message.type === 'mp:marksChanged' || message.type === 'mp:statusChanged')
  );
}
