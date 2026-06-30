'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { metricsApi, type ModelMetrics } from '@/lib/api/metrics';

const YEARS = [2026, 2025, 2024];

export default function MetricsPage() {
  const [year, setYear] = useState(2025);
  const [m, setM] = useState<ModelMetrics | null>(null);

  useEffect(() => { setM(null); metricsApi.model(year).then(setM).catch(() => setM(null)); }, [year]);

  const maxType = Math.max(1, ...(m?.byType.map((x) => x.count) ?? [1]));
  const maxState = Math.max(1, ...(m?.byState.map((x) => x.count) ?? [1]));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="Model governance & fairness" subtitle="Detection precision proxy and the distribution of flags, to monitor disparate impact." />
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg text-sm px-3 py-1.5">
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        <StatCard label="Precision (proxy)" value={m && m.precision != null ? `${Math.round(m.precision * 100)}%` : '—'} hint={`${m?.resolved ?? 0} resolved cases`} tone="teal" />
        <StatCard label="Total cases" value={m?.counts.total?.toLocaleString() ?? '—'} />
        <StatCard label="Confirmed/Recovered" value={m ? (m.counts.confirmed + m.counts.settled + m.counts.recovered).toLocaleString() : '—'} tone="emerald" />
        <StatCard label="Dismissed" value={m?.counts.dismissed?.toLocaleString() ?? '—'} tone={m && m.counts.dismissed > 0 ? 'amber' : 'default'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Dist title="Flags by taxpayer type" rows={m?.byType.map((x) => ({ label: x.type, count: x.count })) ?? null} max={maxType} />
        <Dist title="Flags by state (fairness)" rows={m?.byState.map((x) => ({ label: x.state, count: x.count })) ?? null} max={maxState} />
      </div>

      {m?.limitations && (
        <p className="text-xs text-slate-400 mt-6 border-t border-slate-100 pt-3">{m.limitations}</p>
      )}
    </div>
  );
}

function Dist({ title, rows, max }: { title: string; rows: { label: string; count: number }[] | null; max: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">{title}</h3>
      {rows === null ? <p className="text-xs text-slate-400">Loading…</p> : rows.length === 0 ? <p className="text-xs text-slate-400">No data.</p> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{r.label}</span><span className="text-slate-500">{r.count}</span></div>
              <div className="bg-slate-100 rounded-full h-2 overflow-hidden"><div className="h-full bg-teal-500" style={{ width: `${(r.count / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
