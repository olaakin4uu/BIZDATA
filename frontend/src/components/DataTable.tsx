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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center text-slate-400 text-sm">
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center text-slate-400 text-sm">
        {emptyText}
      </div>
    );
  }

  const showPager = total != null && page != null && limit != null && onPageChange && total > limit;
  const totalPages = showPager ? Math.max(1, Math.ceil(total! / limit!)) : 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`hover:bg-slate-50 ${rowClassName ? rowClassName(row) : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 text-sm text-slate-700 ${col.className ?? ''}`}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPager && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
          <span>
            Page {page} of {totalPages} · {total!.toLocaleString()} record{total === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange!(Math.max(1, (page ?? 1) - 1))}
              disabled={(page ?? 1) <= 1}
              className="px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange!(Math.min(totalPages, (page ?? 1) + 1))}
              disabled={(page ?? 1) >= totalPages}
              className="px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
