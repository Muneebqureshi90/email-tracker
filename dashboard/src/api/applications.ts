import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type ApplicationStatus = 'APPLIED' | 'INTERVIEW' | 'OFFER' | 'REJECTED';

export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: 'APPLIED', label: 'Applied' },
  { value: 'INTERVIEW', label: 'Interview' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'REJECTED', label: 'Rejected' },
];

export interface Application {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  /** YYYY-MM-DD */
  appliedOn: string | null;
  notes: string | null;
  emailId: string | null;
  emailSubject: string | null;
  opens: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationInput {
  company: string;
  role: string;
  status: ApplicationStatus;
  appliedOn: string | null;
  notes: string | null;
  emailId: string | null;
}

const APPLICATIONS_KEY = ['applications'] as const;

export function useApplications() {
  return useQuery({
    queryKey: APPLICATIONS_KEY,
    queryFn: ({ signal }) => api<Application[]>('/api/applications', { signal }),
  });
}

export function useCreateApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationInput) => api<Application>('/api/applications', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
  });
}

export function useUpdateApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<ApplicationInput> }) =>
      api<Application>(`/api/applications/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }),
    onSuccess: () => client.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
  });
}

export function useDeleteApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/applications/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
  });
}
