'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { agentsApi, AGENT_NAMES, type SignalsPage, type SignalSummary, type AgentSeverity } from '@/lib/api/agents';
import { extractErrorMessage } from '@/lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

const SEV_META: Record<AgentSeverity, { chip: string; dot: string }> = {
  HIGH:   { chip: 'bg-rose-50 text-rose-700 ring-rose-200',   dot: 'bg-rose-500' },
  MEDIUM: { chip: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  LOW:    { chip: 'bg-slate-50 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
};

const AGENT_COLORS: Record<string, string> = {
  pattern: 'border-l-teal-500', matching: 'border-l-sky-500', sector: 'border-l-amber-400',
  behavioural: 'border-l-violet-500', predictive: 'border-l-indigo-500', document: 'border-l-emerald-500',
};

export default function AgentSignalsPage() {
  const params = useSearchParams();
  // Honor deep-links from the dashboard tiles, e.g. /agent-signals?year=2026&agentKey=pattern
  const initialYear = Number(params.get('year')) || CURRENT_YEAR;
  const initialAgent = params.get('agentKey') ?? '';
  const initialSeverity = params.get('severity') ?? '';

  const [year, setYear] = useState(initialYear);
  const [summary, setSummary] = useState<SignalSummary | null>(null);
  const [data, setData] = useState<SignalsPage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [agentKey, setAgentKey] = useState(initialAgent);
  const [severity, setSeverity] = useState(initialSeverity);
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => { agentsApi.signalSummary(year).then(setSummary).catch(() => setSummary(null)); }, [year]);
  useEffect(() => {
    setData(null); setErr(null);
    agentsApi.signalsPage({ year, agentKey: agentKey || undefined, severity: severity || undefined, page, limit })
      .then(setData).catch((e) => { setData(null); setErr(extractErrorMessage(e)); });
  }, [year, agentKey, severity, page]);

  const sevCount = (s: string) => summary?.bySeverity.find((x) => x.severity === s)?.count ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-7 py-6 mb-8 shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-indigo-500/10" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-indigo-300 mb-1">AI Analytics · Reports</p>
            <h1 className="text-2xl font-bold text-white">Agent signals</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Every finding raised by the six analytics agents across all taxpayers — filterable by agent and severity,
              each explained and linked to its taxpayer.
            </p>
          </div>
          <div className="flex items-center gap-2 self-center">
            <label className="text-xs text-slate-400">Year</label>
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
              className="border border-slate-600 rounded-lg text-sm px-3 py-1.5 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Per-agent summary — clickable filters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {Object.keys(AGENT_NAMES).map((key) => {
          const count = summary?.byAgent.find((a) => a.agentKey === key)?.count ?? 0;
          const active = agentKey === key;
          return (
            <button key={key} onClick={() => { setAgentKey(active ? '' : key); setPage(1); }}
              className={`text-left bg-white rounded-xl border border-slate-100 shadow-sm p-3 border-l-4 ${AGENT_COLORS[key] ?? 'border-l-slate-300'} ${active ? 'ring-2 ring-indigo-500' : 'hover:shadow-md'} transition`}>
              <p className="text-[11px] font-semibold text-slate-700 leading-tight">{AGENT_NAMES[key]}</p>
              <p className="text-xl font-bold text-slate-800 tabular-nums mt-0.5">{count.toLocaleString()}</p>
            </button>
          );
        })}
      </div>

      {/* Severity + clear filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-slate-400 mr-1">Severity:</span>
        {(['', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sv) => (
          <button key={sv || 'all'} onClick={() => { setSeverity(sv); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${severity === sv ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {sv || 'All'}{sv && ` (${sevCount(sv).toLocaleString()})`}
          </button>
        ))}
        {(agentKey || severity) && (
          <button onClick={() => { setAgentKey(''); setSeverity(''); setPage(1); }}
            className="ml-2 text-xs text-indigo-600 hover:underline">Clear filters</button>
        )}
        <span className="ml-auto text-xs text-slate-400">{summary ? `${summary.total.toLocaleString()} signals total` : ''}</span>
      </div>

      {/* Signals table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 font-medium">Taxpayer</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium text-center">Severity</th>
                <th className="px-4 py-3 font-medium text-right">Score</th>
                <th className="px-4 py-3 font-medium">Finding</th>
              </tr>
            </thead>
            <tbody>
              {data === null && !err ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : err ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-rose-600">Couldn’t load signals: {err}</td></tr>
              ) : data!.signals.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No signals match. Run the agents from the Dashboard if none exist yet.</td></tr>
              ) : data!.signals.map((sig) => (
                <tr key={sig.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/taxpayers/${sig.taxpayerId}`} className="font-medium text-slate-800 hover:text-indigo-700">{sig.taxpayerName}</Link>
                    <p className="text-[10px] text-slate-400">{sig.taxpayerType}{sig.sector ? ` · ${sig.sector.replace(/_/g, ' ')}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{AGENT_NAMES[sig.agentKey] ?? sig.agentKey}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${(SEV_META[sig.severity] ?? SEV_META.LOW).chip}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${(SEV_META[sig.severity] ?? SEV_META.LOW).dot}`} />{sig.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-700">{Math.round(Number(sig.score) * 100)}%</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-md">{sig.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total.toLocaleString()}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border border-slate-200 rounded disabled:opacity-40">Prev</button>
              <button disabled={page * limit >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border border-slate-200 rounded disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Signals are produced when you run the AI analytics agents (Dashboard → Run agents). Click a taxpayer to see their
        full profile, or open their case for the agent findings in context.
      </p>
    </div>
  );
}
