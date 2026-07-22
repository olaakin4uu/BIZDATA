'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { providersApi, type ProviderStats } from '@/lib/api/providers';
import {
  casesApi,
  formatNaira,
  caseDisplayName,
  type CaseStats,
  type UnderdeclarationCase,
  type RiskLevel,
} from '@/lib/api/cases';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { agentsApi, AGENT_NAMES } from '@/lib/api/agents';
import { complianceApi, type ComplianceSummary } from '@/lib/api/compliance';
import { notificationsApi, type Notification } from '@/lib/api/notifications';
import { auditApi } from '@/lib/api/audit';
import { crossStateApi, type Referral } from '@/lib/api/crossState';
import { extractErrorMessage, formatDate } from '@/lib/utils';
import { APP_LONG_NAME } from '@/lib/appName';

/* ─── RISK COLOUR MAP ─────────────────────────────────────────────────────── */
const RISK_META: Record<RiskLevel, { label: string; bar: string; text: string; badge: string }> = {
  CRITICAL: { label: 'Critical', bar: 'bg-rose-500',   text: 'text-rose-700',   badge: 'bg-rose-50 text-rose-700 ring-rose-200' },
  HIGH:     { label: 'High',     bar: 'bg-orange-500', text: 'text-orange-700', badge: 'bg-orange-50 text-orange-700 ring-orange-200' },
  MEDIUM:   { label: 'Medium',   bar: 'bg-blue-500',   text: 'text-blue-700',   badge: 'bg-blue-50 text-blue-700 ring-blue-200' },
  LOW:      { label: 'Low',      bar: 'bg-slate-400',  text: 'text-slate-600',  badge: 'bg-slate-50 text-slate-600 ring-slate-200' },
};

/* ─── FUNNEL COLOURS ─────────────────────────────────────────────────────── */
const FUNNEL_COLORS = [
  'bg-teal-500',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-orange-500',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

/* ─── MAIN PAGE ──────────────────────────────────────────────────────────── */
export default function StaffDashboardPage() {
  const user = useStaffAuthStore((s) => s.user);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [topCases, setTopCases] = useState<UnderdeclarationCase[] | null>(null);
  const [providerStats, setProviderStats] = useState<ProviderStats | null>(null);
  const [compliance, setCompliance] = useState<ComplianceSummary | null>(null);
  const [alerts, setAlerts] = useState<Notification[] | null>(null);
  const [integrity, setIntegrity] = useState<{ verified: boolean; count: number } | null>(null);
  const [referrals, setReferrals] = useState<Referral[] | null>(null);

  useEffect(() => {
    setStats(null); setTopCases(null);
    casesApi.stats(year).then(setStats).catch(() => setStats(null));
    casesApi.list({ year, sort: 'estimatedTaxDue', limit: 6 }).then((r) => setTopCases(r.cases)).catch(() => setTopCases([]));
    providersApi.stats().then(setProviderStats).catch(() => setProviderStats(null));
    complianceApi.summary(year).then(setCompliance).catch(() => setCompliance(null));
    crossStateApi.list().then(setReferrals).catch(() => setReferrals([]));
  }, [year]);

  useEffect(() => {
    notificationsApi.list().then(setAlerts).catch(() => setAlerts([]));
    auditApi.verify().then((v) => setIntegrity({ verified: v.verified, count: v.count })).catch(() => setIntegrity(null));
  }, []);

  const unreadAlerts = alerts?.filter((a) => !a.read).length ?? 0;
  const recoveryRate = stats && stats.estimatedTaxTotal > 0
    ? Math.round((stats.recovered / stats.estimatedTaxTotal) * 100) : 0;
  const maxRisk   = Math.max(1, ...(stats?.byRisk.map((r) => r.count) ?? [1]));
  const maxFunnel = Math.max(1, ...(stats?.funnel.map((f) => f.count) ?? [1]));

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Welcome banner ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 px-7 py-6 mb-8 shadow-lg">
        {/* decorative circles */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-teal-500/10" />
        <div className="pointer-events-none absolute -bottom-8 right-24 h-32 w-32 rounded-full bg-indigo-500/10" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-300 mb-1">{APP_LONG_NAME}</p>
            <h1 className="text-2xl font-bold text-white">
              Welcome back, {user?.firstName ?? 'Analyst'}
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Estimated recoverable revenue from underdeclaration — matched across §29 financial-institution reporting.
            </p>
          </div>
          <div className="flex items-center gap-2 self-center">
            <label className="text-xs text-slate-400">Tax year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-slate-600 rounded-lg text-sm px-3 py-1.5 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Your work: personal, time-bound worklist (what needs YOU today) ── */}
      <MyWorkBand userId={user?.id} firstName={user?.firstName} />

      {/* ── Money-first hero KPIs ─────────────────────────────────────────── */}
      <SectionHeading text="Agency overview" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <HeroKpi
          href={`/cases?year=${year}`}
          label="Revenue at risk"
          value={stats ? formatNaira(stats.revenueAtRisk) : '—'}
          hint="Estimated recoverable tax · open cases"
          gradient="from-rose-500 via-rose-600 to-rose-700"
          icon={<ArrowUpIcon />}
        />
        <HeroKpi
          href={`/cases?status=RECOVERED&year=${year}`}
          label="Recovered"
          value={stats ? formatNaira(stats.recovered) : '—'}
          hint={`${recoveryRate}% of estimated total`}
          gradient="from-emerald-500 via-teal-500 to-teal-700"
          icon={<CheckCircleIcon />}
        />
        <HeroKpi
          href={`/cases?status=OPEN&year=${year}`}
          label="Open cases"
          value={stats?.openCases?.toLocaleString() ?? '—'}
          hint={`${stats?.totalCases ?? 0} detected for ${year}`}
          gradient="from-amber-400 via-orange-500 to-orange-600"
          icon={<FolderIcon />}
        />
        <HeroKpi
          href={`/cases?riskLevel=CRITICAL&year=${year}`}
          label="Critical risk"
          value={stats?.byRisk.find((r) => r.riskLevel === 'CRITICAL')?.count?.toLocaleString() ?? '0'}
          hint="Highest-confidence cases"
          gradient="from-red-600 via-red-700 to-red-800"
          icon={<ShieldExclamationIcon />}
        />
      </div>

      {/* ── Operations strip ──────────────────────────────────────────────── */}
      <SectionHeading text="Operations & compliance" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <OpsCard
          href="/compliance"
          label="Provider compliance"
          value={compliance ? `${compliance.avgCompliance}%` : '—'}
          hint={`${compliance?.totalMissing ?? 0} missing · ${compliance?.totalLate ?? 0} late`}
          accent={compliance && compliance.avgCompliance >= 80 ? 'border-l-emerald-500' : 'border-l-amber-400'}
          valueColor={compliance && compliance.avgCompliance >= 80 ? 'text-emerald-700' : 'text-amber-600'}
          dot={compliance && compliance.avgCompliance >= 80 ? 'bg-emerald-400' : 'bg-amber-400'}
        />
        <OpsCard
          href="/notifications"
          label="Open alerts"
          value={alerts === null ? '—' : unreadAlerts.toLocaleString()}
          hint="High-value flags & missed submissions"
          accent={unreadAlerts > 0 ? 'border-l-amber-400' : 'border-l-slate-300'}
          valueColor={unreadAlerts > 0 ? 'text-amber-600' : 'text-slate-700'}
          dot={unreadAlerts > 0 ? 'bg-amber-400' : 'bg-slate-300'}
        />
        <OpsCard
          href="/audit"
          label="Audit integrity"
          value={integrity === null ? '—' : integrity.verified ? '✓ Intact' : '✗ Tampered'}
          hint={integrity ? `${integrity.count} hash-chained events` : 'SHA-256 chain'}
          accent={integrity?.verified ? 'border-l-sky-500' : integrity ? 'border-l-red-500' : 'border-l-slate-300'}
          valueColor={integrity?.verified ? 'text-sky-700' : integrity ? 'text-red-700' : 'text-slate-500'}
          dot={integrity?.verified ? 'bg-sky-400' : integrity ? 'bg-red-400' : 'bg-slate-300'}
        />
        <OpsCard
          href="/cross-state"
          label="Cross-state referrals"
          value={referrals === null ? '—' : referrals.length.toLocaleString()}
          hint="JRB §15 — outbound + inbound"
          accent="border-l-violet-500"
          valueColor="text-violet-700"
          dot="bg-violet-400"
        />
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* Funnel */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="h-3 w-3 rounded-full bg-teal-500" />
            <h3 className="text-sm font-semibold text-slate-800">Detection → recovery pipeline</h3>
          </div>
          {stats === null ? (
            <Skeleton />
          ) : stats.totalCases === 0 ? (
            <EmptyState year={year} />
          ) : (
            <div className="space-y-3">
              {stats.funnel.map((f, i) => (
                <div key={f.stage} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-slate-500 shrink-0 font-medium">{f.stage}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]}`}
                      style={{ width: `${Math.max(f.count > 0 ? 6 : 0, (f.count / maxFunnel) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs font-semibold text-slate-700">{f.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Risk distribution */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="h-3 w-3 rounded-full bg-rose-500" />
            <h3 className="text-sm font-semibold text-slate-800">Risk distribution</h3>
          </div>
          {stats === null ? <Skeleton /> : stats.byRisk.length === 0 ? (
            <p className="text-xs text-slate-400">No cases for {year}.</p>
          ) : (
            <div className="space-y-4">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as RiskLevel[]).map((lvl) => {
                const row  = stats.byRisk.find((r) => r.riskLevel === lvl);
                const count = row?.count ?? 0;
                const pct   = maxRisk > 0 ? (count / maxRisk) * 100 : 0;
                return (
                  <div key={lvl}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs font-medium ${RISK_META[lvl].text}`}>{RISK_META[lvl].label}</span>
                      <span className="text-xs font-semibold text-slate-700">{count}</span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${RISK_META[lvl].bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Top cases ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-orange-500" />
            <h3 className="text-sm font-semibold text-slate-800">Top cases by recoverable tax</h3>
          </div>
          <Link href="/cases" className="text-xs font-semibold text-teal-700 hover:underline">View all →</Link>
        </div>
        {topCases === null ? <Skeleton /> : topCases.length === 0 ? (
          <EmptyState year={year} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="py-2.5 font-medium">Taxpayer</th>
                  <th className="py-2.5 font-medium text-right">Observed</th>
                  <th className="py-2.5 font-medium text-right">Declared</th>
                  <th className="py-2.5 font-medium text-right">Est. tax</th>
                  <th className="py-2.5 font-medium text-center">Confidence</th>
                  <th className="py-2.5 font-medium text-center">Risk</th>
                </tr>
              </thead>
              <tbody>
                {topCases.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                    <td className="py-3">
                      <Link href={`/cases/${c.id}`} className="font-medium text-slate-800 hover:text-teal-700 transition-colors">
                        {caseDisplayName(c)}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">{c.taxpayer?.stateOfResidence}</span>
                    </td>
                    <td className="py-3 text-right text-slate-600">{formatNaira(c.observedIncome)}</td>
                    <td className="py-3 text-right text-slate-600">{formatNaira(c.declaredIncome)}</td>
                    <td className="py-3 text-right font-bold text-rose-700">{formatNaira(c.estimatedTaxDue)}</td>
                    <td className="py-3 text-center">
                      <ConfidencePip value={Number(c.confidence)} />
                    </td>
                    <td className="py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${RISK_META[c.riskLevel].badge}`}>
                        {RISK_META[c.riskLevel].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AI analytics agents ───────────────────────────────────────────── */}
      <AgentsPanel year={year} />

      {/* ── Provider mix ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="h-3 w-3 rounded-full bg-violet-500" />
          <h3 className="text-sm font-semibold text-slate-800">Provider mix</h3>
        </div>
        {providerStats === null ? <Skeleton /> : providerStats.byType.length === 0 ? (
          <p className="text-xs text-slate-400">No providers yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {providerStats.byType.map((row, i) => {
              const colors = [
                'bg-teal-50 text-teal-700 ring-teal-200',
                'bg-sky-50 text-sky-700 ring-sky-200',
                'bg-violet-50 text-violet-700 ring-violet-200',
                'bg-amber-50 text-amber-700 ring-amber-200',
                'bg-rose-50 text-rose-700 ring-rose-200',
              ];
              return (
                <span key={row.providerType} className={`px-3 py-1.5 rounded-lg text-xs font-medium ring-1 ${colors[i % colors.length]}`}>
                  {row.providerType.replace(/_/g, ' ')} · <span className="font-bold">{row.count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── HERO KPI CARD ──────────────────────────────────────────────────────── */
function HeroKpi({ href, label, value, hint, gradient, icon }: {
  href: string; label: string; value: string; hint: string;
  gradient: string; icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-shadow">
      <div className={`bg-gradient-to-br ${gradient} p-5 h-full`}>
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{label}</p>
          <span className="text-white/60 group-hover:text-white transition-colors">{icon}</span>
        </div>
        <p className="text-3xl font-bold text-white mt-3 leading-none tabular-nums">{value}</p>
        <p className="text-xs text-white/70 mt-2">{hint}</p>
      </div>
    </Link>
  );
}

/* ─── OPS CARD ───────────────────────────────────────────────────────────── */
function OpsCard({ href, label, value, hint, accent, valueColor, dot }: {
  href: string; label: string; value: string; hint: string;
  accent: string; valueColor: string; dot: string;
}) {
  return (
    <Link href={href} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 border-l-4 ${accent} hover:shadow-md transition-shadow block`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </Link>
  );
}

/* ─── SECTION HEADING ────────────────────────────────────────────────────── */
function SectionHeading({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="h-px flex-1 bg-slate-100" />
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 px-2">{text}</span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

/* ─── CONFIDENCE PIP ─────────────────────────────────────────────────────── */
function ConfidencePip({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'text-rose-700' : pct >= 60 ? 'text-orange-600' : 'text-slate-500';
  return <span className={`text-xs font-semibold ${color}`}>{pct}%</span>;
}

/* ─── SKELETON ───────────────────────────────────────────────────────────── */
function Skeleton() {
  return <p className="text-xs text-slate-400 animate-pulse">Loading…</p>;
}

/* ─── AGENTS PANEL ───────────────────────────────────────────────────────── */
function AgentsPanel({ year }: { year: number }) {
  // Per-agent counts come from the SUMMARY endpoint (a DB groupBy over ALL
  // reportable signals) — not from agentsApi.signals(), which returns only the
  // top-200 by score and made agents outside that slice read "0 signals".
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof agentsApi.signalSummary>> | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => { agentsApi.signalSummary(year).then(setSummary).catch(() => setSummary(null)); };
  useEffect(load, [year]);

  const run = async () => {
    setRunning(true); setMsg(null);
    try {
      const r = await agentsApi.run(year);
      setMsg(`Analysed ${r.profiles} taxpayers → ${r.signals} signals`);
      load();
    } catch (e) {
      setMsg(`Run failed: ${extractErrorMessage(e)}`);
    } finally { setRunning(false); }
  };

  const perAgent: Record<string, { count: number }> = {};
  (summary?.byAgent ?? []).forEach((a) => { perAgent[a.agentKey] = { count: a.count }; });

  const AGENT_COLORS = [
    'bg-teal-50 border-teal-200',
    'bg-sky-50 border-sky-200',
    'bg-indigo-50 border-indigo-200',
    'bg-violet-50 border-violet-200',
    'bg-amber-50 border-amber-200',
    'bg-emerald-50 border-emerald-200',
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-800">AI analytics agents · {year}</h3>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/agent-signals?year=${year}`} className="text-xs font-semibold text-indigo-600 hover:underline">
            View full report →
          </Link>
          <button
            onClick={run}
            disabled={running}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 text-white disabled:opacity-50 shadow-sm transition-all"
          >
            {running ? 'Running…' : 'Run agents'}
          </button>
        </div>
      </div>
      {msg && (
        <p className={`text-xs mb-3 font-medium ${msg.startsWith('Run failed') ? 'text-rose-600' : 'text-teal-700'}`}>
          {msg}
        </p>
      )}
      {summary === null ? <Skeleton /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.keys(AGENT_NAMES).map((key, i) => {
            const a = perAgent[key] ?? { count: 0 };
            return (
              <Link
                key={key}
                href={`/agent-signals?year=${year}&agentKey=${key}`}
                className={`rounded-xl border px-4 py-3 ${AGENT_COLORS[i % AGENT_COLORS.length]} hover:shadow-md hover:ring-1 hover:ring-indigo-300 transition block`}
                title={`View ${AGENT_NAMES[key]} signals`}
              >
                <p className="text-xs font-semibold text-slate-700">{AGENT_NAMES[key]}</p>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="font-bold text-slate-700">{a.count.toLocaleString()}</span> signal{a.count === 1 ? '' : 's'}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── YOUR WORK: personal, time-bound worklist ───────────────────────────── */
const ACTIVE_CASE_STATES = ['OPEN', 'UNDER_REVIEW', 'NOTICE_ISSUED', 'OBJECTION'];
const DAY_MS = 86_400_000;

interface Deadline {
  case: UnderdeclarationCase;
  kind: string;
  section: string;
  days: number; // negative = overdue
}

function MyWorkBand({ userId, firstName }: { userId?: string; firstName?: string | null }) {
  const [myCases, setMyCases] = useState<UnderdeclarationCase[] | null>(null);

  useEffect(() => {
    if (!userId) {
      setMyCases([]);
      return;
    }
    casesApi
      .list({ assignedToId: userId, limit: 100 })
      .then((r) => setMyCases(r.cases))
      .catch(() => setMyCases([]));
  }, [userId]);

  const active = (myCases ?? []).filter((c) => ACTIVE_CASE_STATES.includes(c.status));
  const underReview = active.filter((c) => c.status === 'UNDER_REVIEW').length;

  const now = Date.now();
  const deadlines: Deadline[] = [];
  for (const c of active) {
    if (c.objectionDueAt) {
      deadlines.push({ case: c, kind: 'Objection window', section: '§41', days: Math.ceil((new Date(c.objectionDueAt).getTime() - now) / DAY_MS) });
    }
    if (c.authorityResponseDueAt) {
      deadlines.push({ case: c, kind: 'Authority response', section: '§41(6)', days: Math.ceil((new Date(c.authorityResponseDueAt).getTime() - now) / DAY_MS) });
    }
  }
  const closing = deadlines.filter((d) => d.days <= 7).sort((a, b) => a.days - b.days).slice(0, 6);
  const overdueCount = deadlines.filter((d) => d.days < 0).length;

  return (
    <section className="mb-8" aria-label="Your work">
      <SectionHeading text={`Your work${firstName ? ` · ${firstName}` : ''}`} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]">
        {/* Assigned to me */}
        <Link
          href="/cases"
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elev-1)] transition-shadow hover:shadow-[var(--elev-2)]"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">Assigned to me</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-[var(--ink)]">
            {myCases === null ? '—' : active.length}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-2)]">
            {myCases === null ? 'Loading…' : active.length === 0 ? 'No open cases assigned to you' : `${underReview} under review · open worklist`}
          </p>
        </Link>

        {/* Statutory deadlines */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elev-1)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">
              Statutory deadlines · next 7 days
            </p>
            {overdueCount > 0 && (
              <span className="rounded-full bg-[var(--bad-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--bad)]">
                {overdueCount} overdue
              </span>
            )}
          </div>
          {myCases === null ? (
            <p className="text-xs text-[var(--ink-3)]">Loading…</p>
          ) : closing.length === 0 ? (
            <p className="py-3 text-xs text-[var(--ink-2)]">
              No objection or authority-response windows closing in the next 7 days. You’re clear.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line-2)]">
              {closing.map((d, i) => {
                const overdue = d.days < 0;
                const urgent = d.days >= 0 && d.days <= 3;
                const due = d.case.objectionDueAt && d.kind === 'Objection window' ? d.case.objectionDueAt : d.case.authorityResponseDueAt;
                return (
                  <li key={`${d.case.id}-${i}`} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link href={`/cases/${d.case.id}`} className="block truncate text-sm font-medium text-[var(--ink)] hover:text-teal-700">
                        {caseDisplayName(d.case)}
                      </Link>
                      <p className="truncate text-xs text-[var(--ink-3)]">
                        {d.kind} <span className="text-[var(--ink-3)]/70">({d.section})</span> · due {formatDate(due)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        overdue
                          ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                          : urgent
                            ? 'bg-[var(--warn-soft)] text-[var(--warn)]'
                            : 'bg-[var(--surface-2)] text-[var(--ink-2)]'
                      }`}
                    >
                      {overdue ? `${Math.abs(d.days)}d overdue` : d.days === 0 ? 'Due today' : `${d.days}d left`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── EMPTY STATE ────────────────────────────────────────────────────────── */
function EmptyState({ year }: { year: number }) {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-slate-500">No underdeclaration cases for {year}.</p>
      <Link href="/scan" className="text-xs text-teal-700 hover:underline font-medium mt-1 inline-block">Run a scan →</Link>
    </div>
  );
}

/* ─── ICON COMPONENTS ────────────────────────────────────────────────────── */
function ArrowUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25" />
    </svg>
  );
}
function ShieldExclamationIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}
