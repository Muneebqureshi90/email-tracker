import type { Request, ResponseMap } from '../core/messages';

/**
 * Sends one request to the service worker. Resolves to null when the worker does not answer in
 * time or the extension was reloaded: callers treat null as "MailPulse unavailable" and fail open.
 */
export async function ask<R extends Request>(request: R, timeoutMs = 4000): Promise<ResponseMap[R['type']] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const response: unknown = await Promise.race([chrome.runtime.sendMessage(request), timeout]);
    return (response ?? null) as ResponseMap[R['type']] | null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type Ask = typeof ask;
