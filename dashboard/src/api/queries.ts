import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, query } from './client';
import type {
  ActivityPage,
  AlertPage,
  AlertStatus,
  AlertView,
  ApiToken,
  AuthStatus,
  ContactDetail,
  ContactSummary,
  CreatedToken,
  EmailDetail,
  EmailSummary,
  Page,
  Preferences,
  Report,
  Settings,
} from './types';

export interface EmailFilters {
  state?: string;
  account?: string;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  size?: number;
}

export const keys = {
  auth: ['auth'] as const,
  emails: ['emails'] as const,
  email: (id: string) => ['email', id] as const,
  activity: ['activity'] as const,
  contacts: ['contacts'] as const,
  reports: ['reports'] as const,
  settings: ['settings'] as const,
  tokens: ['tokens'] as const,
  accounts: ['accounts'] as const,
  alerts: ['alerts'] as const,
};

/** Everything that changes when an open or click is counted. */
export const LIVE_KEYS = [keys.emails, keys.activity, keys.contacts, keys.reports, keys.alerts, ['email']];

export const useAuthStatus = () => useQuery({ queryKey: keys.auth, queryFn: () => api<AuthStatus>('/api/auth/status') });

export const useEmails = (filters: EmailFilters) =>
  useQuery({
    queryKey: [...keys.emails, filters],
    queryFn: ({ signal }) => api<Page<EmailSummary>>(`/api/emails${query({ ...filters, size: filters.size ?? 25 })}`, { signal }),
    placeholderData: keepPreviousData,
  });

export const useEmail = (id: string) =>
  useQuery({ queryKey: keys.email(id), queryFn: ({ signal }) => api<EmailDetail>(`/api/emails/${encodeURIComponent(id)}`, { signal }) });

export const useActivity = (limit: number) =>
  useQuery({ queryKey: [...keys.activity, limit], queryFn: ({ signal }) => api<ActivityPage>(`/api/activity${query({ limit })}`, { signal }) });

export const useContacts = (q: string, page: number) =>
  useQuery({
    queryKey: [...keys.contacts, q, page],
    queryFn: ({ signal }) => api<Page<ContactSummary>>(`/api/contacts${query({ q, page, size: 25 })}`, { signal }),
    placeholderData: keepPreviousData,
  });

export const useContact = (address: string) =>
  useQuery({
    queryKey: [...keys.contacts, 'detail', address],
    queryFn: ({ signal }) => api<ContactDetail>(`/api/contacts/${encodeURIComponent(address)}`, { signal }),
  });

export const useReport = (period: 'daily' | 'weekly', date: string | undefined) =>
  useQuery({
    queryKey: [...keys.reports, period, date],
    queryFn: ({ signal }) =>
      api<Report>(`/api/reports/${period}${query(period === 'daily' ? { date } : { weekStart: date })}`, { signal }),
  });

export const useSettings = (enabled = true) => useQuery({ enabled, queryKey: keys.settings, queryFn: () => api<Settings>('/api/settings') });
export const useTokens = () => useQuery({ queryKey: keys.tokens, queryFn: () => api<ApiToken[]>('/api/tokens') });
export const useAccounts = () => useQuery({ queryKey: keys.accounts, queryFn: () => api<string[]>('/api/accounts') });

export const useAlerts = (status: 'active' | 'all', page: number, enabled = true) =>
  useQuery({
    enabled,
    queryKey: [...keys.alerts, status, page],
    queryFn: ({ signal }) => api<AlertPage>(`/api/alerts${query({ status, page, size: 25 })}`, { signal }),
    placeholderData: keepPreviousData,
  });

export function useUpdateAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: AlertStatus; snoozeHours?: number }) =>
      api<AlertView>(`/api/alerts/${input.id}`, { method: 'PATCH', body: { status: input.status, snoozeHours: input.snoozeHours } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.alerts }),
  });
}

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => api<Settings>('/api/settings', { method: 'PUT', body: settings }),
    onSuccess: (saved) => client.setQueryData(keys.settings, saved),
  });
}

export function useUpdatePreferences(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (preferences: Preferences) => api<void>(`/api/emails/${id}/preferences`, { method: 'PATCH', body: preferences }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.email(id) }),
  });
}

export function useCreateToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<CreatedToken>('/api/tokens', { method: 'POST', body: { name } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tokens }),
  });
}

export function useRevokeToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tokens }),
  });
}

/** Login, setup and logout change who is signed in, so every cached answer is dropped. */
export function useAuthAction<T>(action: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      client.removeQueries({ predicate: (cached) => cached.queryKey[0] !== 'auth' });
      await client.invalidateQueries({ queryKey: keys.auth });
    },
  });
}

export function useDeleteAllData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { confirm: string; password: string }) => api<void>('/api/data', { method: 'DELETE', body: input }),
    onSuccess: () => client.invalidateQueries(),
  });
}
