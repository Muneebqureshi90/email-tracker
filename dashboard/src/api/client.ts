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

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Multipart upload with progress (fetch cannot report upload progress, XMLHttpRequest can).
 * `onProgress` gets a fraction from 0 to 1.
 */
export function upload<T>(
  path: string,
  form: FormData,
  options: { method?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method ?? 'POST', path);
    request.withCredentials = true;
    request.setRequestHeader('Accept', 'application/json');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      const body = parseBody(request.responseText);
      if (request.status >= 200 && request.status < 300) {
        options.onProgress?.(1);
        resolve(body as T);
      } else {
        reject(problemOf(request.status, body));
      }
    };
    request.onerror = () => reject(new ApiError(0, 'MailPulse is not reachable. Is the backend running?'));
    request.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    options.signal?.addEventListener('abort', () => request.abort());
    request.send(form);
  });
}

/** Reads a download as a Blob, reporting the bytes received so far (and the total when known). */
export async function downloadBlob(path: string, onProgress: (received: number, total: number | null) => void): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'MailPulse is not reachable. Is the backend running?');
  }
  if (!response.ok) throw problemOf(response.status, parseBody(await response.text()));
  const header = Number(response.headers.get('Content-Length'));
  const total = Number.isFinite(header) && header > 0 ? header : null;
  if (!response.body) {
    const blob = await response.blob();
    onProgress(blob.size, total);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }
  return new Blob(chunks, { type: response.headers.get('Content-Type') ?? 'application/octet-stream' });
}
