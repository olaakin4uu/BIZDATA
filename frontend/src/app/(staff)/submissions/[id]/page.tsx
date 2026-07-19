'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { submissionsApi, type Submission } from '@/lib/api/submissions';
import { formatBytes, formatDateTime, formatMoney, statusBadge, extractErrorMessage } from '@/lib/utils';

type Params = Promise<{ id: string }>;

export default function SubmissionDetailPage({ params }: { params: Params }) {
  const { id } = usePromise(params);
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    submissionsApi.get(id)
      .then(setSub)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (!sub) return (
    <div className="p-6">
      <PageHeader title="Submission" actions={<Link href="/submissions" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>} />
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error ?? 'Not found'}</div>
    </div>
  );

  const errors = sub.validationErrors as Record<string, unknown> | null | undefined;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title={`Submission ${sub.id.slice(0, 8)}`}
        subtitle={`${sub.provider?.name ?? sub.providerId} · period ${sub.periodLabel}`}
        actions={<Link href="/submissions" className="text-sm text-slate-600 hover:text-slate-900">← All submissions</Link>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Info label="Status" value={
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(sub.status)}`}>{sub.status.replace('_', ' ')}</span>
        } />
        <Info label="Period" value={sub.periodLabel} />
        <Info label="Records" value={`${sub.recordCount.toLocaleString()}`} />
        <Info label="Accepted / rejected" value={`${sub.acceptedCount.toLocaleString()} / ${sub.rejectedCount.toLocaleString()}`} />
        <Info label="File" value={sub.fileName ?? '—'} />
        <Info label="Size" value={formatBytes(sub.fileSizeBytes)} />
        <Info label="Received" value={formatDateTime(sub.receivedAt)} />
        <Info label="Processed" value={formatDateTime(sub.processedAt)} />
        {sub.receiptHash && (
          <Info label="Receipt hash (§6.5)" value={<span className="font-mono text-[11px] break-all">{sub.receiptHash}</span>} />
        )}
        {sub.resubmitDueAt && (sub.status === 'REJECTED' || sub.status === 'PARTIALLY_ACCEPTED') && (
          <Info label="Resubmit due (§6.5)" value={<span className="text-amber-700 font-medium">{formatDateTime(sub.resubmitDueAt)}</span>} />
        )}
        {(sub.warningCount ?? 0) > 0 && (
          <Info label="Warnings" value={<span className="text-amber-700 font-medium">{sub.warningCount}</span>} />
        )}
      </div>

      {errors && Object.keys(errors).length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">Validation errors</h2>
          <pre className="bg-red-50 border border-red-200 rounded-xl p-4 text-[11px] font-mono text-red-800 overflow-auto max-h-72">
            {JSON.stringify(errors, null, 2)}
          </pre>
        </section>
      )}

      {sub.warnings && sub.warnings.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">
            Warnings {(sub.warningCount ?? sub.warnings.length) > sub.warnings.length ? `(showing ${sub.warnings.length} of ${sub.warningCount})` : `(${sub.warnings.length})`}
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 max-h-72 overflow-auto space-y-1">
            {sub.warnings.map((w, i) => (
              <div key={i}><span className="font-mono font-semibold">Row {w.row}:</span> {w.messages.join('; ')}</div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Records in this submission ({sub.records?.length ?? 0} shown)</h2>
        {!sub.records || sub.records.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-8 text-center text-xs text-slate-400">
            No records associated with this submission yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Account', 'BVN', 'Name', 'Period', 'Inflow', 'Flagged'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sub.records.map((r) => (
                  <tr key={r.id} className={r.flaggedAsUnderdeclared ? 'bg-red-50/30' : ''}>
                    <td className="px-4 py-3 font-mono text-xs">{r.accountNumber ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.bvn ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">{r.accountName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.periodLabel}</td>
                    <td className="px-4 py-3 text-xs font-medium">{formatMoney(r.totalInflow)}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.flaggedAsUnderdeclared ? (
                        <span className="inline-flex px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">FLAGGED</span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-slate-800 mt-1">{value}</div>
    </div>
  );
}
