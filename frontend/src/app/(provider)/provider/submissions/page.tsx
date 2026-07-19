'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import { providerPortalApi } from '@/lib/api/provider-portal';
import type { Submission } from '@/lib/api/submissions';
import { SUBMISSION_STATUSES, formatDate, formatBytes, statusBadge, extractErrorMessage } from '@/lib/utils';

export default function ProviderSubmissionsPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const limit = 25;

  const load = () => {
    setLoading(true); setErr(null);
    providerPortalApi
      .listSubmissions({ status: status || undefined, page, limit })
      .then((r) => { setRows(r.submissions); setTotal(r.total); })
      .catch((e) => { setRows([]); setTotal(0); setErr(extractErrorMessage(e)); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, status]);

  const columns: Column<Submission>[] = [
    {
      key: 'period', header: 'Period',
      cell: (r) => (
        <Link href={`/provider/submissions/${r.id}`} className="text-teal-700 hover:underline font-mono text-xs">
          {r.periodLabel}
        </Link>
      ),
    },
    { key: 'file', header: 'File', cell: (r) => <span className="text-xs">{r.fileName ?? '—'}{r.fileSizeBytes ? ` · ${formatBytes(r.fileSizeBytes)}` : ''}</span> },
    {
      key: 'status', header: 'Status',
      cell: (r) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(r.status)}`}>
          {r.status.replace('_', ' ')}
        </span>
      ),
    },
    { key: 'records', header: 'Records', cell: (r) => <span className="text-xs">{r.acceptedCount}/{r.recordCount}{r.rejectedCount ? ` (${r.rejectedCount} rej.)` : ''}</span> },
    { key: 'created', header: 'Submitted', cell: (r) => <span className="text-xs text-slate-500">{formatDate(r.createdAt)}</span> },
  ];

  return (
    <div className="rise-in">
      <PageHeader
        title="Submissions"
        subtitle="History of files you have uploaded to FinData."
        icon="document"
        actions={
          <Link href="/provider/submissions/new"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99]"
            style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-brand)' }}>
            <span className="text-base leading-none">+</span> New submission
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--elev-1)]">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm transition-colors focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50">
            <option value="">All statuses</option>
            {SUBMISSION_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      {err && (
        <div className="mb-3 px-4 py-3 bg-[var(--bad-soft)] border border-rose-200 rounded-lg text-sm text-rose-700 flex items-center justify-between">
          <span>Couldn’t load your submissions: {err}</span>
          <button onClick={load} className="text-xs text-teal-700 hover:underline font-medium">Retry</button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText={err ? 'Unable to load submissions.' : 'No submissions yet.'}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
