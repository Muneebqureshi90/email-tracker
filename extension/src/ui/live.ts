import { useCallback, useEffect, useState } from 'react';
import type { Status } from '../core/messages';
import { ask } from '../gmail/bridge';

/**
 * The service worker's status, kept current: every change in extension storage (background checks
 * write "Last checked" on each successful poll) asks for the status again.
 */
export function useLiveStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const next = await ask({ type: 'mp:status' });
    if (next) {
      setStatus(next);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const apply = (next: Status | null) => {
      if (next) {
        setStatus(next);
        setFailed(false);
      } else {
        setFailed(true);
      }
    };
    void ask({ type: 'mp:status' }).then(apply);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void ask({ type: 'mp:status' }).then(apply), 150);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  return { status, setStatus, failed, refresh };
}

/** The current time, updated every `everyMs`, for "2 min ago" texts. */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
