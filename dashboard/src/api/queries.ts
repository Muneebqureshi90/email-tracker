import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, query, upload } from './client';
import type {
  ActivityKind,
  ActivityPage,
  DocLinkView,
  DocEventView,
  DocumentDetail,
  DocumentSummary,
  EmailCounts,
  EventView,
  NotificationPage,
  SearchResults,
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
  sort?: string;
  dir?: string;
}

export interface Paging {
  page: number;
  size: number;
  sort?: string;
  dir?: string;
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
  notifications: ['notifications'] as const,
  documents: ['documents'] as const,
  document: (id: string) => ['document', id] as const,
  search: ['search'] as const,
};

/** Everything that changes when an open, click or document event is counted. */
export const LIVE_KEYS = [keys.emails, keys.activity, keys.contacts, keys.reports, keys.alerts, keys.notifications, keys.documents, ['email'], ['document']];

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

export const ACTIVITY_PAGE = 50;

/** Activity pages, newest first; "Load older" asks for the items before the oldest one shown. */
export const useActivityFeed = (kinds: ActivityKind[]) =>
  useInfiniteQuery({
    queryKey: [...keys.activity, 'feed', kinds.join(',')],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) =>
      api<ActivityPage>(`/api/activity${query({ limit: ACTIVITY_PAGE, kinds: kinds.join(','), before: pageParam })}`, { signal }),
    getNextPageParam: (last) => (last.hasMore && last.items.length > 0 ? Math.min(...last.items.map((item) => item.id)) : null),
  });

export const useEmailCounts = (account: string, q: string) =>
  useQuery({
    queryKey: [...keys.emails, 'counts', account, q],
    queryFn: ({ signal }) => api<EmailCounts>(`/api/emails/counts${query({ account, q })}`, { signal }),
    placeholderData: keepPreviousData,
    retry: false,
  });

export const useEmailEvents = (id: string, paging: Paging) =>
  useQuery({
    queryKey: [...keys.email(id), 'events', paging],
    queryFn: ({ signal }) => api<Page<EventView>>(`/api/emails/${encodeURIComponent(id)}/events${query({ page: paging.page, size: paging.size })}`, { signal }),
    placeholderData: keepPreviousData,
  });

export const useContacts = (q: string, paging: Paging) =>
  useQuery({
    queryKey: [...keys.contacts, q, paging],
    queryFn: ({ signal }) => api<Page<ContactSummary>>(`/api/contacts${query({ q, ...paging })}`, { signal }),
    placeholderData: keepPreviousData,
  });

export const useContactEmails = (address: string, paging: Paging) =>
  useQuery({
    queryKey: [...keys.contacts, 'emails', address, paging],
    queryFn: ({ signal }) => api<Page<EmailSummary>>(`/api/contacts/${encodeURIComponent(address)}/emails${query({ ...paging })}`, { signal }),
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

export const useAlerts = (status: 'active' | 'all', page: number, enabled = true, size = 25) =>
  useQuery({
    enabled,
    queryKey: [...keys.alerts, status, page, size],
    queryFn: ({ signal }) => api<AlertPage>(`/api/alerts${query({ status, page, size })}`, { signal }),
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

export const useNotifications = (enabled = true) =>
  useQuery({
    enabled,
    queryKey: keys.notifications,
    queryFn: ({ signal }) => api<NotificationPage>(`/api/notifications${query({ limit: 30 })}`, { signal }),
    retry: false,
  });

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (upToId: number) => api<void>('/api/notifications/read', { method: 'POST', body: { upToId } }),
    onSuccess: (_, upToId) => {
      client.setQueryData<NotificationPage>(keys.notifications, (current) => (current ? { ...current, unread: 0, lastReadId: upToId } : current));
    },
  });
}

export const useSearch = (q: string) =>
  useQuery({
    enabled: q.trim().length >= 2,
    queryKey: [...keys.search, q.trim()],
    queryFn: ({ signal }) => api<SearchResults>(`/api/search${query({ q: q.trim() })}`, { signal }),
    placeholderData: keepPreviousData,
    retry: false,
  });

/** "That was me" on a counted open or click, and its undo. Both answer with the updated detail. */
export function useMarkMine(emailId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { eventId: number; mine: boolean }) =>
      api<EmailDetail>(`/api/emails/${encodeURIComponent(emailId)}/events/${input.eventId}/mine`, { method: input.mine ? 'POST' : 'DELETE' }),
    onSuccess: (detail) => {
      client.setQueryData(keys.email(emailId), detail);
      for (const queryKey of LIVE_KEYS) void client.invalidateQueries({ queryKey });
    },
  });
}

export const useDocuments = () => useQuery({ queryKey: keys.documents, queryFn: ({ signal }) => api<DocumentSummary[]>('/api/documents', { signal }) });

export const useDocument = (id: string) =>
  useQuery({ queryKey: keys.document(id), queryFn: ({ signal }) => api<DocumentDetail>(`/api/documents/${encodeURIComponent(id)}`, { signal }) });

export const useDocumentLinks = (id: string, paging: Paging) =>
  useQuery({
    queryKey: [...keys.document(id), 'links', paging],
    queryFn: ({ signal }) => api<Page<DocLinkView>>(`/api/documents/${encodeURIComponent(id)}/links${query({ page: paging.page, size: paging.size })}`, { signal }),
    placeholderData: keepPreviousData,
  });

export const useDocumentEvents = (id: string, paging: Paging) =>
  useQuery({
    queryKey: [...keys.document(id), 'events', paging],
    queryFn: ({ signal }) => api<Page<DocEventView>>(`/api/documents/${encodeURIComponent(id)}/events${query({ page: paging.page, size: paging.size })}`, { signal }),
    placeholderData: keepPreviousData,
  });

function useDocumentChange<I, R>(change: (input: I) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.documents });
      void client.invalidateQueries({ queryKey: ['document'] });
    },
  });
}

export const useUploadDocument = () =>
  useDocumentChange((input: { file: File; onProgress: (fraction: number) => void }) => {
    const form = new FormData();
    form.append('file', input.file);
    return upload<DocumentSummary>('/api/documents', form, { onProgress: input.onProgress });
  });

export const useReplaceDocument = () =>
  useDocumentChange((input: { id: string; file: File; onProgress: (fraction: number) => void }) => {
    const form = new FormData();
    form.append('file', input.file);
    return upload<DocumentSummary>(`/api/documents/${encodeURIComponent(input.id)}/file`, form, { method: 'PUT', onProgress: input.onProgress });
  });

export const useRenameDocument = () =>
  useDocumentChange((input: { id: string; name: string }) =>
    api<DocumentSummary>(`/api/documents/${encodeURIComponent(input.id)}`, { method: 'PATCH', body: { name: input.name } }),
  );

export const useDeleteDocument = () => useDocumentChange((id: string) => api<void>(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }));

export interface NewLink {
  label?: string;
  emailId?: string;
  expiresAt?: string;
  allowDownload?: boolean;
}

export const useCreateLink = (documentId: string) =>
  useDocumentChange((input: NewLink) => api<DocLinkView>(`/api/documents/${encodeURIComponent(documentId)}/links`, { method: 'POST', body: input }));

export interface LinkChange {
  label?: string;
  expiresAt?: string | null;
  allowDownload?: boolean;
  revoked?: boolean;
}

export const useUpdateLink = () =>
  useDocumentChange((input: { id: string; change: LinkChange }) =>
    api<DocLinkView>(`/api/document-links/${encodeURIComponent(input.id)}`, { method: 'PATCH', body: input.change }),
  );
