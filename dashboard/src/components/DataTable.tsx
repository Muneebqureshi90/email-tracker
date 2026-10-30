import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { SortDir } from '../lib/paging';
import { Skeleton } from './controls';
import { ErrorBox } from './ui';

/**
 * The identifying first column: on wide screens it takes the space the other columns leave (its
 * text truncates); on phones it stays at most 12rem wide and sticky while the table scrolls sideways.
 */
export const MAIN_COLUMN = 'max-w-48 md:w-full md:max-w-0';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** The API sort key; the header becomes a sort button. */
  sort?: string;
  align?: 'right';
  /** Classes for the header and the cells, e.g. a width. */
  className?: string;
  /** Header text for screen readers only (e.g. the status mark column). */
  srOnlyHeader?: boolean;
}

/**
 * A table in its own horizontal scroll container: sticky header (just below the fixed top bar on
 * wide screens when `stickyHeader`), sticky first column while it scrolls sideways, right-aligned
 * numbers, row hover, the whole row clickable (the first cell keeps a real link for keyboard
 * users), and skeleton, empty and error states. `mobile` swaps in a phone layout under 768 px.
 */
export function DataTable<T>({
  label,
  columns,
  rows,
  rowKey,
  rowTo,
  sort,
  dir = 'desc',
  onSort,
  error,
  onRetry,
  empty,
  skeletonRows = 6,
  mobile,
  stickyHeader = false,
  busy = false,
}: {
  label: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  rowTo?: (row: T) => string;
  sort?: string | undefined;
  dir?: SortDir;
  onSort?: (key: string) => void;
  error?: unknown;
  onRetry?: () => void;
  empty: ReactNode;
  skeletonRows?: number;
  mobile?: (rows: T[]) => ReactNode;
  stickyHeader?: boolean;
  /** A new page is loading while the old rows still show. */
  busy?: boolean;
}) {
  const navigate = useNavigate();
  if (rows === undefined && error) {
    return (
      <div className="p-4">
        <ErrorBox error={error} onRetry={onRetry} />
      </div>
    );
  }
  if (rows !== undefined && rows.length === 0) return <>{empty}</>;

  const open = (row: T) => (event: MouseEvent<HTMLTableRowElement>) => {
    if (!rowTo || (event.target as HTMLElement).closest('a,button,input,[role="combobox"],[role="switch"]')) return;
    if (window.getSelection()?.toString()) return;
    void navigate(rowTo(row));
  };

  const table = (
    <div className={`${stickyHeader ? 'table-wrap-sticky' : 'table-wrap'} ${mobile ? 'hidden md:block' : ''}`}>
      <table className={`table transition-opacity ${busy ? 'opacity-60' : ''}`} aria-label={label} aria-busy={rows === undefined || busy}>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = column.sort !== undefined && column.sort === sort;
              const ariaSort = column.sort && onSort ? (active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;
              const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th key={column.key} scope="col" aria-sort={ariaSort} className={`${column.align === 'right' ? 'text-right' : ''} ${column.className ?? ''}`}>
                  {column.srOnlyHeader ? (
                    <span className="sr-only">{column.header}</span>
                  ) : column.sort && onSort ? (
                    <button
                      type="button"
                      className={`table-head-btn ${active ? 'text-fg' : ''} ${column.align === 'right' ? 'flex-row-reverse' : ''}`}
                      onClick={() => onSort(column.sort!)}
                    >
                      {column.header}
                      <Icon size={12} aria-hidden="true" className={active ? '' : 'opacity-50'} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows === undefined
            ? Array.from({ length: skeletonRows }, (_, index) => (
                <tr key={index} data-testid="skeleton-row">
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}>
                      <Skeleton className={`h-4 ${column.align === 'right' ? 'ml-auto w-8' : 'w-3/4'}`} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr key={rowKey(row)} onClick={open(row)} className={rowTo ? 'cursor-pointer' : ''}>
                  {columns.map((column) => (
                    <td key={column.key} className={`${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.className ?? ''}`}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );

  if (!mobile) return table;
  return (
    <>
      {table}
      <div className="md:hidden">
        {rows === undefined ? (
          <ul className="divide-y divide-line" aria-busy="true" aria-label={label}>
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="space-y-2 px-4 py-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </li>
            ))}
          </ul>
        ) : (
          mobile(rows)
        )}
      </div>
    </>
  );
}
