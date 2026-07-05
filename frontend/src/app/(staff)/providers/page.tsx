'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { providersApi } from '@/lib/api/providers';
import { complianceApi, type ProviderCompliance, type ComplianceSummary, type PeriodStatus } from '@/lib/api/compliance';
import ProviderUploadsModal from '@/components/providers/ProviderUploadsModal';
import { PROVIDER_TYPES } from '@/lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

const PERIOD_META: Record<PeriodStatus, { bg: string; ring: string; label: string; text: string }> = {
  ON_TIME: { bg: 'bg-emerald-500', ring: 'ring-emerald-200', label: 'On time', text: 'text-emerald-700' },
  LATE:    { bg: 'bg-amber-500',   ring: 'ring-amber-200',   label: 'Late',    text: 'text-amber-700' },
  MISSING: { bg: 'bg-rose-500',    ring: 'ring-rose-200',    label: 'Missing', text: 'text-rose-700' },
  PENDING: { bg: 'bg-slate-200',   ring: 'ring-slate-200',   label: 'Not due', text: 'text-slate-500' },
};

function complianceColor(rate: number) {
  if (rate >= 80) return 'text-emerald-700';
  if (rate >= 50) return 'text-amber-600';
  return 'text-rose-700';
}
function complianceBar(rate: number) {
  if (rate >= 80) return 'bg-emerald-500';
  if (rate >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

export default function ProvidersDashboardPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [rows, setRows] = useState<ProviderCompliance[] | null>(null);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [uploadsFor, setUploadsFor] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setRows(null); setSummary(null);
    complianceApi.list(year).then(setRows).catch(() => setRows([]));
    complianceApi.summary(year).then(setSummary).catch(() => setSummary(null));
  }, [year]);

  // Derived analytics
  const derived = useMemo(() => {
    if (!rows) return null;
    const totalProviders = rows.length;
    const withSubmissions = rows.filter((r) => r.submissions > 0).length;
    const totalUploads = rows.reduce((s, r) => s + r.submissions, 0);
    const fullyCompliant = rows.filter((r) => r.complianceRate >= 80).length;
    const atRisk = rows.filter((r) => r.missing > 0).length;
    const avgRejection = withSubmissions
      ? Math.round(rows.filter((r) => r.submissions > 0).reduce((s, r) => s + r.rejectionRate, 0) / withSubmissions)
      : 0;
    return { totalProviders, withSubmissions, totalUploads, fullyCompliant, atRisk, avgRejection };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (typeFilter && r.provider.providerType !== typeFilter) return false;
      if (search && !r.provider.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, typeFilter]);

  // Sort: worst compliance / most missing first — decision-oriented.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (b.missing - a.missing) || (a.complianceRate - b.complianceRate)),
    [filtered],
  );

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Banner ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-sky-900 px-7 py-6 mb-8 shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-sky-500/10" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-sky-300 mb-1">§29 Data Providers</p>
            <h1 className="text-2xl font-bold text-white">Provider compliance & activity</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Who is registered, who has submitted, and how they track against their statutory quarterly obligations.
            </p>
          </div>
          <div className="flex items-center gap-3 self-center">
            <Link href="/providers/new" className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-lg backdrop-blur">
              + New provider
            </Link>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Year</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                className="border border-slate-600 rounded-lg text-sm px-3 py-1.5 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-sky-500">
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Registered providers" value={derived?.totalProviders ?? '—'} hint={`${derived?.withSubmissions ?? 0} have submitted`} tone="sky" />
        <Kpi label="Avg. compliance" value={summary ? `${summary.avgCompliance}%` : '—'}
          hint={`${derived?.fullyCompliant ?? 0} fully compliant`}
          tone={summary && summary.avgCompliance >= 80 ? 'emerald' : summary && summary.avgCompliance >= 50 ? 'amber' : 'rose'} />
        <Kpi label="Missing periods" value={summary?.totalMissing ?? '—'} hint={`${summary?.totalLate ?? 0} late · ${derived?.atRisk ?? 0} providers at risk`} tone="rose" />
        <Kpi label="Total uploads" value={derived?.totalUploads ?? '—'} hint={`${derived?.avgRejection ?? 0}% avg rejection rate`} tone="violet" />
      </div>

      {/* ── At-risk callout ─────────────────────────────────────── */}
      {summary && summary.atRisk.length > 0 && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 mb-2">
            ⚠ {summary.atRisk.length} provider{summary.atRisk.length === 1 ? '' : 's'} with missing submissions
          </p>
          <div className="flex flex-wrap gap-2">
            {summary.atRisk.slice(0, 12).map((p) => (
              <span key={p.id} className="text-xs bg-white border border-rose-200 rounded-lg px-2.5 py-1 text-slate-700">
                {p.name} <span className="text-rose-600 font-semibold">· {p.missing} missing</span>
              </span>
            ))}
            {summary.atRisk.length > 12 && <span className="text-xs text-rose-600 self-center">+{summary.atRisk.length - 12} more</span>}
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search provider…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="">All types</option>
          {PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        {/* legend */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500 ml-auto">
          {(['ON_TIME', 'LATE', 'MISSING', 'PENDING'] as PeriodStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${PERIOD_META[s].bg}`} />{PERIOD_META[s].label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Compliance heatmap / table ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Type</th>
                {quarters.map((q) => <th key={q} className="px-2 py-3 font-medium text-center">{q}</th>)}
                <th className="px-4 py-3 font-medium">Compliance</th>
                <th className="px-4 py-3 font-medium text-center">Uploads</th>
                <th className="px-4 py-3 font-medium text-right">Records</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">Loading provider compliance…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">No providers match.</td></tr>
              ) : sorted.map((r) => {
                const byQuarter: Record<string, PeriodStatus> = {};
                r.periods.forEach((p) => {
                  const m = p.period.match(/Q(\d)/); if (m) byQuarter[`Q${m[1]}`] = p.status;
                });
                return (
                  <tr key={r.provider.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/providers/${r.provider.id}`} className="font-medium text-slate-800 hover:text-sky-700">
                        {r.provider.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.provider.providerType.replace('_', ' ')}</td>
                    {quarters.map((q) => {
                      const st = byQuarter[q] ?? 'PENDING';
                      return (
                        <td key={q} className="px-2 py-3 text-center">
                          <span title={PERIOD_META[st].label}
                            className={`inline-block h-5 w-5 rounded ${PERIOD_META[st].bg} ring-1 ${PERIOD_META[st].ring}`} />
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full ${complianceBar(r.complianceRate)}`} style={{ width: `${r.complianceRate}%` }} />
                        </div>
                        <span className={`text-xs font-semibold ${complianceColor(r.complianceRate)}`}>{r.complianceRate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setUploadsFor({ id: r.provider.id, name: r.provider.name })}
                        disabled={r.submissions === 0}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                          r.submissions > 0 ? 'bg-sky-50 text-sky-700 hover:bg-sky-100 ring-1 ring-sky-200' : 'text-slate-300'
                        }`}
                        title={r.submissions > 0 ? 'View uploads (requires authorisation)' : 'No uploads'}
                      >
                        {r.submissions > 0 ? `${r.submissions} 🔒` : '—'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {r.rejectionRate > 0 && <span className="text-rose-600">{r.rejectionRate}% rej · </span>}
                      {r.onTime + r.late > 0 ? 'filed' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Rows are ranked by risk — providers with the most missing submissions first. Click a provider name for full detail,
        or the 🔒 uploads count to view submitted records (requires step-up authorisation).
      </p>

      {uploadsFor && (
        <ProviderUploadsModal providerId={uploadsFor.id} providerName={uploadsFor.name} onClose={() => setUploadsFor(null)} />
      )}
    </div>
  );
}

/* ── KPI CARD ──────────────────────────────────────────────── */
function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone: 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' }) {
  const tones: Record<string, string> = {
    sky: 'border-l-sky-500', emerald: 'border-l-emerald-500', amber: 'border-l-amber-400',
    rose: 'border-l-rose-500', violet: 'border-l-violet-500',
  };
  const valColor: Record<string, string> = {
    sky: 'text-sky-700', emerald: 'text-emerald-700', amber: 'text-amber-600',
    rose: 'text-rose-700', violet: 'text-violet-700',
  };
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 border-l-4 ${tones[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${valColor[tone]}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
}
