'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { providersApi } from '@/lib/api/providers';
import { complianceApi, type ProviderCompliance, type ComplianceSummary, type PeriodStatus, type ProviderPenalty } from '@/lib/api/compliance';
import ProviderUploadsModal from '@/components/providers/ProviderUploadsModal';
import { PROVIDER_TYPES, isSection29ProviderType, extractErrorMessage } from '@/lib/utils';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

const PERIOD_META: Record<PeriodStatus, { bg: string; ring: string; label: string; text: string }> = {
  ON_TIME: { bg: 'bg-emerald-500', ring: 'ring-emerald-200', label: 'On time', text: 'text-emerald-700' },
  LATE:    { bg: 'bg-amber-500',   ring: 'ring-amber-200',   label: 'Late',    text: 'text-amber-700' },
  MISSING: { bg: 'bg-rose-500',    ring: 'ring-rose-200',    label: 'Missing', text: 'text-rose-700' },
  PENDING: { bg: 'bg-slate-200',   ring: 'ring-slate-200',   label: 'Not due', text: 'text-slate-500' },
};

/** Naira, formatted exactly as /compliance does — the two screens quote the same figures. */
function ngn(n: number | undefined | null): string {
  return `₦${Math.round(Number(n ?? 0)).toLocaleString('en-NG')}`;
}

/**
 * Sort orders offered on the list.
 *
 * A–Z is the DEFAULT because this is the register — the question it usually
 * answers is "where is this bank in the list", and 48 providers is far past the
 * point where scanning an unordered list is reasonable. The old default
 * (worst-compliance-first) is kept as an option rather than dropped: it is the
 * right order when working the list as a queue rather than looking one up.
 *
 * Every comparator returns only its primary ordering; name is applied as the
 * tiebreaker in one place, so no ordering ever falls back to API order.
 */
const SORTS: Record<string, { label: string; cmp: (a: ProviderCompliance, b: ProviderCompliance) => number }> = {
  'name-asc':    { label: 'Name (A–Z)',            cmp: () => 0 },
  'name-desc':   { label: 'Name (Z–A)',            cmp: (a, b) => b.provider.name.localeCompare(a.provider.name, 'en', { sensitivity: 'base' }) },
  'risk':        { label: 'Needs attention first', cmp: (a, b) => (b.missing - a.missing) || (a.complianceRate - b.complianceRate) },
  'compliance':  { label: 'Compliance (high→low)', cmp: (a, b) => b.complianceRate - a.complianceRate },
  'penalty':     { label: 'Penalty exposure',      cmp: (a, b) => (b.penaltyTotal ?? 0) - (a.penaltyTotal ?? 0) },
  'uploads':     { label: 'Uploads (most first)',  cmp: (a, b) => b.submissions - a.submissions },
  'type':        { label: 'Provider type',         cmp: (a, b) => a.provider.providerType.localeCompare(b.provider.providerType) },
};
const DEFAULT_SORT = 'name-asc';
const SORT_KEY_STORAGE = 'bizdata_providers_sort';

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
  // Sort preference persists per user — someone who works this list as a queue
  // should not have to re-pick their order on every visit. Read after mount so
  // server and first client render agree (localStorage is unavailable on the
  // server, and reading it in useState would hydrate-mismatch).
  const [sortKey, setSortKey] = useState<string>(DEFAULT_SORT);
  useEffect(() => {
    const saved = localStorage.getItem(SORT_KEY_STORAGE);
    if (saved && SORTS[saved]) setSortKey(saved);
  }, []);
  const chooseSort = (key: string) => {
    setSortKey(key);
    localStorage.setItem(SORT_KEY_STORAGE, key);
  };
  const [uploadsFor, setUploadsFor] = useState<{ id: string; name: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // Formally-issued §101 penalties, so the row can separate what has actually
  // been ASSESSED against a provider from what has merely accrued.
  const [penalties, setPenalties] = useState<ProviderPenalty[]>([]);

  // Fetch compliance data. `showLoading` blanks the table (used on first load /
  // year change); on a silent background refresh we keep the current rows visible
  // and just swap them in when the new data arrives (no flicker).
  const load = useCallback((showLoading: boolean) => {
    if (showLoading) { setRows(null); setSummary(null); setLoadErr(null); }
    complianceApi.list(year).then((r) => { setRows(r); setLoadErr(null); }).catch((e) => { if (showLoading) { setRows([]); setLoadErr(extractErrorMessage(e)); } });
    complianceApi.summary(year).then(setSummary).catch(() => { if (showLoading) setSummary(null); });
    complianceApi.penalties({ year }).then(setPenalties).catch(() => setPenalties([]));
  }, [year]);

  // providerId → what has been formally assessed this year (amount + count).
  const issuedByProvider = useMemo(() => {
    const m = new Map<string, { amount: number; count: number }>();
    for (const p of penalties) {
      const cur = m.get(p.providerId) ?? { amount: 0, count: 0 };
      // A waived penalty is no longer a liability — don't present it as one.
      if (p.status === 'WAIVED') continue;
      m.set(p.providerId, { amount: cur.amount + Number(p.amount ?? 0), count: cur.count + 1 });
    }
    return m;
  }, [penalties]);

  // Load on mount + whenever the year changes.
  useEffect(() => { load(true); }, [load]);

  // Auto-refresh when the user returns to this tab/page (e.g. after a provider
  // uploads a submission in another tab, or on navigating back). Without this the
  // list showed stale data until the manual refresh button was clicked.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') load(false); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

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

  const sorted = useMemo(() => {
    const byName = (a: ProviderCompliance, b: ProviderCompliance) =>
      // localeCompare so accented and lower-case names file where a reader
      // expects, rather than after Z as a raw codepoint sort would put them.
      a.provider.name.localeCompare(b.provider.name, 'en', { sensitivity: 'base' });
    const cmp = SORTS[sortKey]?.cmp ?? SORTS[DEFAULT_SORT].cmp;
    // Name is the tiebreaker for every ordering, so equal rows (very common —
    // most providers share a compliance rate of 0%) still come out alphabetical
    // and stable rather than in whatever order the API returned them.
    return [...filtered].sort((a, b) => cmp(a, b) || byName(a, b));
  }, [filtered, sortKey]);

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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Kpi label="Registered providers" value={derived?.totalProviders ?? '—'} hint={`${derived?.withSubmissions ?? 0} have submitted`} tone="sky" />
        <Kpi label="Avg. compliance" value={summary ? `${summary.avgCompliance}%` : '—'}
          hint={`${derived?.fullyCompliant ?? 0} fully compliant`}
          tone={summary && summary.avgCompliance >= 80 ? 'emerald' : summary && summary.avgCompliance >= 50 ? 'amber' : 'rose'} />
        <Kpi label="Missing periods" value={summary?.totalMissing ?? '—'} hint={`${summary?.totalLate ?? 0} late · ${derived?.atRisk ?? 0} providers at risk`} tone="rose" />
        <Kpi label="Total uploads" value={derived?.totalUploads ?? '—'} hint={`${derived?.avgRejection ?? 0}% avg rejection rate`} tone="violet" />
        {/* Deliberately the SAME field, label, hint and number format as the
            "Penalty exposure" card on /compliance — both read
            summary.totalPenalty from /providers/compliance/summary for the same
            year, so the two screens cannot show different figures. Change one
            and change the other. */}
        <Kpi label="Penalty exposure" value={summary ? ngn(summary.totalPenalty) : '—'}
          hint="Accrued NTAA §101, all providers"
          tone={summary && (summary.totalPenalty ?? 0) > 0 ? 'rose' : 'sky'} />
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
          {PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-500">
          Sort
          <select value={sortKey} onChange={(e) => chooseSort(e.target.value)}
            title="Your choice is remembered on this device"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700">
            {Object.entries(SORTS).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
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
                <th className="px-4 py-3 font-medium text-right" title="NTAA 2025 §101 late/failure-to-file penalty. Accrued is an estimate on late or unfiled periods; assessed is what has been formally issued with a notice reference.">
                  §101 Penalty
                </th>
                <th className="px-4 py-3 font-medium text-center">Uploads</th>
                <th className="px-4 py-3 font-medium text-right">Records</th>
              </tr>
            </thead>
            <tbody>
              {rows === null && !loadErr ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">Loading provider compliance…</td></tr>
              ) : loadErr ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-rose-600">Couldn’t load providers: {loadErr} <button onClick={() => load(true)} className="ml-2 text-teal-700 hover:underline font-medium">Retry</button></td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">No providers match.</td></tr>
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
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.provider.providerType.replace(/_/g, ' ')}
                      {!isSection29ProviderType(r.provider.providerType) && (
                        <span
                          title="Outside NTAA §29 scope — retained for history; cannot receive new submissions."
                          className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium align-middle"
                        >
                          out of §29 scope
                        </span>
                      )}
                    </td>
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
                    {/* §101 exposure. Accrued and assessed are deliberately shown
                        as two different things — an accrued figure is an estimate
                        on late/unfiled periods and must never be quoted at a
                        provider as money owed; only an issued penalty carries a
                        notice reference and is a real liability. */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {(() => {
                        const accrued = r.penaltyTotal ?? 0;
                        const issued = issuedByProvider.get(r.provider.id);
                        if (!accrued && !issued) return <span className="text-xs text-slate-300">—</span>;
                        return (
                          <>
                            {accrued > 0 && (
                              <div title="Estimated on late/unfiled periods — not yet formally assessed">
                                <span className="text-xs font-semibold tabular-nums text-amber-700">{ngn(accrued)}</span>
                                <span className="ml-1 text-[10px] text-slate-400">accrued</span>
                              </div>
                            )}
                            {issued && issued.amount > 0 && (
                              <div title={`${issued.count} penalt${issued.count === 1 ? 'y' : 'ies'} formally issued with a notice reference`}>
                                <span className="text-xs font-semibold tabular-nums text-rose-700">{ngn(issued.amount)}</span>
                                <span className="ml-1 text-[10px] text-rose-500">assessed</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
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
