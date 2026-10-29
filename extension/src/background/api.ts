import type { Connection } from '../core/messages';

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; connection: Connection; message: string; retryable: boolean };

export interface ConnectionSettings {
  backendUrl: string;
  apiToken: string | null;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type Method = 'GET' | 'POST' | 'PATCH';

function problemText(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      const detail = 'detail' in parsed ? parsed.detail : 'title' in parsed ? parsed.title : null;
      return typeof detail === 'string' ? detail : null;
    }
  } catch {
    // not JSON
  }
  return null;
}

/** The private API on 127.0.0.1, called only from the service worker with the extension's bearer token. */
export class ApiClient {
  constructor(
    private readonly settings: () => Promise<ConnectionSettings>,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 2000,
  ) {}

  async call<T>(method: Method, path: string, body?: unknown, timeoutMs = this.timeoutMs): Promise<ApiResult<T>> {
    const { backendUrl, apiToken } = await this.settings();
    if (!apiToken) {
      return { ok: false, status: 0, connection: 'unconfigured', message: 'No API token yet. Open the MailPulse options.', retryable: true };
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetchImpl(`${backendUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, status: 0, connection: 'offline', message: `MailPulse is not reachable at ${backendUrl}.`, retryable: true };
    }
    const text = await response.text().catch(() => '');
    if (response.ok) {
      return { ok: true, status: response.status, data: (text ? JSON.parse(text) : undefined) as T };
    }
    if (response.status === 401) {
      return {
        ok: false,
        status: 401,
        connection: 'unauthorized',
        message: 'The API token was rejected. Create a new one in the MailPulse dashboard.',
        retryable: false,
      };
    }
    if (response.status === 403 && text.includes('Invalid CORS request')) {
      return {
        ok: false,
        status: 403,
        connection: 'origin-rejected',
        message: 'The backend does not accept this extension yet: set MAILPULSE_EXTENSION_ORIGINS in infra\\.env and restart MailPulse.',
        retryable: false,
      };
    }
    const serverSide = response.status >= 500;
    return {
      ok: false,
      status: response.status,
      connection: serverSide ? 'error' : 'ok',
      message: problemText(text) ?? `MailPulse answered HTTP ${response.status}.`,
      retryable: serverSide || response.status === 429,
    };
  }
}
