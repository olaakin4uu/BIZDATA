'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { providerPortalApi } from '@/lib/api/provider-portal';
import type { Submission } from '@/lib/api/submissions';
import { formatBytes, formatDateTime, formatMoney, statusBadge, extractErrorMessage } from '@/lib/utils';

type Params = Promise<{ id: string }>;

export default function ProviderSubmissionDetailPage({ params }: { params: Params }) {
  const { id } = usePromise(params);
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    providerPortalApi.getSubmission(id)
      .then(setSub)
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!sub) return (
    <div>
      <PageHeader title="Submission" actions={<Link href="/provider/submissions" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>} />
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error ?? 'Not found'}</div>
    </div>
  );

  const errors = sub.validationErrors as Record<string, unknown> | null | undefined;
  const needsResubmit = sub.status === 'REJECTED' || sub.status === 'PARTIALLY_ACCEPTED';

  return (
    <div>
      <PageHeader
        title={`Submission ${sub.id.slice(0, 8)}`}
        subtitle={`Period ${sub.periodLabel}`}
        actions={<Link href="/provider/submissions" className="text-sm text-slate-600 hover:text-slate-900">← All submissions</Link>}
      />

      {needsResubmit && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {sub.status === 'REJECTED' ? 'This return was rejected.' : `${sub.rejectedCount.toLocaleString()} record(s) were rejected.`}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                Correct the rows below and resubmit
                {sub.resubmitDueAt ? <> by <strong>{formatDateTime(sub.resubmitDueAt)}</strong> (§6.5, 5 business days)</> : ''}.
              </p>
            </div>
            <Link href="/provider/submissions/new" className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
              Resubmit for {sub.periodLabel}
            </Link>
          </div>
        </div>
      )}

      {sub.receiptHash && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Acknowledgment receipt (§6.5)</p>
          <p className="mt-0.5 break-all font-mono text-xs text-slate-600">{sub.receiptHash}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Info label="Status" value={
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(sub.status)}`}>{sub.status.replace('_', ' ')}</span>
        } />
        <Info label="Period" value={sub.periodLabel} />
        <Info label="Records" value={sub.recordCount.toLocaleString()} />
        <Info label="Accepted / rejected" value={`${sub.acceptedCount.toLocaleString()} / ${sub.rejectedCount.toLocaleString()}`} />
        <Info label="File" value={sub.fileName ?? '—'} />
        <Info label="Size" value={formatBytes(sub.fileSizeBytes)} />
        <Info label="Received" value={formatDateTime(sub.receivedAt)} />
        <Info label="Processed" value={formatDateTime(sub.processedAt)} />
      </div>

      {errors && Object.keys(errors).length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">Validation errors</h2>
          <p className="text-xs text-slate-500 mb-2">
            Rows that failed validation. Please correct and resubmit if needed.
          </p>
          <pre className="bg-red-50 border border-red-200 rounded-xl p-4 text-[11px] font-mono text-red-800 overflow-auto max-h-72">
            {JSON.stringify(errors, null, 2)}
          </pre>
        </section>
      )}

      {sub.records && sub.records.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">Sample of ingested records</h2>
            <span className="text-[11px] text-slate-400">Account &amp; BVN are masked for privacy.</span>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Account', 'BVN', 'Name', 'Inflow', 'Flagged'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sub.records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-mono text-xs">{r.accountNumber ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.bvn ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">{r.accountName ?? '—'}</td>
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
        </section>
      )}
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
