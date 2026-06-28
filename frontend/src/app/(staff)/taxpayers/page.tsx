'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import { taxpayersApi, type Taxpayer } from '@/lib/api/taxpayers';
import { TAXPAYER_TYPES, TAXPAYER_STATUSES, statusBadge } from '@/lib/utils';

function nameOf(t: Taxpayer): string {
  if (t.type === 'INDIVIDUAL') return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || '—';
  return t.businessName ?? '—';
}

const RISK_COLOR: Record<string, string> = {
  LOW: 'text-emerald-700',
  MEDIUM: 'text-amber-700',
  HIGH: 'text-orange-700',
  CRITICAL: 'text-red-700',
};

export default function TaxpayersListPage() {
  const [rows, setRows] = useState<Taxpayer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const load = () => {
    setLoading(true);
    taxpayersApi
      .list({ search: search || undefined, type: type || undefined, status: status || undefined, page, limit })
      .then((r) => { setRows(r.taxpayers); setTotal(r.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, type, status]);

  const columns: Column<Taxpayer>[] = [
    {
      key: 'name', header: 'Name',
      cell: (r) => (
        <Link href={`/taxpayers/${r.id}`} className="font-medium text-teal-700 hover:underline">
          {nameOf(r)}
        </Link>
      ),
    },
    { key: 'type', header: 'Type', cell: (r) => <span className="text-xs">{r.type}</span> },
    { key: 'tin', header: 'TIN / ID', cell: (r) => <span className="font-mono text-xs">{r.tin ?? r.nin ?? r.cacRcNumber ?? '—'}</span> },
    { key: 'state', header: 'State', cell: (r) => <span className="text-xs text-slate-600">{r.stateOfResidence ?? '—'}</span> },
    {
      key: 'risk', header: 'Risk',
      cell: (r) => (
        <span className={`text-xs font-semibold ${RISK_COLOR[r.riskLevel] ?? 'text-slate-600'}`}>
          {r.riskLevel} ({r.riskScore})
        </span>
      ),
    },
    {
      key: 'status', header: 'Status',
      cell: (r) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(r.status)}`}>
          {r.status}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Taxpayer registry"
        subtitle="Individuals and corporates the platform tracks."
        actions={
          <>
            <Link href="/taxpayers/import" className="px-3 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">
              ⬆ Import CSV
            </Link>
            <Link href="/taxpayers/new" className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg">
              + New taxpayer
            </Link>
          </>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
            placeholder="Name, NIN, RC number, TIN…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All types</option>
            {TAXPAYER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All statuses</option>
            {TAXPAYER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={() => { setPage(1); load(); }} className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
          Apply
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText="No taxpayers found — add one or import a CSV."
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
