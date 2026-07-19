'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DataTable, { type Column } from '@/components/DataTable';
import SubmissionUploader from '@/components/SubmissionUploader';
import { submissionsApi, type Submission } from '@/lib/api/submissions';
import { providersApi, type Provider } from '@/lib/api/providers';
import { SUBMISSION_STATUSES, formatDate, formatBytes, statusBadge } from '@/lib/utils';

export default function SubmissionsPage() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [providerId, setProviderId] = useState('');
  const [status, setStatus] = useState('');
  const [periodYear, setPeriodYear] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const limit = 50;

  useEffect(() => {
    providersApi.list({ limit: 200 }).then((r) => setProviders(r.providers)).catch(() => setProviders([]));
  }, []);

  useEffect(() => { setPage(1); }, [providerId, status, periodYear]);

  const load = () => {
    setLoading(true);
    submissionsApi
      .list({ providerId: providerId || undefined, status: status || undefined, periodYear: periodYear || undefined, page, limit })
      .then((r) => { setRows(r.submissions); setTotal(r.total); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, providerId, status, periodYear]);

  const activeProvider = providers.find((p) => p.id === providerId);

  const columns: Column<Submission>[] = [
    {
      key: 'period', header: 'Period',
      cell: (r) => (
        <Link href={`/submissions/${r.id}`} className="text-teal-700 hover:underline font-mono text-xs">
          {r.periodLabel}
        </Link>
      ),
    },
    { key: 'provider', header: 'Provider', cell: (r) => <span className="text-xs">{r.provider?.name ?? '—'}</span> },
    { key: 'file', header: 'File', cell: (r) => <span className="text-xs text-slate-600">{r.fileName ?? '—'}{r.fileSizeBytes ? ` · ${formatBytes(r.fileSizeBytes)}` : ''}</span> },
    {
      key: 'status', header: 'Status',
      cell: (r) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(r.status)}`}>
          {r.status.replace('_', ' ')}
        </span>
      ),
    },
    { key: 'records', header: 'Records', cell: (r) => <span className="text-xs">{r.acceptedCount}/{r.recordCount}{r.rejectedCount ? ` (${r.rejectedCount} rej.)` : ''}</span> },
    { key: 'received', header: 'Received', cell: (r) => <span className="text-xs text-slate-500">{formatDate(r.receivedAt)}</span> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Submissions"
        subtitle="All data files uploaded by providers or staff on their behalf."
        actions={
          <button
            onClick={() => setShowUpload((v) => !v)}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg"
          >
            {showUpload ? 'Close upload' : '+ Upload on behalf'}
          </button>
        }
      />

      {showUpload && (
        <div className="mb-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Provider</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Pick a provider…</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.providerCode})</option>)}
            </select>
          </div>
          {providerId ? (
            <SubmissionUploader
              reportingFrequency={activeProvider?.reportingFrequency}
              onUpload={(payload) => submissionsApi.upload({ providerId, ...payload })}
              submissionLinkPrefix="/submissions"
              description={`Uploading to ${activeProvider?.name ?? providerId} as staff (audited).`}
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-8 text-center text-xs text-slate-400">
              Pick a provider above to upload a file on their behalf.
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Provider</label>
          <select
            value={providerId}
            onChange={(e) => { setProviderId(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">All providers</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All statuses</option>
            {SUBMISSION_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select value={periodYear} onChange={(e) => setPeriodYear(e.target.value ? Number(e.target.value) : '')}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="">All years</option>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyText="No submissions match the filter."
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </div>
  );
}
