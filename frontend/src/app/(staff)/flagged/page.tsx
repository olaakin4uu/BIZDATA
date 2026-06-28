'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { dataRecordsApi, type DataRecord, type DataRecordStats } from '@/lib/api/data-records';
import { formatMoney, formatPercent, extractErrorMessage } from '@/lib/utils';

function tpName(t: DataRecord['taxpayer']): string {
  if (!t) return '—';
  if (t.businessName) return t.businessName;
  return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || '—';
}
function tpId(t: DataRecord['taxpayer']): string {
  if (!t) return '—';
  return t.nin ?? t.cacRcNumber ?? '—';
}

type ConfirmAction = { id: string; status: 'CLEARED' | 'CONFIRMED'; record: DataRecord } | null;

export default function FlaggedReviewPage() {
  const [rows, setRows] = useState<DataRecord[]>([]);
  const [stats, setStats] = useState<DataRecordStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      dataRecordsApi.list({ flagged: 'true', reviewStatus: 'PENDING_REVIEW', limit: 100 }),
      dataRecordsApi.stats(),
    ])
      .then(([r, s]) => {
        setRows(r.records);
        setStats(s);
      })
      .catch(() => {
        setRows([]);
        setStats(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submitDecision = async () => {
    if (!confirmAction) return;
    setBusy(true); setActionError(null);
    try {
      await dataRecordsApi.review(confirmAction.id, confirmAction.status, notes || undefined);
      setRows((r) => r.filter((x) => x.id !== confirmAction.id));
      setConfirmAction(null);
      setNotes('');
      dataRecordsApi.stats().then(setStats).catch(() => {});
    } catch (err) {
      setActionError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Flagged review"
        subtitle="Records flagged by an underdeclaration scan and still awaiting decision."
        actions={
          <Link href="/scan" className="px-3 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">
            🔍 Run a scan
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total records" value={stats?.total?.toLocaleString() ?? '—'} />
        <StatCard
          label="Flagged"
          value={stats?.flagged?.toLocaleString() ?? '—'}
          tone={stats && stats.flagged > 0 ? 'red' : 'default'}
        />
        <StatCard
          label="Pending review"
          value={stats?.pendingReview?.toLocaleString() ?? '—'}
          tone={stats && stats.pendingReview > 0 ? 'amber' : 'default'}
        />
        <StatCard
          label="Confirmed"
          value={stats?.confirmed?.toLocaleString() ?? '—'}
          tone={stats && stats.confirmed > 0 ? 'red' : 'default'}
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-sm text-slate-500">No flagged records pending review.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Taxpayer', 'Provider', 'Period', 'Inflow', 'Declared', 'Discrepancy', 'Action'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs">
                    {r.taxpayer ? (
                      <>
                        <Link href={`/taxpayers/${r.taxpayer.id}`} className="font-medium text-teal-700 hover:underline">
                          {tpName(r.taxpayer)}
                        </Link>
                        <p className="font-mono text-[10px] text-slate-400">{tpId(r.taxpayer)}</p>
                      </>
                    ) : <span className="text-slate-400">unlinked</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">{r.provider?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.periodLabel}</td>
                  <td className="px-4 py-3 text-xs font-medium">{formatMoney(r.totalInflow)}</td>
                  <td className="px-4 py-3 text-xs">{formatMoney(r.declaredIncome)}</td>
                  <td className="px-4 py-3 text-xs text-red-700 font-semibold">
                    {formatMoney(r.discrepancyAmount)} ({formatPercent(r.discrepancyPct, 0)})
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setConfirmAction({ id: r.id, status: 'CLEARED', record: r }); setNotes(''); setActionError(null); }}
                        className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-800 text-white rounded font-medium"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => { setConfirmAction({ id: r.id, status: 'CONFIRMED', record: r }); setNotes(''); setActionError(null); }}
                        className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded font-medium"
                      >
                        Confirm
                      </button>
                      <Link
                        href={`/data-records/${r.id}`}
                        className="px-3 py-1 text-xs border border-slate-300 hover:bg-slate-100 rounded font-medium text-slate-700"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-semibold text-slate-800 mb-2">
              {confirmAction.status === 'CLEARED' ? 'Clear this flag?' : 'Confirm underdeclaration?'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {confirmAction.status === 'CLEARED'
                ? 'Marking this record as CLEARED removes the flag; taxpayer risk is not affected.'
                : 'Marking as CONFIRMED keeps the flag and reduces the taxpayer’s risk score by 15 points.'}
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs mb-3">
              <p><strong>{tpName(confirmAction.record.taxpayer)}</strong> · {confirmAction.record.periodLabel}</p>
              <p className="text-slate-600 mt-1">
                Inflow {formatMoney(confirmAction.record.totalInflow)} vs declared {formatMoney(confirmAction.record.declaredIncome)} — discrepancy {formatMoney(confirmAction.record.discrepancyAmount)}.
              </p>
            </div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3 resize-none"
            />
            {actionError && (
              <div className="px-3 py-2 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{actionError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={submitDecision}
                disabled={busy}
                className={`flex-1 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${
                  confirmAction.status === 'CONFIRMED'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-slate-700 hover:bg-slate-800'
                }`}
              >
                {busy ? 'Working…' : confirmAction.status === 'CONFIRMED' ? 'Confirm fraud' : 'Clear flag'}
              </button>
              <button
                onClick={() => { setConfirmAction(null); setNotes(''); setActionError(null); }}
                className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
