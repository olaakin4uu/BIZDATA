'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  providerPortalApi,
  type ProviderDashboard,
  type ProviderCompliance,
  type CompliancePeriod,
  type PeriodStatus,
} from '@/lib/api/provider-portal';
import { useProviderAuthStore } from '@/store/providerAuthStore';
import { formatDate, statusBadge, extractErrorMessage } from '@/lib/utils';

const YEAR = new Date().getFullYear();

export default function ProviderDashboardPage() {
  const user = useProviderAuthStore((s) => s.user);
  const [data, setData] = useState<ProviderDashboard | null>(null);
  const [compliance, setCompliance] = useState<ProviderCompliance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([providerPortalApi.dashboard(), providerPortalApi.compliance(YEAR)])
      .then(([d, c]) => { setData(d); setCompliance(c); })
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  // The obligation that matters: the earliest period not yet filed on time.
  const nextDue = useMemo(() => pickNextDue(compliance?.periods ?? []), [compliance]);

  if (loading) return <div className="pt-16"><LoadingSpinner /></div>;

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* ── Hero: the next filing obligation ── */}
      <DeadlineHero
        orgName={user?.providerName ?? user?.provider?.name ?? 'your organisation'}
        next={nextDue}
        rate={compliance?.complianceRate ?? null}
      />

      {/* ── Filing calendar rail: the provider's whole §29 year at a glance ── */}
      {compliance && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-slate-800">
              {YEAR} filing calendar
            </h2>
            <span className="text-xs text-slate-400">
              {compliance.provider.reportingFrequency.toLowerCase()} · {compliance.provider.providerType.replace('_', ' ').toLowerCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {compliance.periods.map((p) => (
              <FilingCell key={p.period} period={p} isNext={p.period === nextDue?.period} />
            ))}
          </div>
        </section>
      )}

      {/* ── Activity: demoted below the obligation ── */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-slate-800">This year</h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Submissions" value={data?.stats.submissions ?? 0} />
            <Stat label="Accepted" value={data?.stats.accepted ?? 0} tone={data && data.stats.accepted > 0 ? 'good' : 'muted'} />
            <Stat label="Records" value={data?.stats.records ?? 0} />
            <Stat label="Flagged by regulator" value={data?.stats.flagged ?? 0} tone={data && data.stats.flagged > 0 ? 'warn' : 'muted'} />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-slate-800">Recent submissions</h2>
            <Link href="/provider/submissions" className="text-xs font-medium text-teal-700 hover:text-teal-800">View all →</Link>
          </div>
          {data && data.recentSubmissions.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {data.recentSubmissions.map((s) => (
                <li key={s.id}>
                  <Link href={`/provider/submissions/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/70">
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-slate-800">{s.periodLabel}</p>
                      <p className="truncate text-xs text-slate-400">{s.fileName ?? '—'} · {formatDate(s.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular-nums text-xs text-slate-500">{s.acceptedCount}/{s.recordCount}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(s.status)}`}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
              <p className="text-sm text-slate-500">No returns filed yet.</p>
              <Link href="/provider/submissions/new" className="mt-2 inline-block text-sm font-medium text-teal-700 hover:text-teal-800">
                File your first return →
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────
function DeadlineHero({ orgName, next, rate }: { orgName: string; next: NextDue | null; rate: number | null }) {
  // Compute days-to-due client-side so it's always current.
  const days = next ? daysUntil(next.dueAt) : null;
  const overdue = next?.status === 'MISSING' || (days != null && days < 0);
  const soon = days != null && days >= 0 && days <= 14;

  const tone = next == null
    ? { ring: 'ring-emerald-200', chip: 'bg-emerald-50 text-emerald-700', accent: 'text-emerald-600' }
    : overdue
      ? { ring: 'ring-rose-200', chip: 'bg-rose-50 text-rose-700', accent: 'text-rose-600' }
      : soon
        ? { ring: 'ring-amber-200', chip: 'bg-amber-50 text-amber-700', accent: 'text-amber-600' }
        : { ring: 'ring-slate-200', chip: 'bg-slate-100 text-slate-600', accent: 'text-slate-700' };

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ${tone.ring} sm:p-8`}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{orgName}</p>
          {next == null ? (
            <>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">All returns up to date</p>
              <p className="mt-1 text-sm text-slate-500">Nothing due right now for {YEAR}. We&apos;ll flag the next quarter as it approaches.</p>
            </>
          ) : (
            <>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-sm font-medium text-slate-500">
                  {overdue ? 'Return overdue' : 'Next return due'}
                </span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>{next.period}</span>
              </p>
              <p className="mt-1 flex items-baseline gap-3">
                <span className={`text-5xl font-bold tabular-nums tracking-tight ${tone.accent}`}>
                  {overdue ? Math.abs(days ?? 0) : days}
                </span>
                <span className="text-lg text-slate-500">
                  {overdue ? `day${Math.abs(days ?? 0) === 1 ? '' : 's'} overdue` : `day${days === 1 ? '' : 's'} to file`}
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Statutory due date {formatDate(next.dueAt)} (NTAA §29, period end + 15 days).
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-6">
          {rate != null && (
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">On-time rate</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-800">{rate}%</p>
            </div>
          )}
          <Link
            href="/provider/submissions/new"
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800"
          >
            File a return
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Filing calendar cell ────────────────────────────────────────────────────
const CELL_STYLE: Record<PeriodStatus, { dot: string; label: string; ring: string; text: string }> = {
  ON_TIME: { dot: 'bg-emerald-500', label: 'Filed', ring: 'border-emerald-200 bg-emerald-50/50', text: 'text-emerald-700' },
  LATE: { dot: 'bg-amber-500', label: 'Filed late', ring: 'border-amber-200 bg-amber-50/50', text: 'text-amber-700' },
  MISSING: { dot: 'bg-rose-500', label: 'Overdue', ring: 'border-rose-200 bg-rose-50/50', text: 'text-rose-700' },
  PENDING: { dot: 'bg-slate-300', label: 'Upcoming', ring: 'border-slate-200 bg-white', text: 'text-slate-500' },
};

function FilingCell({ period, isNext }: { period: CompliancePeriod; isNext: boolean }) {
  const s = CELL_STYLE[period.status];
  const days = daysUntil(period.dueAt);
  return (
    <div className={`relative rounded-xl border p-4 ${s.ring} ${isNext ? 'ring-2 ring-teal-500/30' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold tracking-tight text-slate-800">{period.period}</span>
        <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      </div>
      <p className={`mt-2 text-xs font-medium ${s.text}`}>{s.label}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        {period.status === 'PENDING'
          ? days >= 0 ? `due in ${days}d` : `due ${formatDate(period.dueAt)}`
          : period.status === 'MISSING'
            ? `was due ${formatDate(period.dueAt)}`
            : `filed ${period.receivedAt ? formatDate(period.receivedAt) : ''}`}
      </p>
    </div>
  );
}

// ─── Stat (compact, portal-styled) ───────────────────────────────────────────
function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'good' | 'warn' | 'muted' }) {
  const color = { default: 'text-slate-800', good: 'text-emerald-700', warn: 'text-amber-700', muted: 'text-slate-400' }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
interface NextDue { period: string; dueAt: string; status: PeriodStatus }

/** The obligation to surface: overdue first, else the soonest upcoming. */
function pickNextDue(periods: CompliancePeriod[]): NextDue | null {
  const missing = periods.filter((p) => p.status === 'MISSING').sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  if (missing.length) return missing[0];
  const pending = periods.filter((p) => p.status === 'PENDING').sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  if (pending.length) return pending[0];
  return null; // everything filed
}

function daysUntil(iso: string): number {
  const due = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((due - now) / 86_400_000);
}
