'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { governanceApi, type GovernanceReport, type BankMou } from '@/lib/api/governance';
import { formatNaira } from '@/lib/api/cases';

const YEARS = [2026, 2025, 2024];

export default function GovernancePage() {
  const [year, setYear] = useState(2025);
  const [report, setReport] = useState<GovernanceReport | null>(null);
  const [mous, setMous] = useState<BankMou[] | null>(null);

  useEffect(() => {
    setReport(null);
    governanceApi.report(year).then(setReport).catch(() => setReport(null));
    governanceApi.listMou().then(setMous).catch(() => setMous([]));
  }, [year]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="Governance & oversight" subtitle="Steering-committee report pack and bank MoU / onboarding status." />
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg text-sm px-3 py-1.5">
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mt-6 mb-3">Performance report — {year}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Revenue at risk" value={report ? formatNaira(report.revenueAtRisk) : '—'} tone="red" />
        <StatCard label="Recovered" value={report ? formatNaira(report.recovered) : '—'} tone="emerald" />
        <StatCard label="Total cases" value={report?.totalCases?.toLocaleString() ?? '—'} hint={`${report?.agentSignalCount ?? 0} agent signals`} />
        <StatCard label="Providers reporting" value={report ? `${report.providers.withSubmissions}/${report.providers.active}` : '—'} tone="teal" />
      </div>

      {report && Object.keys(report.casesByStatus).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Cases by status</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(report.casesByStatus).map(([s, n]) => (
              <span key={s} className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                {s.replace('_', ' ')} · <span className="font-semibold text-slate-800">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Bank MoU / onboarding</h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {mous === null ? <p className="text-xs text-slate-400 p-6">Loading…</p> : mous.length === 0 ? (
          <p className="text-xs text-slate-400 p-6">No MoUs recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="py-2.5 px-4 font-medium">Provider</th><th className="py-2.5 px-4 font-medium">Status</th><th className="py-2.5 px-4 font-medium">Channel</th><th className="py-2.5 px-4 font-medium">Contact</th>
            </tr></thead>
            <tbody>
              {mous.map((m) => (
                <tr key={m.id} className="border-b border-slate-50">
                  <td className="py-2.5 px-4 font-medium text-slate-800">{m.provider?.name ?? m.providerId}</td>
                  <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">{m.status}</span></td>
                  <td className="py-2.5 px-4 text-slate-600">{m.channel ?? '—'}</td>
                  <td className="py-2.5 px-4 text-slate-500 text-xs">{m.contactEmail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
