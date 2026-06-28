'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import { declaredIncomeApi, type DeclaredIncome } from '@/lib/api/declared-income';
import { formatMoney } from '@/lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function tpName(t: DeclaredIncome['taxpayer']): string {
  if (!t) return '—';
  if (t.businessName) return t.businessName;
  return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || '—';
}

export default function DeclaredIncomeListPage() {
  const [rows, setRows] = useState<DeclaredIncome[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [year, setYear] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const load = () => {
    setLoading(true);
    declaredIncomeApi
      .list({ year: year || undefined, page, limit })
      .then((r) => { setRows(r.records); setTotal(r.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, year]);

  const columns: Column<DeclaredIncome>[] = [
    { key: 'year', header: 'Year', cell: (r) => <span className="font-mono text-xs">{r.year}</span> },
    {
      key: 'tp', header: 'Taxpayer',
      cell: (r) => r.taxpayer ? (
        <Link href={`/taxpayers/${r.taxpayer.id}`} className="text-teal-700 hover:underline font-medium">
          {tpName(r.taxpayer)}
        </Link>
      ) : '—',
    },
    { key: 'tid', header: 'TIN / ID', cell: (r) => <span className="font-mono text-xs text-slate-500">{r.taxpayer?.nin ?? r.taxpayer?.cacRcNumber ?? '—'}</span> },
    { key: 'amt', header: 'Assessable income', cell: (r) => <span className="font-medium">{formatMoney(r.assessableIncome)}</span> },
    { key: 'src', header: 'Source', cell: (r) => <span className="text-xs text-slate-500">{r.source ?? '—'}</span> },
    { key: 'notes', header: 'Notes', cell: (r) => <span className="text-xs text-slate-500">{r.notes ?? '—'}</span> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Declared income"
        subtitle="Annual income declarations used in underdeclaration scans."
        actions={
          <Link href="/declared-income/import" className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg">
            ⬆ Import CSV
          </Link>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
          <select value={year} onChange={(e) => { setYear(e.target.value ? Number(e.target.value) : ''); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText="No declared income recorded for that filter."
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
