'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { providersApi, type Provider } from '@/lib/api/providers';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import { PROVIDER_TYPES, PROVIDER_STATUSES, statusBadge, formatDate } from '@/lib/utils';

export default function ProvidersListPage() {
  const [rows, setRows] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [providerType, setProviderType] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const load = () => {
    setLoading(true);
    providersApi
      .list({
        search: search || undefined,
        providerType: providerType || undefined,
        status: status || undefined,
        page,
        limit,
      })
      .then((r) => {
        setRows(r.providers);
        setTotal(r.total);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, providerType, status]);

  const columns: Column<Provider>[] = [
    {
      key: 'name',
      header: 'Provider',
      cell: (r) => (
        <Link href={`/providers/${r.id}`} className="font-medium text-teal-700 hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: 'code', header: 'Code', cell: (r) => <span className="font-mono text-xs">{r.providerCode}</span> },
    { key: 'type', header: 'Type', cell: (r) => <span className="text-xs text-slate-600">{r.providerType.replace('_', ' ')}</span> },
    { key: 'freq', header: 'Frequency', cell: (r) => <span className="text-xs text-slate-500">{r.reportingFrequency ?? '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(r.status)}`}>
          {r.status.replace('_', ' ')}
        </span>
      ),
    },
    { key: 'created', header: 'Added', cell: (r) => <span className="text-xs text-slate-500">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Data providers"
        subtitle="Registered banks, fintechs, telcos, FX bureaus, processors, e-commerce platforms"
        actions={
          <Link
            href="/providers/new"
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg"
          >
            + New provider
          </Link>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load(); } }}
            placeholder="Name or code…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
          <select
            value={providerType}
            onChange={(e) => { setProviderType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">All types</option>
            {PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">All statuses</option>
            {PROVIDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={() => { setPage(1); load(); }}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
        >
          Apply
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText="No providers yet — register one to start receiving submissions."
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
