'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import {
  complianceApi,
  type ComplianceSummary,
  type ProviderCompliance,
  type ProviderPenalty,
  type PeriodStatus,
} from '@/lib/api/compliance';
import { extractErrorMessage } from '@/lib/utils';
import { readErrorMessage } from '@/lib/api/client';

const YEARS = [2026, 2025, 2024];

const STATUS_DOT: Record<PeriodStatus, string> = {
  ON_TIME: 'bg-emerald-500',
  LATE: 'bg-amber-500',
  MISSING: 'bg-red-500',
  PENDING: 'bg-slate-300',
};

const PENALTY_STATUS_TONE: Record<string, string> = {
  ASSESSED: 'bg-amber-50 text-amber-700 ring-amber-200',
  NOTIFIED: 'bg-blue-50 text-blue-700 ring-blue-200',
  WAIVED: 'bg-slate-100 text-slate-500 ring-slate-200',
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

function ngn(n: number | undefined | null): string {
  return `₦${Math.round(Number(n ?? 0)).toLocaleString('en-NG')}`;
}

export default function CompliancePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [rows, setRows] = useState<ProviderCompliance[] | null>(null);
  const [penalties, setPenalties] = useState<ProviderPenalty[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // provider id / 'ALL' while issuing
  const [msg, setMsg] = useState<string | null>(null);

  // Secured in-app demand-notice viewer (auth'd HTML → sandboxed iframe).
  const [notice, setNotice] = useState<{ title: string; html: string } | null>(null);
  const [noticeLoading, setNoticeLoading] = useState<string | null>(null);

  const load = () => {
    setSummary(null); setRows(null); setErr(null);
    complianceApi.summary(year).then(setSummary).catch(() => setSummary(null));
    complianceApi.list(year)
      .then((r) => setRows(r))
      .catch((e) => { setRows([]); setErr(extractErrorMessage(e)); });
    complianceApi.penalties({ year }).then(setPenalties).catch(() => setPenalties([]));
  };
  useEffect(load, [year]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 4000); };

  // Issue penalties for every LATE/MISSING period of one provider this year.
  const issueForProvider = async (r: ProviderCompliance) => {
    const due = r.periods.filter((p) => (p.status === 'LATE' || p.status === 'MISSING') && p.penaltyEnforced !== false);
    if (due.length === 0) return;
    setBusy(r.provider.id); setErr(null); setMsg(null);
    try {
      let n = 0;
      for (const p of due) {
        try { await complianceApi.issuePenalty(r.provider.id, p.period); n++; } catch { /* skip */ }
      }
      flash(`Issued ${n} penalt${n === 1 ? 'y' : 'ies'} for ${r.provider.name}.`);
      complianceApi.penalties({ year }).then(setPenalties).catch(() => {});
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(null); }
  };

  const issueAll = async () => {
    setBusy('ALL'); setErr(null); setMsg(null);
    try {
      const res = await complianceApi.issueAllPenalties(year);
      flash(`Issued ${res.issued} penalt${res.issued === 1 ? 'y' : 'ies'} across all providers.`);
      complianceApi.penalties({ year }).then(setPenalties).catch(() => {});
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(null); }
  };

  const openNotice = async (p: ProviderPenalty) => {
    setNoticeLoading(p.id);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('bizdata_staff_token') : null;
      const res = await fetch(`${base}${complianceApi.noticePath(p.id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      setNotice({ title: `Demand notice · ${p.noticeRef ?? p.periodLabel}`, html: await res.text() });
      // Serving the notice flips ASSESSED→NOTIFIED server-side; refresh the list.
      complianceApi.penalties({ year }).then(setPenalties).catch(() => {});
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setNoticeLoading(null); }
  };

  const hasDefault = (r: ProviderCompliance) =>
    r.periods.some((p) => (p.status === 'LATE' || p.status === 'MISSING') && p.penaltyEnforced !== false);
  const issuedTotal = (penalties ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader
          title="Provider compliance"
          subtitle="NTAA §29 reporting obligations: who must file each period, who's late, who's missing, and §101 penalties."
        />
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {msg && <div className="mt-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{msg}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 my-6">
        <StatCard label="Avg compliance" value={summary ? `${summary.avgCompliance}%` : '—'} tone={summary && summary.avgCompliance >= 80 ? 'emerald' : 'amber'} hint={`${summary?.providers ?? 0} active providers`} />
        <StatCard label="Missing filings" value={summary?.totalMissing?.toLocaleString() ?? '—'} tone={summary && summary.totalMissing > 0 ? 'red' : 'default'} hint="Past-due periods with no submission" />
        <StatCard label="Late filings" value={summary?.totalLate?.toLocaleString() ?? '—'} tone={summary && summary.totalLate > 0 ? 'amber' : 'default'} hint="Filed after the 15-day deadline" />
        <StatCard label="Providers at risk" value={summary?.atRisk?.length?.toLocaleString() ?? '—'} tone={summary && summary.atRisk.length > 0 ? 'red' : 'default'} hint="With ≥1 missing period" />
        <StatCard label="Penalty exposure" value={summary ? ngn(summary.totalPenalty) : '—'} tone={summary && (summary.totalPenalty ?? 0) > 0 ? 'red' : 'default'} hint="Accrued NTAA §101, all providers" />
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-800">Reporting obligations</h2>
        <Button
          variant="danger"
          size="sm"
          disabled={busy !== null || !rows || rows.every((r) => !hasDefault(r))}
          onClick={issueAll}
        >
          {busy === 'ALL' ? 'Issuing…' : 'Issue all penalties'}
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {rows === null && !err ? (
          <p className="text-xs text-slate-400 p-6">Loading…</p>
        ) : err ? (
          <div className="p-6 text-center">
            <p className="text-sm text-rose-600">Couldn’t load compliance data: {err}</p>
            <button onClick={load} className="text-xs text-teal-700 hover:underline font-medium mt-1">Retry</button>
          </div>
        ) : rows!.length === 0 ? (
          <p className="text-xs text-slate-400 p-6">No active providers.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="py-2.5 px-4 font-medium">Provider</th>
                  <th className="py-2.5 px-4 font-medium">Frequency</th>
                  <th className="py-2.5 px-4 font-medium text-center">Compliance</th>
                  <th className="py-2.5 px-4 font-medium text-center">Late</th>
                  <th className="py-2.5 px-4 font-medium text-center">Missing</th>
                  <th className="py-2.5 px-4 font-medium text-right">Penalty exposure</th>
                  <th className="py-2.5 px-4 font-medium">Periods</th>
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows!.map((r) => (
                  <tr key={r.provider.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-medium text-slate-800">{r.provider.name}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-500">{r.provider.reportingFrequency}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`font-semibold ${r.complianceRate >= 80 ? 'text-emerald-700' : r.complianceRate >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                        {r.complianceRate}%
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center text-amber-700">{r.late || ''}</td>
                    <td className="py-2.5 px-4 text-center text-red-700 font-medium">{r.missing || ''}</td>
                    <td className={`py-2.5 px-4 text-right font-medium ${(r.penaltyTotal ?? 0) > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                      {(r.penaltyTotal ?? 0) > 0 ? ngn(r.penaltyTotal) : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex gap-1" title={r.periods.map((p) => `${p.period}: ${p.status}`).join('  ')}>
                        {r.periods.map((p) => (
                          <span key={p.period} className={`inline-block w-2.5 h-2.5 rounded-sm ${STATUS_DOT[p.status]}`} />
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {hasDefault(r) ? (
                        <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => issueForProvider(r)}>
                          {busy === r.provider.id ? 'Issuing…' : 'Issue penalty'}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex gap-4 mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> On-time</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Late</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Missing</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> Pending</span>
      </div>

      {/* ── Issued penalties (NTAA §101) ── */}
      <div className="mt-8">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-800">Issued penalties</h2>
          {penalties && penalties.length > 0 && (
            <span className="text-xs text-slate-500">{penalties.length} issued · {ngn(issuedTotal)} total</span>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {penalties === null ? (
            <p className="text-xs text-slate-400 p-6">Loading…</p>
          ) : penalties.length === 0 ? (
            <p className="text-xs text-slate-400 p-6">No penalties issued for {year}. Use “Issue penalty” above to raise one for a late or missing return.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-4 font-medium">Notice</th>
                    <th className="py-2.5 px-4 font-medium">Provider</th>
                    <th className="py-2.5 px-4 font-medium">Period</th>
                    <th className="py-2.5 px-4 font-medium">Reason</th>
                    <th className="py-2.5 px-4 font-medium text-center">Months</th>
                    <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                    <th className="py-2.5 px-4 font-medium text-center">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {penalties.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{p.noticeRef ?? '—'}</td>
                      <td className="py-2.5 px-4 text-slate-800">{p.provider?.name ?? '—'}</td>
                      <td className="py-2.5 px-4 font-mono text-xs">{p.periodLabel}</td>
                      <td className="py-2.5 px-4 text-xs">{p.reason === 'MISSING' ? 'Not filed' : 'Filed late'}</td>
                      <td className="py-2.5 px-4 text-center text-xs">{p.monthsInDefault}</td>
                      <td className="py-2.5 px-4 text-right font-medium">{ngn(Number(p.amount))}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${PENALTY_STATUS_TONE[p.status] ?? 'bg-slate-100 text-slate-500 ring-slate-200'}`}>{p.status}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <Button variant="ghost" size="sm" disabled={noticeLoading !== null} onClick={() => openNotice(p)}>
                          {noticeLoading === p.id ? 'Loading…' : 'View notice'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Secured in-app demand-notice viewer — the notice stays inside the
          authenticated session, rendered in a sandboxed same-origin iframe. */}
      <Modal
        open={!!notice}
        onClose={() => setNotice(null)}
        title={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-[var(--bad)]" />
            {notice?.title}
            <span className="rounded bg-[var(--bad-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bad)]">
              Official · in secure session
            </span>
          </span>
        }
        size="xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const f = document.getElementById('penalty-notice-frame') as HTMLIFrameElement | null;
                f?.contentWindow?.focus();
                f?.contentWindow?.print();
              }}
            >
              🖨 Print / Save as PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setNotice(null)}>Close</Button>
          </div>
        }
      >
        {notice && (
          <iframe
            id="penalty-notice-frame"
            title={notice.title}
            srcDoc={notice.html}
            sandbox="allow-same-origin allow-modals"
            className="h-[68vh] w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
          />
        )}
      </Modal>
    </div>
  );
}
