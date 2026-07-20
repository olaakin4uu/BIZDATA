'use client';
import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  cell: (row: T) => React.ReactNode;
  /** When set (with `sort`/`onSort` on the table), the header becomes a sort control. */
  sortKey?: string;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** When set, renders a distinct error card (never aliases a failure to "empty"). */
  error?: string | null;
  onRetry?: () => void;
  emptyText?: string;
  rowClassName?: (row: T) => string;
  total?: number;
  page?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  /** Optional caption for assistive tech (visually hidden). */
  caption?: string;
  sort?: SortState;
  onSort?: (key: string) => void;
}

const STATE_CARD = 'rounded-xl border bg-[var(--surface)] shadow-[var(--elev-1)]';

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyText = 'No records found',
  rowClassName,
  total,
  page,
  limit,
  onPageChange,
  caption,
  sort,
  onSort,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center justify-center gap-3 border-[var(--line)] py-16 text-sm text-[var(--ink-2)] ${STATE_CARD}`}
      >
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" aria-hidden />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className={`border-[var(--bad)]/30 py-14 text-center ${STATE_CARD}`}>
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bad-soft)] text-[var(--bad)]">
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </span>
        <p className="text-sm font-medium text-[var(--ink)]">Couldn’t load this data</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--ink-2)]">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div role="status" aria-live="polite" className={`border-dashed border-[var(--line)] py-16 text-center ${STATE_CARD}`}>
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--ink-3)] ring-1 ring-[var(--line)]">
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 9h16M9 9v11" /></svg>
        </span>
        <p className="text-sm text-[var(--ink-2)]">{emptyText}</p>
      </div>
    );
  }

  const showPager = total != null && page != null && limit != null && onPageChange && total > limit;
  const totalPages = showPager ? Math.max(1, Math.ceil(total! / limit!)) : 1;

  const ariaSort = (col: Column<T>): React.AriaAttributes['aria-sort'] => {
    if (!col.sortKey || !sort || sort.key !== col.sortKey) return undefined;
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elev-1)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="border-b border-[var(--line)] bg-[var(--surface-2)]">
            <tr>
              {columns.map((col) => {
                const sortable = col.sortKey && onSort;
                const active = sort && col.sortKey === sort.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort(col)}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)] ${col.className ?? ''}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort!(col.sortKey!)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-[var(--ink)]"
                      >
                        {col.header}
                        <span aria-hidden className={active ? 'text-teal-600' : 'text-[var(--ink-3)]/60'}>
                          {active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`transition-colors hover:bg-[var(--surface-2)] ${rowClassName ? rowClassName(row) : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 text-sm text-[var(--ink-2)] ${col.className ?? ''}`}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPager && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between border-t border-[var(--line-2)] bg-[var(--surface-2)] px-5 py-3 text-xs text-[var(--ink-3)]"
        >
          <span className="tnum" aria-live="polite">
            Page {page} of {totalPages} · {total!.toLocaleString()} record{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange!(Math.max(1, (page ?? 1) - 1))}
              disabled={(page ?? 1) <= 1}
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden>←</span> Prev
            </button>
            <button
              onClick={() => onPageChange!(Math.min(totalPages, (page ?? 1) + 1))}
              disabled={(page ?? 1) >= totalPages}
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <span aria-hidden>→</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default DataTable;
