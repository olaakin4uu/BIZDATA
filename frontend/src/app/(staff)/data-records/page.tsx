'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import { dataRecordsApi, type DataRecord } from '@/lib/api/data-records';
import { providersApi, type Provider } from '@/lib/api/providers';
import { SECTION_29_PROVIDER_TYPES, REVIEW_STATUSES, formatMoney, statusBadge } from '@/lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function tpName(t: DataRecord['taxpayer']): string {
  if (!t) return '—';
  if (t.businessName) return t.businessName;
  return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || '—';
}

export default function DataRecordsPage() {
  const [rows, setRows] = useState<DataRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [providerId, setProviderId] = useState('');
  const [providerType, setProviderType] = useState('');
  const [periodYear, setPeriodYear] = useState<number | ''>('');
  const [flagged, setFlagged] = useState<'' | 'true' | 'false'>('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const limit = 50;

  useEffect(() => {
    providersApi.list({ limit: 200 }).then((r) => setProviders(r.providers)).catch(() => setProviders([]));
  }, []);

  const load = () => {
    setLoading(true);
    dataRecordsApi
      .list({
        providerId: providerId || undefined,
        providerType: providerType || undefined,
        periodYear: periodYear || undefined,
        flagged: flagged || undefined,
        reviewStatus: reviewStatus || undefined,
        page,
        limit,
      })
      .then((r) => { setRows(r.records); setTotal(r.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, providerId, providerType, periodYear, flagged, reviewStatus]);

  const columns: Column<DataRecord>[] = [
    { key: 'period', header: 'Period', cell: (r) => <span className="font-mono text-xs">{r.periodLabel}</span> },
    { key: 'provider', header: 'Provider', cell: (r) => <span className="text-xs">{r.provider?.name ?? '—'}</span> },
    {
      key: 'tp', header: 'Taxpayer',
      cell: (r) => r.taxpayer ? (
        <Link href={`/taxpayers/${r.taxpayer.id}`} className="text-teal-700 hover:underline">{tpName(r.taxpayer)}</Link>
      ) : <span className="text-slate-400 text-xs">unlinked</span>,
    },
    { key: 'account', header: 'Account / BVN', cell: (r) => <span className="font-mono text-xs text-slate-500">{r.accountNumber ?? r.bvn ?? r.phoneNumber ?? r.walletId ?? '—'}</span> },
    { key: 'inflow', header: 'Inflow', cell: (r) => <span className="text-xs font-medium">{formatMoney(r.totalInflow)}</span> },
    {
      key: 'flag', header: 'Flagged',
      cell: (r) => r.flaggedAsUnderdeclared ? (
        <span className="inline-flex px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">YES</span>
      ) : <span className="text-xs text-slate-400">—</span>,
    },
    {
      key: 'review', header: 'Review',
      cell: (r) => r.reviewStatus ? (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(r.reviewStatus)}`}>
          {r.reviewStatus.replace(/_/g, ' ')}
        </span>
      ) : <span className="text-xs text-slate-400">—</span>,
    },
    {
      key: 'view', header: '', cell: (r) => (
        <Link href={`/data-records/${r.id}`} className="text-xs text-teal-700 hover:underline font-medium">
          View →
        </Link>
      ),
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Data records"
        subtitle="All ingested rows across every provider type."
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Provider</label>
          <select value={providerId} onChange={(e) => { setProviderId(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
          <select value={providerType} onChange={(e) => { setProviderType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All</option>
            {SECTION_29_PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
          <select value={periodYear} onChange={(e) => { setPeriodYear(e.target.value ? Number(e.target.value) : ''); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Flagged</label>
          <select value={flagged} onChange={(e) => { setFlagged(e.target.value as 'true' | 'false' | ''); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All</option>
            <option value="true">Flagged only</option>
            <option value="false">Not flagged</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Review</label>
          <select value={reviewStatus} onChange={(e) => { setReviewStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All</option>
            {REVIEW_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText="No data records match the filter."
        rowClassName={(r) => r.flaggedAsUnderdeclared && r.reviewStatus === 'PENDING_REVIEW' ? 'bg-red-50/30' : ''}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
