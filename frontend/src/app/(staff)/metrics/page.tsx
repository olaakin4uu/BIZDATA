'use client';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { metricsApi, type ModelMetrics } from '@/lib/api/metrics';
import {
  modelFeedbackApi,
  type FeedbackReport,
  type SectorFeedbackRow,
  type FairnessResult,
  type SectorOverride,
} from '@/lib/api/modelFeedback';

const YEARS = [2026, 2025, 2024];

export default function MetricsPage() {
  const [year, setYear] = useState(2026);
  const [m, setM] = useState<ModelMetrics | null>(null);

  useEffect(() => { setM(null); metricsApi.model(year).then(setM).catch(() => setM(null)); }, [year]);

  const maxType = Math.max(1, ...(m?.byType.map((x) => x.count) ?? [1]));
  const maxState = Math.max(1, ...(m?.byState.map((x) => x.count) ?? [1]));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="Model governance & fairness" subtitle="Detection precision, the distribution of flags, and the analyst feedback loop that tunes the model — under a fairness gate." />
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

      <FeedbackLoop year={year} />
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

// ── Analyst feedback loop ──────────────────────────────────────────────────
function FeedbackLoop({ year }: { year: number }) {
  const [fb, setFb] = useState<FeedbackReport | null>(null);
  const [overrides, setOverrides] = useState<SectorOverride[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([modelFeedbackApi.feedback(year), modelFeedbackApi.overrides()])
      .then(([f, o]) => { setFb(f); setOverrides(o); })
      .catch(() => { setFb(null); setOverrides([]); })
      .finally(() => setLoading(false));
  }, [year]);

  useEffect(() => { reload(); }, [reload]);

  const overrideMap = new Map(overrides.map((o) => [o.sector, o]));

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-base font-semibold text-slate-900">Analyst feedback loop</h2>
        {fb && fb.totalReviewed > 0 && (
          <span className="text-xs text-slate-500">
            Overall precision <strong className="text-slate-700">{fb.overallPrecision != null ? `${Math.round(fb.overallPrecision * 100)}%` : '—'}</strong> from {fb.totalReviewed.toLocaleString()} analyst decisions
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4 max-w-3xl">
        Every Clear / Confirm an officer makes on a flagged record is a labelled example. Aggregated per sector,
        they yield a real precision signal that recommends where to raise or lower the flagging threshold — but a
        change only applies once a four-fifths fairness check confirms it would not disproportionately affect one
        taxpayer type.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <p className="text-xs text-slate-400 p-6">Loading feedback…</p>
        ) : !fb || fb.sectors.length === 0 ? (
          <p className="text-sm text-slate-500 p-6">No analyst decisions recorded for {year} yet. Clear or confirm flagged cases to start training the model.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-3 font-medium">Sector</th>
                  <th className="px-4 py-3 font-medium">Decisions</th>
                  <th className="px-4 py-3 font-medium">Precision</th>
                  <th className="px-4 py-3 font-medium">Active threshold</th>
                  <th className="px-4 py-3 font-medium">Recommendation</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {fb.sectors.map((row) => (
                  <SectorRow key={row.sector} row={row} year={year} override={overrideMap.get(row.sector)} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function precisionTone(p: number | null): string {
  if (p == null) return 'text-slate-400';
  if (p < 0.5) return 'text-rose-600';
  if (p < 0.7) return 'text-amber-600';
  if (p >= 0.9) return 'text-emerald-600';
  return 'text-slate-700';
}

const ACTION_STYLE: Record<string, string> = {
  RAISE: 'bg-amber-50 text-amber-700 border-amber-200',
  LOWER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  HOLD: 'bg-slate-50 text-slate-500 border-slate-200',
};

function SectorRow({ row, year, override, onChanged }: { row: SectorFeedbackRow; year: number; override?: SectorOverride; onChanged: () => void }) {
  const rec = row.recommendation;
  const activeThreshold = override?.threshold ?? row.currentThreshold;
  const canApply = rec.suggestedThreshold != null;

  return (
    <>
      <tr className="border-b border-slate-50">
        <td className="px-4 py-3 font-medium text-slate-800">{row.sector}</td>
        <td className="px-4 py-3 text-slate-600">
          <span className="text-emerald-600">{row.confirmed}</span>
          <span className="text-slate-300"> / </span>
          <span className="text-rose-500">{row.cleared}</span>
          <span className="text-slate-400 text-xs"> ({row.reviewed})</span>
        </td>
        <td className={`px-4 py-3 font-semibold tabular-nums ${precisionTone(row.precision)}`}>
          {row.precision != null ? `${Math.round(row.precision * 100)}%` : '—'}
        </td>
        <td className="px-4 py-3 text-slate-600 tabular-nums">
          {activeThreshold != null ? (
            <span className="inline-flex items-center gap-1">
              {activeThreshold.toFixed(2)}
              {override && <span className="text-[10px] uppercase tracking-wide text-teal-600 bg-teal-50 border border-teal-100 rounded px-1 py-0.5">override</span>}
            </span>
          ) : (
            <span className="text-slate-400">default (0.20)</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-block text-[11px] font-medium border rounded-full px-2 py-0.5 ${ACTION_STYLE[rec.action]}`}>
            {rec.action}{rec.suggestedThreshold != null ? ` → ${rec.suggestedThreshold.toFixed(2)}` : ''}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          {canApply ? (
            <ApplyControl sector={row.sector} suggested={rec.suggestedThreshold!} year={year} onApplied={onChanged} />
          ) : override ? (
            <button onClick={() => modelFeedbackApi.removeOverride(row.sector).then(onChanged)} className="text-xs text-slate-500 hover:text-rose-600">Reset</button>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )}
        </td>
      </tr>
      <tr className="border-b border-slate-100">
        <td colSpan={6} className="px-4 pb-3 pt-0 text-xs text-slate-400">{rec.rationale}</td>
      </tr>
    </>
  );
}

// Two-step apply: preview the fairness check, then confirm (or force if blocked).
function ApplyControl({ sector, suggested, year, onApplied }: { sector: string; suggested: number; year: number; onApplied: () => void }) {
  const [check, setCheck] = useState<FairnessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const preview = async () => {
    setBusy(true); setErr(null);
    try { setCheck(await modelFeedbackApi.fairness(sector, suggested, year)); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const confirm = async (force: boolean) => {
    setBusy(true); setErr(null);
    try {
      await modelFeedbackApi.apply(sector, suggested, year, force);
      setCheck(null);
      onApplied();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!check) {
    return (
      <button onClick={preview} disabled={busy} className="text-xs font-medium text-teal-700 hover:text-teal-800 disabled:opacity-50">
        {busy ? 'Checking…' : `Apply → ${suggested.toFixed(2)}`}
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1 text-left">
      <FairnessBadge check={check} />
      <div className="flex items-center gap-2">
        <button onClick={() => setCheck(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
        {check.passes ? (
          <button onClick={() => confirm(false)} disabled={busy} className="text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded px-2 py-1 disabled:opacity-50">
            {busy ? 'Applying…' : 'Confirm'}
          </button>
        ) : (
          <button onClick={() => confirm(true)} disabled={busy} className="text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded px-2 py-1 disabled:opacity-50">
            {busy ? 'Applying…' : 'Override gate'}
          </button>
        )}
      </div>
      {err && <span className="text-[11px] text-rose-600 max-w-[16rem] text-right">{err}</span>}
    </div>
  );
}

function FairnessBadge({ check }: { check: FairnessResult }) {
  return (
    <div className={`text-[11px] rounded-md border px-2 py-1.5 max-w-[18rem] ${check.passes ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
      <div className="font-semibold">
        {check.passes ? '✓ Fairness gate passed' : '⚠ Fairness gate blocked'} · ratio {check.impactRatio.toFixed(2)}
      </div>
      <div className="mt-0.5 space-y-0.5">
        {check.rates.map((r) => (
          <div key={r.type} className="flex justify-between gap-3">
            <span>{r.type} <span className="opacity-60">(n={r.taxpayers})</span></span>
            <span className="tabular-nums">{Math.round(r.flagRate * 100)}% flagged</span>
          </div>
        ))}
      </div>
    </div>
  );
}
