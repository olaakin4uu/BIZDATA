'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { dataRecordsApi, type DataRecord } from '@/lib/api/data-records';
import { formatMoney, formatPercent, formatDateTime, statusBadge, extractErrorMessage } from '@/lib/utils';

type Params = Promise<{ id: string }>;

function tpName(t: DataRecord['taxpayer']): string {
  if (!t) return '—';
  if (t.businessName) return t.businessName;
  return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || '—';
}

export default function DataRecordDetailPage({ params }: { params: Params }) {
  const { id } = usePromise(params);
  const [rec, setRec] = useState<DataRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setLoading(true);
    dataRecordsApi.get(id)
      .then(setRec)
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id]);

  const handleReview = async (status: 'CLEARED' | 'CONFIRMED') => {
    if (!confirm(`Mark this record as ${status}?`)) return;
    setBusy(true);
    try {
      await dataRecordsApi.review(id, status, reviewNotes || undefined);
      setReviewNotes('');
      refresh();
    } catch (e) {
      alert(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (!rec) return (
    <div className="p-6">
      <PageHeader title="Data record" actions={<Link href="/data-records" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>} />
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error ?? 'Not found'}</div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title={`Record ${rec.id.slice(0, 8)}`}
        subtitle={`${rec.provider?.name ?? rec.providerId} · ${rec.periodLabel}`}
        actions={<Link href="/data-records" className="text-sm text-slate-600 hover:text-slate-900">← All records</Link>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Info label="Provider type" value={rec.providerType.replace('_', ' ')} />
        <Info label="Period" value={`${rec.periodLabel} (${rec.periodYear})`} />
        <Info label="Taxpayer" value={rec.taxpayer ? (
          <Link href={`/taxpayers/${rec.taxpayer.id}`} className="text-teal-700 hover:underline">{tpName(rec.taxpayer)}</Link>
        ) : <span className="text-slate-400">unlinked</span>} />
        <Info label="Account #" value={rec.accountNumber ?? '—'} />
        <Info label="BVN" value={rec.bvn ?? '—'} />
        <Info label="NIN" value={rec.nin ?? '—'} />
        <Info label="Phone" value={rec.phoneNumber ?? '—'} />
        <Info label="Wallet ID" value={rec.walletId ?? '—'} />
        <Info label="Merchant ID" value={rec.merchantId ?? '—'} />
        <Info label="Account name" value={rec.accountName ?? '—'} />
        <Info label="Transaction count" value={rec.transactionCount ?? '—'} />
        <Info label="Inflow" value={formatMoney(rec.totalInflow)} />
        <Info label="Outflow" value={formatMoney(rec.totalOutflow)} />
        <Info label="Opening balance" value={formatMoney(rec.openingBalance)} />
        <Info label="Closing balance" value={formatMoney(rec.closingBalance)} />
      </div>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Flagging</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 text-sm">
          {rec.flaggedAsUnderdeclared ? (
            <>
              <p className="font-medium text-red-700 mb-2">⚠ Flagged as underdeclared</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3 text-xs">
                <div><span className="text-slate-500">Declared:</span> <span className="font-medium">{formatMoney(rec.declaredIncome)}</span></div>
                <div><span className="text-slate-500">Discrepancy:</span> <span className="font-medium">{formatMoney(rec.discrepancyAmount)}</span></div>
                <div><span className="text-slate-500">Discrepancy %:</span> <span className="font-medium">{formatPercent(rec.discrepancyPct)}</span></div>
                <div><span className="text-slate-500">Flagged at:</span> <span>{formatDateTime(rec.flaggedAt)}</span></div>
              </div>
              <div className="mb-2">
                <span className="text-xs text-slate-500">Review status: </span>
                {rec.reviewStatus ? (
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(rec.reviewStatus)}`}>
                    {rec.reviewStatus.replace('_', ' ')}
                  </span>
                ) : <span className="text-xs text-slate-400">—</span>}
              </div>
              {rec.reviewedBy && (
                <p className="text-xs text-slate-500">
                  Reviewed by {rec.reviewedBy.firstName} {rec.reviewedBy.lastName} on {formatDateTime(rec.reviewedAt)}
                </p>
              )}
              {rec.reviewNotes && (
                <p className="text-xs text-slate-700 mt-2 italic">“{rec.reviewNotes}”</p>
              )}

              {rec.reviewStatus === 'PENDING_REVIEW' && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <input
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Review notes (optional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReview('CLEARED')}
                      disabled={busy}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => handleReview('CONFIRMED')}
                      disabled={busy}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                    >
                      Confirm fraud
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-500">Not flagged.</p>
          )}
        </div>
      </section>

      {rec.submission && (
        <Info
          label="Source submission"
          value={
            <Link href={`/submissions/${rec.submission.id}`} className="text-teal-700 hover:underline text-sm">
              {rec.submission.fileName ?? rec.submission.id.slice(0, 8)} · {rec.submission.periodLabel}
            </Link>
          }
        />
      )}

      {!!rec.payload && (
        <details className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <summary className="text-sm font-medium text-slate-700 cursor-pointer">Raw payload</summary>
          <pre className="mt-3 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded p-3 overflow-auto max-h-72">
            {JSON.stringify(rec.payload, null, 2)}
          </pre>
        </details>
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
