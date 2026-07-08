'use client';
import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  cell: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyText?: string;
  rowClassName?: (row: T) => string;
  total?: number;
  page?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyText = 'No records found',
  rowClassName,
  total,
  page,
  limit,
  onPageChange,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] py-16 text-sm text-[var(--ink-3)] shadow-[var(--elev-1)]">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] py-16 text-center shadow-[var(--elev-1)]">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--ink-3)] ring-1 ring-[var(--line)]">
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 9h16M9 9v11" /></svg>
        </span>
        <p className="text-sm text-[var(--ink-2)]">{emptyText}</p>
      </div>
    );
  }

  const showPager = total != null && page != null && limit != null && onPageChange && total > limit;
  const totalPages = showPager ? Math.max(1, Math.ceil(total! / limit!)) : 1;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elev-1)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--surface-2)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)] ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-2)]">
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
        <div className="flex items-center justify-between border-t border-[var(--line-2)] bg-[var(--surface-2)] px-5 py-3 text-xs text-[var(--ink-3)]">
          <span className="tnum">
            Page {page} of {totalPages} · {total!.toLocaleString()} record{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange!(Math.max(1, (page ?? 1) - 1))}
              disabled={(page ?? 1) <= 1}
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1 transition-colors hover:bg-[var(--surface-2)] hover:border-teal-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange!(Math.min(totalPages, (page ?? 1) + 1))}
              disabled={(page ?? 1) >= totalPages}
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1 transition-colors hover:bg-[var(--surface-2)] hover:border-teal-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
