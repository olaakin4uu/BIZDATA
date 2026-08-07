'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { analyticsApi, type ProviderAnalytics, type SectorAnalytics } from '@/lib/api/analytics';
import { formatMoneyShort, extractErrorMessage } from '@/lib/utils';

type Tab = 'provider' | 'sector';

const ANALYTICS_YEARS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('provider');
  const [year, setYear] = useState<number | ''>(new Date().getFullYear());
  const [prov, setProv] = useState<ProviderAnalytics | null>(null);
  const [sect, setSect] = useState<SectorAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setProv(null); setErr(null);
    analyticsApi.byProvider(year || undefined).then(setProv).catch((e) => setErr(extractErrorMessage(e)));
  }, [year]);
  useEffect(() => {
    setSect(null); setErr(null);
    analyticsApi.bySector(year || undefined).then(setSect).catch((e) => setErr(extractErrorMessage(e)));
  }, [year]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-7 py-6 mb-8 shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-indigo-500/10" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-indigo-300 mb-1">Comparative Analytics</p>
            <h1 className="text-2xl font-bold text-white">Analysis by provider, and by sector</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Which data sources produce the most actionable intelligence, and which economic sectors carry the
              widest underdeclaration gaps. Ranked for decision-making, not just display.
            </p>
          </div>
          <div className="flex items-center gap-2 self-center">
            <label className="text-xs text-slate-400">Tax year</label>
            <select value={year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
              className="border border-slate-600 rounded-lg text-sm px-3 py-1.5 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All years</option>
              {ANALYTICS_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {err && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Couldn’t load analytics: {err}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <TabBtn active={tab === 'provider'} onClick={() => setTab('provider')}>By provider</TabBtn>
        <TabBtn active={tab === 'sector'} onClick={() => setTab('sector')}>By sector</TabBtn>
      </div>

      {tab === 'provider' ? <ProviderView data={prov} /> : <SectorView data={sect} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg ${active ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
      {children}
    </button>
  );
}

/* ── BY PROVIDER ─────────────────────────────────────────── */
function ProviderView({ data }: { data: ProviderAnalytics | null }) {
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.records > 0), [data]);
  const maxInflow = Math.max(1, ...rows.map((r) => r.observedInflow));

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Reporting providers" value={rows.length} hint={`of ${data?.totals.providers ?? 0} active`} tone="indigo" />
        <Kpi label="Records analysed" value={data ? data.totals.records.toLocaleString() : '—'} hint="across all providers" tone="slate" />
        <Kpi label="Observed inflow" value={data ? formatMoneyShort(data.totals.observedInflow) : '—'} hint="total matched" tone="emerald" />
        <Kpi label="Flagged records" value={data ? data.totals.flagged.toLocaleString() : '—'} hint="enforcement yield" tone="rose" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Records</th>
                <th className="px-4 py-3 font-medium text-right">Taxpayers</th>
                <th className="px-4 py-3 font-medium">Observed inflow</th>
                <th className="px-4 py-3 font-medium text-center">Identity</th>
                <th className="px-4 py-3 font-medium text-center">Rejection</th>
                <th className="px-4 py-3 font-medium text-right">Yield /1k</th>
              </tr>
            </thead>
            <tbody>
              {data === null ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No provider data yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.provider.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/providers/${r.provider.id}`} className="font-medium text-slate-800 hover:text-indigo-700">{r.provider.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.provider.providerType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.records.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.taxpayers.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(r.observedInflow / maxInflow) * 100}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-600 whitespace-nowrap">{r.observedInflow > 0 ? formatMoneyShort(r.observedInflow) : '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold ${r.identityCompleteness >= 80 ? 'text-emerald-700' : r.identityCompleteness >= 40 ? 'text-amber-600' : 'text-rose-700'}`}>{r.identityCompleteness}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs ${r.rejectionRate > 10 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{r.rejectionRate}%</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-indigo-700">{r.yieldPer1k}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        <strong>Yield /1k</strong> = flagged records per 1,000 rows — how much actionable intelligence a provider’s data
        produces per unit of volume. <strong>Identity</strong> = share of rows with a resolvable BVN/NIN.
      </p>
    </>
  );
}

/* ── BY SECTOR ───────────────────────────────────────────── */
function SectorView({ data }: { data: SectorAnalytics | null }) {
  const rows = data?.rows ?? [];
  const maxTax = Math.max(1, ...rows.map((r) => r.estimatedTax));

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Kpi label="Sectors identified" value={data?.totals.sectors ?? '—'} hint="economic classifications" tone="indigo" />
        <Kpi label="Classified taxpayers" value={data ? data.totals.classified.toLocaleString() : '—'} hint={`${data?.totals.unclassified ?? 0} unclassified`} tone="emerald" />
        <Kpi label="Top sector by est. tax" value={rows[0]?.sector.replace(/_/g, ' ') ?? '—'} hint={rows[0] ? formatMoneyShort(rows[0].estimatedTax) : ''} tone="rose" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 font-medium">Sector</th>
                <th className="px-4 py-3 font-medium text-right">Taxpayers</th>
                <th className="px-4 py-3 font-medium text-center">Flagged</th>
                <th className="px-4 py-3 font-medium text-center">Tax-net coverage</th>
                <th className="px-4 py-3 font-medium">Estimated recoverable tax</th>
              </tr>
            </thead>
            <tbody>
              {data === null ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No sector data — run the agents to classify.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.sector} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.sector.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.taxpayers.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold ${r.flaggedPct >= 60 ? 'text-rose-700' : r.flaggedPct >= 30 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {r.flaggedTaxpayers.toLocaleString()} <span className="text-slate-400 font-normal">({r.flaggedPct}%)</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.coveragePct >= 80 ? 'bg-emerald-50 text-emerald-700' : r.coveragePct >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                      {r.coveragePct}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-28 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(r.estimatedTax / maxTax) * 100}%` }} />
                      </div>
                      <span className="text-xs tabular-nums font-semibold text-slate-700 whitespace-nowrap">{r.estimatedTax > 0 ? formatMoneyShort(r.estimatedTax) : '—'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Ranked by estimated recoverable tax. <strong>Coverage</strong> = share of the sector legitimately in the tax net.
        Sectors are inferred from account/business names by the classification agent — re-run agents after new data lands.
      </p>
    </>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone: 'indigo' | 'slate' | 'emerald' | 'rose' }) {
  const c: Record<string, string> = { indigo: 'text-indigo-700 border-l-indigo-500', slate: 'text-slate-700 border-l-slate-400', emerald: 'text-emerald-700 border-l-emerald-500', rose: 'text-rose-700 border-l-rose-500' };
  const [text, border] = c[tone].split(' ');
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 border-l-4 ${border}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${text}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
}
