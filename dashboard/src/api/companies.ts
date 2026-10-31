import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/** One company (address domain); domain null groups personal free-mail addresses. */
export interface CompanySummary {
  domain: string | null;
  contacts: number;
  emails: number;
  opened: number;
  clicked: number;
  replied: number;
  lastActivityAt: string | null;
}

export const useCompanies = (enabled: boolean) =>
  useQuery({
    queryKey: ['contacts', 'companies'],
    queryFn: ({ signal }) => api<CompanySummary[]>('/api/contacts/companies', { signal }),
    enabled,
  });

export function companyName(company: CompanySummary): string {
  return company.domain ?? 'Personal addresses';
}

export function replyRate(company: CompanySummary): number {
  return company.emails > 0 ? company.replied / company.emails : 0;
}

/** Companies whose name contains the text, most emailed first. */
export function filterCompanies(companies: CompanySummary[], text: string): CompanySummary[] {
  const needle = text.trim().toLowerCase();
  return companies
    .filter((company) => needle === '' || companyName(company).toLowerCase().includes(needle))
    .sort((a, b) => b.emails - a.emails || (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));
}
