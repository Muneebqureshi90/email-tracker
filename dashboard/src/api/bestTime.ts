import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/** weekday: 1 = Monday to 7 = Sunday; hour: 0 to 23. Only non-zero cells are sent. */
export interface BestTimeCell {
  weekday: number;
  hour: number;
  opens: number;
}

export interface BestTime {
  timezone: string;
  totalOpens: number;
  cells: BestTimeCell[];
}

export interface ThisWeek {
  from: string;
  to: string;
  sent: number;
  opened: number;
  clicked: number;
  documentViews: number;
}

export const useBestTime = () =>
  useQuery({
    queryKey: ['reports', 'best-time'],
    queryFn: ({ signal }) => api<BestTime>('/api/reports/best-time', { signal }),
  });

export const useThisWeek = () =>
  useQuery({
    queryKey: ['reports', 'this-week'],
    queryFn: ({ signal }) => api<ThisWeek>('/api/reports/this-week', { signal }),
  });
