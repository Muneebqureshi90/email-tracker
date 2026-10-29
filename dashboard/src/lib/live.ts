import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LIVE_KEYS } from '../api/queries';
import type { ActivityItem } from '../api/types';

export type LiveState = 'connecting' | 'live' | 'offline';

/**
 * Server-Sent Events from /api/stream (DECISIONS D-007). Each counted open or click refreshes the
 * affected data, so pages update without a reload. EventSource reconnects by itself and the server
 * replays missed items through Last-Event-ID.
 */
export function useLiveUpdates(enabled: boolean): { state: LiveState; latest: ActivityItem | null } {
  const client = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');
  const [latest, setLatest] = useState<ActivityItem | null>(null);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/stream');
    source.onopen = () => setState('live');
    source.onerror = () => setState(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting');
    source.addEventListener('activity', (event) => {
      try {
        setLatest(JSON.parse((event as MessageEvent<string>).data) as ActivityItem);
      } catch {
        return;
      }
      for (const queryKey of LIVE_KEYS) void client.invalidateQueries({ queryKey });
    });
    return () => source.close();
  }, [client, enabled]);

  return { state, latest };
}
