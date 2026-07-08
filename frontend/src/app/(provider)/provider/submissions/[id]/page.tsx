'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import Icon from '@/components/Icon';
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
      <PageHeader title="Submission" icon="document" actions={<Link href="/provider/submissions" className="text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]">← Back</Link>} />
      <div className="rounded-lg border border-rose-200 bg-[var(--bad-soft)] px-4 py-3 text-sm text-rose-700">{error ?? 'Not found'}</div>
    </div>
  );

  const errors = sub.validationErrors as Record<string, unknown> | null | undefined;
  const needsResubmit = sub.status === 'REJECTED' || sub.status === 'PARTIALLY_ACCEPTED';
  const warnings = Array.isArray(sub.warnings) ? sub.warnings : [];

  return (
    <div className="rise-in">
      <PageHeader
        title={`Submission ${sub.id.slice(0, 8)}`}
        subtitle={`Period ${sub.periodLabel}`}
        icon="document"
        actions={<Link href="/provider/submissions" className="text-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]">← All submissions</Link>}
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

      {warnings.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-[var(--warn-soft)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
              <Icon name="flag" width={16} height={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                Accepted — but action needed before these fields become mandatory
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                {sub.warningCount?.toLocaleString() ?? warnings.length} row(s) are missing fields that will be <strong>required in future</strong>.
                They were accepted this time, but files with these fields left blank will be rejected once the requirement takes effect.
                Please start populating them.
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-[11px] text-amber-700">
                {warnings.slice(0, 20).map((w) => (
                  <li key={w.row} className="tnum font-mono">Row {w.row}: {w.messages.join('; ')}</li>
                ))}
                {warnings.length > 20 && <li className="text-amber-600">…and {warnings.length - 20} more.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {sub.receiptHash && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-100 bg-[var(--ok-soft)] px-5 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
            <Icon name="shield" width={16} height={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/80">Acknowledgment receipt (§6.5)</p>
            <p className="mt-0.5 break-all font-mono text-xs text-emerald-800">{sub.receiptHash}</p>
          </div>
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
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-100">
              <Icon name="flag" width={14} height={14} />
            </span>
            Validation errors
          </h2>
          <p className="mb-2 text-xs text-[var(--ink-2)]">
            Rows that failed validation. Please correct and resubmit if needed.
          </p>
          <pre className="max-h-72 overflow-auto rounded-xl border border-rose-200 bg-[var(--bad-soft)] p-4 font-mono text-[11px] text-rose-800">
            {JSON.stringify(errors, null, 2)}
          </pre>
        </section>
      )}

      {sub.records && sub.records.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                <Icon name="records" width={14} height={14} />
              </span>
              Sample of ingested records
            </h2>
            <span className="text-[11px] text-[var(--ink-3)]">Account &amp; BVN are masked for privacy.</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elev-1)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--surface-2)]">
                <tr>
                  {['Account', 'BVN', 'Name', 'Inflow', 'Flagged'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-2)]">
                {sub.records.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-[var(--surface-2)]">
                    <td className="tnum px-4 py-3 font-mono text-xs text-[var(--ink)]">{r.accountNumber ?? '—'}</td>
                    <td className="tnum px-4 py-3 font-mono text-xs text-[var(--ink-3)]">{r.bvn ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-[var(--ink-2)]">{r.accountName ?? '—'}</td>
                    <td className="tnum px-4 py-3 text-xs font-medium text-[var(--ink)]">{formatMoney(r.totalInflow)}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.flaggedAsUnderdeclared ? (
                        <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">FLAGGED</span>
                      ) : <span className="text-[var(--ink-3)]">—</span>}
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
    <div className="lift rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--elev-1)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{label}</p>
      <div className="mt-1 text-sm text-[var(--ink)]">{value}</div>
    </div>
  );
}
