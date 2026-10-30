import { useSearchParams } from 'react-router';

/** The page sizes every paged API endpoint accepts (contract "Pagination"). */
export const PAGE_SIZES = [25, 50, 100] as const;
export type SortDir = 'asc' | 'desc';

/** The content area (the only scroll container) back to the top, e.g. after a page change. */
export function scrollContentToTop(): void {
  const content = document.getElementById('content');
  if (content) content.scrollTop = 0;
}

function sizeOf(text: string | null): number {
  const size = Number(text);
  return (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZES[0];
}

/**
 * List state in the URL: `page` (0-based), `size` (25/50/100), `sort`, `dir` and any filters.
 * Any change other than the page itself resets to page 1; every change scrolls the content to the top.
 * `prefix` keeps two lists on one page apart (e.g. "links" and "events" give linksPage and eventsPage).
 */
export function useListParams(prefix = '', defaultSort?: string) {
  const [params, setParams] = useSearchParams();
  const key = (name: string) => (prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name);
  const page = Math.max(0, Math.floor(Number(params.get(key('page')) ?? '0') || 0));
  const size = sizeOf(params.get(key('size')));
  const sort = params.get(key('sort')) ?? defaultSort;
  const dir: SortDir = params.get(key('dir')) === 'asc' ? 'asc' : 'desc';

  /** Merges into the current URL (never a stale copy), so quick changes in a row all stick. */
  const update = (changes: Record<string, string | null | undefined>, options: { replace?: boolean } = {}) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [name, value] of Object.entries(changes)) {
          if (value) next.set(key(name), value);
          else next.delete(key(name));
        }
        if (!('page' in changes)) next.delete(key('page'));
        return next;
      },
      { replace: options.replace ?? false },
    );
    scrollContentToTop();
  };

  return {
    params,
    page,
    size,
    sort,
    dir,
    update,
    get: (name: string) => params.get(key(name)) ?? '',
    setPage: (next: number) => update({ page: next > 0 ? String(next) : null }),
    setSize: (next: number) => update({ size: next === PAGE_SIZES[0] ? null : String(next) }),
    /** Same column flips the direction; a new column starts descending. */
    toggleSort: (column: string) => update({ sort: column === defaultSort ? null : column, dir: sort === column && dir === 'desc' ? 'asc' : null }),
  };
}

/** Client-side paging for lists the API returns whole (documents, tokens). */
export function paginate<T>(items: T[], page: number, size: number): T[] {
  return items.slice(page * size, page * size + size);
}

/** The last page that still has items, so a shrinking list never shows an empty page. */
export function clampPage(page: number, size: number, total: number): number {
  return Math.min(page, Math.max(0, Math.ceil(total / size) - 1));
}
