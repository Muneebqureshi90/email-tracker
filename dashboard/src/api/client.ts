/** Errors from the API as RFC 9457 problem details, flattened for the UI. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function problemOf(status: number, body: unknown): ApiError {
  const fallback = status === 0 ? 'MailPulse is not reachable.' : `Request failed (HTTP ${status}).`;
  if (typeof body !== 'object' || body === null) return new ApiError(status, fallback);
  const detail = 'detail' in body && typeof body.detail === 'string' ? body.detail : null;
  const title = 'title' in body && typeof body.title === 'string' ? body.title : null;
  const fields: Record<string, string> = {};
  if ('errors' in body && Array.isArray(body.errors)) {
    for (const error of body.errors as unknown[]) {
      if (typeof error === 'object' && error !== null && 'field' in error && 'message' in error) {
        fields[String(error.field)] = String(error.message);
      }
    }
  }
  return new ApiError(status, detail ?? title ?? fallback, fields);
}

/** Same-origin JSON call. The session cookie travels automatically; scripts never see it. */
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: options.body === undefined ? null : JSON.stringify(options.body),
      credentials: 'same-origin',
      signal: options.signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'MailPulse is not reachable. Is the backend running?');
  }
  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) throw problemOf(response.status, body);
  return body as T;
}

export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
