import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface Downtime {
  from: string;
  to: string;
  minutes: number;
}

export interface SystemStatus {
  lastHeartbeatAt: string | null;
  downtimes: Downtime[];
  databaseBytes: number;
  documentBytes: number;
  emails: number;
  documents: number;
}

export function useSystemStatus() {
  return useQuery({ queryKey: ['system', 'status'], queryFn: ({ signal }) => api<SystemStatus>('/api/system/status', { signal }), staleTime: 60_000 });
}

/** "3 h 20 min", "45 min", "2 d 1 h". */
export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? 'TB'}`;
}

/** Downtime windows that ended within the last `days` days of `now`. */
export function recentDowntimes(downtimes: Downtime[], now: number, days: number): Downtime[] {
  const cutoff = now - days * 86_400_000;
  return downtimes.filter((window) => Date.parse(window.to) >= cutoff);
}
