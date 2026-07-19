'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import Icon from '@/components/Icon';
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
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setLoadErr(null);
    Promise.all([
      dataRecordsApi.list({ flagged: 'true', reviewStatus: 'PENDING_REVIEW', limit: 100 }),
      dataRecordsApi.stats(),
    ])
      .then(([r, s]) => {
        setRows(r.records);
        setStats(s);
      })
      .catch((e) => {
        setRows([]);
        setStats(null);
        setLoadErr(extractErrorMessage(e));
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
          <Link href="/scan" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] hover:border-slate-300 hover:bg-[var(--surface-2)]">
            <Icon name="search" width={16} height={16} /> Run a scan
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
      ) : loadErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 py-16 text-center">
          <p className="text-sm font-medium text-rose-700">Couldn’t load flagged records</p>
          <p className="mt-1 text-xs text-rose-600">{loadErr}</p>
          <button onClick={load} className="mt-2 text-xs font-medium text-teal-700 hover:underline">Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] py-16 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[var(--ok-soft)] text-[var(--ok)]">
            <Icon name="shield" width={22} height={22} />
          </span>
          <p className="text-sm font-medium text-[var(--ink)]">Nothing pending review</p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">All flagged records have been cleared or confirmed.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2.5 font-medium">Taxpayer</th>
                  <th className="px-4 py-2.5 font-medium">Provider</th>
                  <th className="px-4 py-2.5 font-medium">Period</th>
                  <th className="px-4 py-2.5 text-right font-medium">Inflow</th>
                  <th className="px-4 py-2.5 text-right font-medium">Declared</th>
                  <th className="px-4 py-2.5 text-right font-medium">Discrepancy</th>
                  <th className="px-4 py-2.5 text-right font-medium">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-2)]">
                {rows.map((r) => (
                  <tr key={r.id} className="group hover:bg-[var(--surface-2)]">
                    <td className="px-4 py-2.5">
                      {r.taxpayer ? (
                        <>
                          <Link href={`/taxpayers/${r.taxpayer.id}`} className="font-medium text-[var(--ink)] hover:text-teal-700">
                            {tpName(r.taxpayer)}
                          </Link>
                          <p className="tnum font-mono text-[10px] text-[var(--ink-3)]">{tpId(r.taxpayer)}</p>
                        </>
                      ) : <span className="text-[var(--ink-3)]">unlinked</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--ink-2)]">{r.provider?.name ?? '—'}</td>
                    <td className="tnum px-4 py-2.5 font-mono text-xs text-[var(--ink-2)]">{r.periodLabel}</td>
                    <td className="tnum px-4 py-2.5 text-right text-[var(--ink)]">{formatMoney(r.totalInflow)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-[var(--ink-2)]">{formatMoney(r.declaredIncome)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="tnum font-semibold text-[var(--bad)]">{formatMoney(r.discrepancyAmount)}</span>
                      <span className="tnum ml-1 rounded bg-[var(--bad-soft)] px-1 py-0.5 text-[10px] font-medium text-[var(--bad)]">
                        {formatPercent(r.discrepancyPct, 0)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1 opacity-90 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => { setConfirmAction({ id: r.id, status: 'CLEARED', record: r }); setNotes(''); setActionError(null); }}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-slate-100"
                        >
                          Clear
                        </button>
                        <button
                          onClick={() => { setConfirmAction({ id: r.id, status: 'CONFIRMED', record: r }); setNotes(''); setActionError(null); }}
                          className="rounded-md bg-[var(--bad)] px-2.5 py-1 text-xs font-medium text-white hover:brightness-95"
                        >
                          Confirm
                        </button>
                        <Link
                          href={`/data-records/${r.id}`}
                          className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:bg-slate-50"
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
