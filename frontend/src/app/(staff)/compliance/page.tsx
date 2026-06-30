'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import {
  complianceApi,
  type ComplianceSummary,
  type ProviderCompliance,
  type PeriodStatus,
} from '@/lib/api/compliance';

const YEARS = [2026, 2025, 2024];

const STATUS_DOT: Record<PeriodStatus, string> = {
  ON_TIME: 'bg-emerald-500',
  LATE: 'bg-amber-500',
  MISSING: 'bg-red-500',
  PENDING: 'bg-slate-300',
};

export default function CompliancePage() {
  const [year, setYear] = useState(2025);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [rows, setRows] = useState<ProviderCompliance[] | null>(null);

  useEffect(() => {
    setSummary(null);
    setRows(null);
    complianceApi.summary(year).then(setSummary).catch(() => setSummary(null));
    complianceApi.list(year).then(setRows).catch(() => setRows([]));
  }, [year]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader
          title="Provider compliance"
          subtitle="NTAA §29 reporting obligations: who must file each period, who's late, who's missing, and data quality."
        />
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        <StatCard label="Avg compliance" value={summary ? `${summary.avgCompliance}%` : '—'} tone={summary && summary.avgCompliance >= 80 ? 'emerald' : 'amber'} hint={`${summary?.providers ?? 0} active providers`} />
        <StatCard label="Missing filings" value={summary?.totalMissing?.toLocaleString() ?? '—'} tone={summary && summary.totalMissing > 0 ? 'red' : 'default'} hint="Past-due periods with no submission" />
        <StatCard label="Late filings" value={summary?.totalLate?.toLocaleString() ?? '—'} tone={summary && summary.totalLate > 0 ? 'amber' : 'default'} hint="Filed after the 15-day deadline" />
        <StatCard label="Providers at risk" value={summary?.atRisk?.length?.toLocaleString() ?? '—'} tone={summary && summary.atRisk.length > 0 ? 'red' : 'default'} hint="With ≥1 missing period" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {rows === null ? (
          <p className="text-xs text-slate-400 p-6">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-400 p-6">No active providers.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="py-2.5 px-4 font-medium">Provider</th>
                  <th className="py-2.5 px-4 font-medium">Frequency</th>
                  <th className="py-2.5 px-4 font-medium text-center">Compliance</th>
                  <th className="py-2.5 px-4 font-medium text-center">On-time</th>
                  <th className="py-2.5 px-4 font-medium text-center">Late</th>
                  <th className="py-2.5 px-4 font-medium text-center">Missing</th>
                  <th className="py-2.5 px-4 font-medium text-center">Rejection</th>
                  <th className="py-2.5 px-4 font-medium">Periods</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.provider.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-medium text-slate-800">{r.provider.name}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-500">{r.provider.reportingFrequency}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`font-semibold ${r.complianceRate >= 80 ? 'text-emerald-700' : r.complianceRate >= 50 ? 'text-amber-700' : 'text-red-700'}`}>
                        {r.complianceRate}%
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center text-slate-600">{r.onTime}</td>
                    <td className="py-2.5 px-4 text-center text-amber-700">{r.late || ''}</td>
                    <td className="py-2.5 px-4 text-center text-red-700 font-medium">{r.missing || ''}</td>
                    <td className="py-2.5 px-4 text-center text-slate-600">{r.rejectionRate}%</td>
                    <td className="py-2.5 px-4">
                      <div className="flex gap-1" title={r.periods.map((p) => `${p.period}: ${p.status}`).join('  ')}>
                        {r.periods.map((p) => (
                          <span key={p.period} className={`inline-block w-2.5 h-2.5 rounded-sm ${STATUS_DOT[p.status]}`} />
                        ))}
                      </div>
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
    </div>
  );
}
