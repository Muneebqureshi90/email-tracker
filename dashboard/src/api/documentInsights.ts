import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './queries';
import type { DocLinkView } from './types';

/** Reading time on one page of a document, summed over all counted readers. */
export interface PageReading {
  page: number;
  seconds: number;
  readers: number;
}

/** A share link as the backend returns it once view limits exist. */
export type LimitedLink = DocLinkView & { maxViews: number | null };

export interface SafeNewLink {
  label?: string;
  allowDownload?: boolean;
  expiresAt?: string;
  maxViews?: number;
}

export const useDocumentPages = (id: string) =>
  useQuery({
    queryKey: [...keys.document(id), 'pages'],
    queryFn: ({ signal }) => api<PageReading[]>(`/api/documents/${encodeURIComponent(id)}/pages`, { signal }),
  });

export const useCreateSafeLink = (documentId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SafeNewLink) => api<LimitedLink>(`/api/documents/${encodeURIComponent(documentId)}/links`, { method: 'POST', body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.documents });
      void client.invalidateQueries({ queryKey: ['document'] });
    },
  });
};

export type ExpiryChoice = 'never' | '7' | '30' | '90';

export const EXPIRY_CHOICES: { value: ExpiryChoice; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const DAY_MS = 86_400_000;

/** The ISO instant a new link stops working, or undefined for "Never". */
export function expiresAtFor(choice: ExpiryChoice, now: number): string | undefined {
  return choice === 'never' ? undefined : new Date(now + Number(choice) * DAY_MS).toISOString();
}

/** "Expires in 7 days", "Expired", or null for a link without an end date. */
export function expiryText(expiresAt: string | null, now: number): string | null {
  if (!expiresAt) return null;
  const left = Date.parse(expiresAt) - now;
  if (left <= 0) return 'Expired';
  const days = Math.ceil(left / DAY_MS);
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The view limit of a link, when the backend sent one. */
export function maxViewsOf(link: DocLinkView): number | null {
  return 'maxViews' in link && typeof link.maxViews === 'number' ? link.maxViews : null;
}

/** An error for the "Max views" field, or null when it is empty or a whole number from 1 to 1000. */
export function maxViewsProblem(text: string): string | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? null : 'Max views must be a whole number from 1 to 1000.';
}
