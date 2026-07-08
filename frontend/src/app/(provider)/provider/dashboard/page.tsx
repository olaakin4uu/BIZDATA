'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LoadingSpinner from '@/components/LoadingSpinner';
import Icon, { type IconName } from '@/components/Icon';
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

  const notice = data?.fieldEnforcementNotice;

  return (
    <div className="space-y-8 rise-in">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {/* ── Standing notice: upcoming compulsory-field requirement ── */}
      {notice && notice.fields.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-[var(--warn-soft)] px-5 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
            <Icon name="flag" width={16} height={16} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              New required fields from {notice.enforceDate}
            </p>
            <p className="mt-0.5 text-sm text-amber-700">
              From <strong>{notice.enforceDate}</strong>, these fields will be mandatory on every submission:{' '}
              <span className="font-medium">{notice.fields.join(', ')}</span>. Until then, rows left blank are still
              accepted but flagged with a warning. Please start including them now — after that date, files missing
              them will be rejected.{' '}
              <Link href="/provider/submissions/new" className="font-medium text-amber-800 underline hover:text-amber-900">
                Download the updated template →
              </Link>
            </p>
          </div>
        </div>
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
            <SectionTitle icon="calendar">{YEAR} filing calendar</SectionTitle>
            <span className="text-xs text-[var(--ink-3)]">
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
          <div className="mb-3"><SectionTitle icon="chart">This year</SectionTitle></div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Submissions" value={data?.stats.submissions ?? 0} icon="upload" tone="brand" />
            <Stat label="Accepted" value={data?.stats.accepted ?? 0} icon="shield" tone={data && data.stats.accepted > 0 ? 'good' : 'muted'} />
            <Stat label="Records" value={data?.stats.records ?? 0} icon="records" tone="info" />
            <Stat label="Flagged by regulator" value={data?.stats.flagged ?? 0} icon="flag" tone={data && data.stats.flagged > 0 ? 'warn' : 'muted'} />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <SectionTitle icon="document">Recent submissions</SectionTitle>
            <Link href="/provider/submissions" className="text-xs font-medium text-teal-700 hover:text-teal-800">View all →</Link>
          </div>
          {data && data.recentSubmissions.length > 0 ? (
            <ul className="divide-y divide-[var(--line-2)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elev-1)]">
              {data.recentSubmissions.map((s) => (
                <li key={s.id}>
                  <Link href={`/provider/submissions/${s.id}`} className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]">
                    <div className="min-w-0">
                      <p className="tnum font-mono text-sm text-[var(--ink)]">{s.periodLabel}</p>
                      <p className="truncate text-xs text-[var(--ink-3)]">{s.fileName ?? '—'} · {formatDate(s.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tnum text-xs text-[var(--ink-2)]">{s.acceptedCount}/{s.recordCount}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(s.status)}`}>
                        {s.status.replace('_', ' ')}
                      </span>
                      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.6} className="text-[var(--ink-3)] transition-transform group-hover:translate-x-0.5" aria-hidden><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-12 text-center">
              <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--ink-3)] ring-1 ring-[var(--line)]">
                <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 3.5h6l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" /><path d="M13 3.5V9h5" /></svg>
              </span>
              <p className="text-sm text-[var(--ink-2)]">No returns filed yet.</p>
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

  // "Healthy" states (all filed, or comfortably ahead) get the celebratory brand
  // gradient — teal reads as on-track. Attention states stay on semantic tints so
  // colour still means something.
  const healthy = next == null || (!overdue && !soon);

  if (healthy) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-white sm:p-8"
        style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-3)' }}
      >
        <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-100/80">{orgName}</p>
            {next == null ? (
              <>
                <p className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
                  <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
                  All returns up to date
                </p>
                <p className="mt-1.5 text-sm text-teal-50/90">Nothing due right now for {YEAR}. We&apos;ll flag the next quarter as it approaches.</p>
              </>
            ) : (
              <>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-teal-100/90">Next return due</span>
                  <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold ring-1 ring-white/25">{next.period}</span>
                </p>
                <p className="mt-1 flex items-baseline gap-3">
                  <span className="tnum text-5xl font-bold tracking-tight">{days}</span>
                  <span className="text-lg text-teal-50/90">day{days === 1 ? '' : 's'} to file</span>
                </p>
                <p className="mt-1 text-sm text-teal-50/80">
                  Statutory due date {formatDate(next.dueAt)} (NTAA §29, period end + 15 days).
                </p>
              </>
            )}
          </div>
          <div className="relative flex items-center gap-6">
            {rate != null && (
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wide text-teal-100/80">On-time rate</p>
                <p className="tnum text-2xl font-semibold">{rate}%</p>
              </div>
            )}
            <Link
              href="/provider/submissions/new"
              className="rounded-lg bg-white/95 px-5 py-2.5 text-sm font-semibold text-teal-800 shadow-sm transition-all hover:bg-white hover:shadow-md active:scale-[0.99]"
            >
              File a return
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Attention states — semantic tone, richer surface + accent bar.
  const tone = overdue
    ? { bar: 'bg-rose-500', ring: 'ring-rose-200', chip: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200', accent: 'text-rose-600', soft: 'bg-[var(--bad-soft)]' }
    : { bar: 'bg-amber-500', ring: 'ring-amber-200', chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', accent: 'text-amber-600', soft: 'bg-[var(--warn-soft)]' };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[var(--line)] ${tone.soft} p-6 shadow-sm ring-1 ${tone.ring} sm:p-8`}>
      <span className={`absolute inset-y-0 left-0 w-1.5 ${tone.bar}`} aria-hidden />
      <div className="flex flex-wrap items-end justify-between gap-6 pl-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-3)]">{orgName}</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-sm font-medium text-[var(--ink-2)]">
              {overdue ? 'Return overdue' : 'Next return due'}
            </span>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>{next!.period}</span>
          </p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className={`tnum text-5xl font-bold tracking-tight ${tone.accent}`}>
              {overdue ? Math.abs(days ?? 0) : days}
            </span>
            <span className="text-lg text-[var(--ink-2)]">
              {overdue ? `day${Math.abs(days ?? 0) === 1 ? '' : 's'} overdue` : `day${days === 1 ? '' : 's'} to file`}
            </span>
          </p>
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            Statutory due date {formatDate(next!.dueAt)} (NTAA §29, period end + 15 days).
          </p>
        </div>

        <div className="flex items-center gap-6">
          {rate != null && (
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">On-time rate</p>
              <p className="tnum text-2xl font-semibold text-[var(--ink)]">{rate}%</p>
            </div>
          )}
          <Link
            href="/provider/submissions/new"
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.99]"
            style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-brand)' }}
          >
            File a return
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Section title with icon chip ────────────────────────────────────────────
function SectionTitle({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--ink)]">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
        <Icon name={icon} width={14} height={14} />
      </span>
      {children}
    </h2>
  );
}

// ─── Filing calendar cell ────────────────────────────────────────────────────
const CELL_STYLE: Record<PeriodStatus, { dot: string; label: string; ring: string; text: string; top: string }> = {
  ON_TIME: { dot: 'bg-emerald-500', label: 'Filed', ring: 'border-emerald-200 bg-emerald-50/60', text: 'text-emerald-700', top: 'bg-emerald-400' },
  LATE: { dot: 'bg-amber-500', label: 'Filed late', ring: 'border-amber-200 bg-amber-50/60', text: 'text-amber-700', top: 'bg-amber-400' },
  MISSING: { dot: 'bg-rose-500', label: 'Overdue', ring: 'border-rose-200 bg-rose-50/60', text: 'text-rose-700', top: 'bg-rose-400' },
  PENDING: { dot: 'bg-slate-300', label: 'Upcoming', ring: 'border-[var(--line)] bg-[var(--surface)]', text: 'text-[var(--ink-3)]', top: 'bg-slate-200' },
};

function FilingCell({ period, isNext }: { period: CompliancePeriod; isNext: boolean }) {
  const s = CELL_STYLE[period.status];
  const days = daysUntil(period.dueAt);
  return (
    <div className={`lift relative overflow-hidden rounded-xl border p-4 ${s.ring} ${isNext ? 'ring-2 ring-teal-500/40 shadow-[var(--elev-2)]' : 'shadow-[var(--elev-1)]'}`}>
      <span className={`absolute inset-x-0 top-0 h-1 ${s.top}`} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="tnum font-mono text-sm font-semibold tracking-tight text-[var(--ink)]">{period.period}</span>
        <span className={`h-2 w-2 rounded-full ${s.dot} ${isNext ? 'ring-2 ring-teal-200' : ''}`} aria-hidden />
      </div>
      <p className={`mt-2 text-xs font-medium ${s.text}`}>{s.label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
        {period.status === 'PENDING'
          ? days >= 0 ? `due in ${days}d` : `due ${formatDate(period.dueAt)}`
          : period.status === 'MISSING'
            ? `was due ${formatDate(period.dueAt)}`
            : `filed ${period.receivedAt ? formatDate(period.receivedAt) : ''}`}
      </p>
    </div>
  );
}

// ─── Stat (compact, portal-styled — soft semantic tint + icon) ───────────────
type StatTone = 'brand' | 'good' | 'warn' | 'info' | 'muted';
const STAT_TONE: Record<StatTone, { value: string; chip: string; bar: string }> = {
  brand: { value: 'text-teal-700', chip: 'bg-teal-50 text-teal-700 ring-teal-100', bar: 'bg-teal-400' },
  good: { value: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100', bar: 'bg-emerald-400' },
  warn: { value: 'text-amber-700', chip: 'bg-amber-50 text-amber-700 ring-amber-100', bar: 'bg-amber-400' },
  info: { value: 'text-[var(--info)]', chip: 'bg-blue-50 text-blue-700 ring-blue-100', bar: 'bg-blue-400' },
  muted: { value: 'text-[var(--ink-3)]', chip: 'bg-slate-100 text-slate-500 ring-slate-200', bar: 'bg-slate-200' },
};

function Stat({ label, value, icon, tone = 'brand' }: { label: string; value: number; icon: IconName; tone?: StatTone }) {
  const t = STAT_TONE[tone];
  return (
    <div className="lift relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--elev-1)]">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${t.bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">{label}</p>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${t.chip}`}>
          <Icon name={icon} width={15} height={15} />
        </span>
      </div>
      <p className={`tnum mt-1.5 text-2xl font-semibold ${t.value}`}>{value.toLocaleString()}</p>
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
