'use client';
import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import SensitiveValue from '@/components/SensitiveValue';
import { taxpayer360Api, type SearchResult, type Taxpayer360 } from '@/lib/api/taxpayer360';
import { formatMoney, formatDate, extractErrorMessage } from '@/lib/utils';

export default function Taxpayer360Page() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [profile, setProfile] = useState<Taxpayer360 | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setProfile(null); setErr(null);
    try { setResults(await taxpayer360Api.search(q.trim())); }
    catch (e2) { setResults([]); setErr(extractErrorMessage(e2)); }
    finally { setBusy(false); }
  };
  const open = async (id: string) => {
    setBusy(true); setErr(null);
    // Previously had no catch — a failed profile open did nothing at all.
    try { setProfile(await taxpayer360Api.profile(id)); }
    catch (e2) { setErr(extractErrorMessage(e2)); }
    finally { setBusy(false); }
  };

  const tp = profile?.taxpayer;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title="Taxpayer 360" subtitle="Search by name, TIN, NIN, BVN or CAC number — one view of declared income, observed flows, cases, and risk." />

      <form onSubmit={search} className="flex gap-2 my-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search taxpayers…"
          className="flex-1 border border-slate-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
        <button disabled={busy} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">Search</button>
      </form>

      {err && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>
      )}
      {busy && (
        <p className="text-xs text-slate-400 mb-3 animate-pulse">Loading…</p>
      )}

      {results && !profile && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {results.length === 0 ? <p className="text-xs text-slate-400 p-4">No matches.</p> : results.map((r) => (
            <button key={r.id} onClick={() => open(r.id)} className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between">
              <span><span className="font-medium text-slate-800">{r.name}</span> <span className="text-xs text-slate-400 ml-2">{r.type} · TIN {r.tin ?? '—'}</span></span>
              <span className="text-xs font-medium text-slate-600">{r.riskLevel}</span>
            </button>
          ))}
        </div>
      )}

      {profile && tp && (
        <div className="space-y-6">
          <button onClick={() => setProfile(null)} className="text-xs text-teal-700 hover:underline">← Back to results</button>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{tp.name}</h2>
                <p className="text-xs text-slate-500">{tp.type} · {tp.stateOfResidence ?? '—'} · {tp.sector ?? 'sector —'}</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{tp.riskLevel} ({tp.riskScore})</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
              <Info label="NIN"><SensitiveValue value={tp.nin} /></Info>
              <Info label="BVN"><SensitiveValue value={tp.bvn} /></Info>
              <Info label="TIN">{tp.tin ?? '—'}</Info>
              <Info label="CAC">{tp.cacRcNumber ?? '—'}</Info>
            </div>
          </div>

          <Panel title={`Declared income (${profile.declaredIncomes.length})`}>
            {profile.declaredIncomes.map((d) => (
              <div key={d.year} className="flex justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                <span className="text-slate-600">{d.year} · {d.source ?? '—'}</span><span className="font-medium">{formatMoney(d.assessableIncome)}</span>
              </div>
            ))}
            {profile.declaredIncomes.length === 0 && <p className="text-xs text-slate-400">None on record.</p>}
          </Panel>

          <Panel title="Observed flows by year">
            {profile.dataRecordsByYear.map((y) => (
              <div key={y.year} className="mb-2">
                <p className="text-xs font-semibold text-slate-700">{y.year}</p>
                {y.records.map((r, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5 text-slate-500">
                    <span>{r.provider ?? '—'} · {r.periodLabel} · {r.matchMethod ?? '—'}</span><span>{formatMoney(r.totalInflow)}</span>
                  </div>
                ))}
              </div>
            ))}
            {profile.dataRecordsByYear.length === 0 && <p className="text-xs text-slate-400">No records.</p>}
          </Panel>

          <Panel title={`Cases (${profile.underdeclarationCases.length}) & signals (${profile.riskSignals.length})`}>
            {profile.underdeclarationCases.map((c) => (
              <div key={c.id} className="text-xs py-1 border-b border-slate-50 last:border-0 flex justify-between">
                <span className="text-slate-600">{c.year} · {c.status} · est. tax {formatMoney(c.estimatedTaxDue)}</span>
                <span className="text-slate-400">conf {Math.round((c.confidence ?? 0) * 100)}%{c.agentScore != null ? ` · AI ${Math.round(c.agentScore * 100)}%` : ''}</span>
              </div>
            ))}
            {profile.riskSignals.map((s, i) => (
              <div key={i} className="text-xs text-slate-500 py-0.5">[{s.agentKey} {s.severity}] {s.summary}</div>
            ))}
          </Panel>

          {profile.riskTimeline.length > 0 && (
            <Panel title="Risk timeline">
              {profile.riskTimeline.map((t, i) => (
                <div key={i} className="text-xs text-slate-500 py-0.5">{formatDate(t.date)} — {t.event}</div>
              ))}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-xs uppercase tracking-wide text-slate-400">{label}</p><div className="text-slate-800 mt-0.5">{children}</div></div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6"><h3 className="text-sm font-semibold text-slate-800 mb-3">{title}</h3>{children}</div>;
}
