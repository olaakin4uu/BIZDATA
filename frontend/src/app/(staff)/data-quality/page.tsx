'use client';
import { useEffect, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { dataQualityApi, type IdentifierQuality, type CoverageRow } from '@/lib/api/data-quality';
import { extractErrorMessage } from '@/lib/utils';

const YEARS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

/** Coverage reads as a grade: below half is a hole, not a statistic. */
function tone(pct: number): string {
  if (pct >= 95) return 'text-emerald-700';
  if (pct >= 60) return 'text-amber-700';
  return 'text-rose-700';
}
function barTone(pct: number): string {
  if (pct >= 95) return 'bg-emerald-500';
  if (pct >= 60) return 'bg-amber-500';
  return 'bg-rose-500';
}
const n = (v: number) => v.toLocaleString('en-NG');

export default function DataQualityPage() {
  const [year, setYear] = useState<number | ''>('');
  const [data, setData] = useState<IdentifierQuality | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setErr(null);
    dataQualityApi.identifiers({ year: year || undefined })
      .then(setData)
      .catch((e) => setErr(extractErrorMessage(e)));
  }, [year]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-7 py-6 mb-6 shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-indigo-500/10" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-indigo-300 mb-1">Submission Data Quality</p>
            <h1 className="text-2xl font-bold text-white">Identifier coverage of what providers send</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-3xl">
              A return that carries no NIN or BVN cannot be tied to a taxpayer, so its money never reaches an
              assessment. This is how complete the submitted data actually is — and what that completeness buys in
              match quality.
            </p>
          </div>
          <div className="flex items-center gap-2 self-center">
            <label className="text-xs text-slate-400">Period year</label>
            <select value={year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white">
              <option value="">All years</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {err && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>}
      {!data && !err ? <div className="pt-12"><LoadingSpinner /></div> : null}

      {data && (
        <div className="space-y-8">
          <p className="text-sm text-slate-500">
            {n(data.scope.records)} records submitted by {data.scope.providers} provider
            {data.scope.providers === 1 ? '' : 's'}
            {data.scope.year ? ` for ${data.scope.year}` : ' across all years'}.
          </p>

          {/* ── Field-by-field fill rate ── */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">On the submitted rows</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.recordFields.map((f) => (
                <div key={f.field} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-800">{f.label}</span>
                    <span className={`text-2xl font-bold tabular-nums ${tone(f.coverage)}`}>{f.coverage}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${barTone(f.coverage)}`} style={{ width: `${f.coverage}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {n(f.present)} present · {n(f.missing)} missing
                    {f.distinct != null && <> · <strong>{n(f.distinct)}</strong> distinct</>}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">{f.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── What the coverage bought ── */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Match quality</h2>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Matched to a taxpayer" value={`${data.matchQuality.matchedPct}%`} sub={`${n(data.matchQuality.matched)} records`} tone={tone(data.matchQuality.matchedPct)} />
                <Stat label="Unmatched" value={n(data.matchQuality.unmatched)} sub="cannot be assessed" tone={data.matchQuality.unmatched > 0 ? 'text-amber-700' : 'text-emerald-700'} />
                <Stat label="No identifier at all" value={n(data.matchQuality.noIdentifier)} sub={`${data.matchQuality.noIdentifierPct}% of rows`} tone={data.matchQuality.noIdentifier > 0 ? 'text-rose-700' : 'text-emerald-700'} />
                <Stat label="Avg match confidence" value={data.matchQuality.avgConfidence?.toFixed(2) ?? '—'} sub="0–1 scale" tone="text-slate-800" />
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-2.5">Matched by</th><th className="px-4 py-2.5 text-right">Records</th><th className="px-4 py-2.5 text-right">Share</th><th className="px-4 py-2.5 text-right">Avg conf.</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.matchQuality.byMethod.map((m) => (
                      <tr key={m.method}>
                        <td className="px-4 py-2.5 font-medium text-slate-800">{m.method}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{n(m.records)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{m.share}%</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{m.avgConfidence?.toFixed(2) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ── The register, where TIN actually lives ── */}
          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">On the taxpayer register</h2>
            <p className="mb-3 text-xs text-slate-500 max-w-3xl">
              Banks <strong>do</strong> supply TIN and RC number in their filings, and that is where this coverage came
              from. But neither is stored on the data record — there is no TIN column — so a submitted TIN is used to
              identify the taxpayer and is not retained per submission. That is why they are reported against the
              register here, and cannot appear as a per-return fill rate above.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="TIN on file" value={`${data.register.withTinPct}%`} sub={`${n(data.register.withTin)} of ${n(data.register.taxpayers)}`} tone={tone(data.register.withTinPct)} />
              <Stat label="NIN on file" value={`${data.register.withNinPct}%`} sub={`${n(data.register.withNin)} taxpayers`} tone={tone(data.register.withNinPct)} />
              <Stat label="BVN on file" value={`${data.register.withBvnPct}%`} sub={`${n(data.register.withBvn)} taxpayers`} tone={tone(data.register.withBvnPct)} />
              <Stat label="CAC RC (corporates)" value={`${data.register.corporatesWithRcPct}%`} sub={`${n(data.register.corporatesWithRc)} of ${n(data.register.corporates)}`} tone={tone(data.register.corporatesWithRcPct)} />
              <Stat label="Identity verified" value={`${data.register.identityVerifiedPct}%`} sub="confirmed via NIBSS/NIMC" tone={tone(data.register.identityVerifiedPct)} />
            </div>
          </section>

          <CoverageTable title="By provider" rows={data.byProvider} labelHeader="Provider" label={(r) => r.providerName ?? '—'} sub={(r) => r.providerType?.replace(/_/g, ' ').toLowerCase()} />
          {data.byYear.length > 1 && (
            <CoverageTable title="By period year" rows={data.byYear} labelHeader="Year" label={(r) => String(r.year)} />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function CoverageTable({
  title, rows, labelHeader, label, sub,
}: {
  title: string; rows: CoverageRow[]; labelHeader: string;
  label: (r: CoverageRow) => string; sub?: (r: CoverageRow) => string | undefined;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{labelHeader}</th>
              <th className="px-4 py-3 text-right">Records</th>
              <th className="px-4 py-3 text-right">NIN</th>
              <th className="px-4 py-3 text-right">BVN</th>
              <th className="px-4 py-3 text-right">Account no.</th>
              <th className="px-4 py-3 text-right">Matched</th>
              <th className="px-4 py-3 text-right">Customers</th>
              <th className="px-4 py-3 text-right">Avg conf.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={`${label(r)}-${i}`} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{label(r)}</p>
                  {sub?.(r) && <p className="text-[11px] text-slate-400">{sub(r)}</p>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{n(r.records)}</td>
                <td className={`px-4 py-3 text-right font-medium tabular-nums ${tone(r.ninCoverage)}`}>{r.ninCoverage}%</td>
                <td className={`px-4 py-3 text-right font-medium tabular-nums ${tone(r.bvnCoverage)}`}>{r.bvnCoverage}%</td>
                <td className={`px-4 py-3 text-right font-medium tabular-nums ${tone(r.accountCoverage)}`}>{r.accountCoverage}%</td>
                <td className={`px-4 py-3 text-right font-medium tabular-nums ${tone(r.matchedPct)}`}>{r.matchedPct}%</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{n(r.distinctCustomers)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{r.avgConfidence?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
