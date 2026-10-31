import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/** Last Monday-to-Sunday week in the owner's time zone, as counted by GET /api/reports/last-week. */
export interface LastWeek {
  from: string;
  to: string;
  sent: number;
  opened: number;
  replied: number;
  interviews: number;
  documentViews: number;
}

export const useLastWeek = () =>
  useQuery({
    queryKey: ['reports', 'last-week'],
    queryFn: ({ signal }) => api<LastWeek>('/api/reports/last-week', { signal }),
  });
