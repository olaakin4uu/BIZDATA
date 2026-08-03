'use client';
import { useEffect, useState, useMemo, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Select } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { StatusBadge } from '@/components/StatusBadge';
import { casesApi, caseDisplayName, type UnderdeclarationCase, type CaseStatus, type CaseDocument } from '@/lib/api/cases';
import { dataRecordsApi, type DataRecord } from '@/lib/api/data-records';
import { agentsApi, AGENT_NAMES, type RiskSignal } from '@/lib/api/agents';
import { usersApi, type StaffUserRecord } from '@/lib/api/users';
import { formatMoney, formatDate, formatDateTime, extractErrorMessage } from '@/lib/utils';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { readErrorMessage } from '@/lib/api/client';
import RecordAccessGate from '@/components/access/RecordAccessGate';

// Mirror of the backend lifecycle state machine (cases.service.ts).
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'DISMISSED'],
  UNDER_REVIEW: ['NOTICE_ISSUED', 'DISMISSED'],
  NOTICE_ISSUED: ['OBJECTION', 'CONFIRMED'],
  OBJECTION: ['CONFIRMED', 'DISMISSED'],
  CONFIRMED: ['SETTLED', 'RECOVERED'],
  SETTLED: ['RECOVERED', 'CLOSED'],
  RECOVERED: ['CLOSED'],
  DISMISSED: ['CLOSED'],
  CLOSED: [],
};

const ACTION_LABEL: Record<CaseStatus, string> = {
  OPEN: 'Reopen',
  UNDER_REVIEW: 'Start review',
  NOTICE_ISSUED: 'Issue notice',
  OBJECTION: 'Record objection',
  CONFIRMED: 'Confirm assessment',
  SETTLED: 'Mark settled',
  RECOVERED: 'Mark recovered',
  DISMISSED: 'Dismiss',
  CLOSED: 'Close case',
};

const DANGER_TARGETS: CaseStatus[] = ['DISMISSED'];

// Observed-flows ledger: providers render collapsed; each account reveals rows in
// chunks so the initial DOM stays small even for very active taxpayers.
const INITIAL_ROWS = 50;
const ROW_STEP = 50;

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [c, setC] = useState<UnderdeclarationCase | null>(null);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [signals, setSignals] = useState<RiskSignal[]>([]);
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<CaseStatus | null>(null);
  const [notes, setNotes] = useState('');
  const [recovered, setRecovered] = useState('');
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<StaffUserRecord[]>([]);
  const [assigning, setAssigning] = useState(false);
  const currentUserId = useStaffAuthStore((s) => s.user?.id);
  // Ledger interaction: which provider blocks are expanded, and how many rows
  // each account currently reveals (keyed `${providerId}:${accountNumber}`).
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [rowLimits, setRowLimits] = useState<Record<string, number>>({});
  const toggleProvider = (pid: string) =>
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  // In-app secured document viewer. The confidential report (evidence bundle /
  // tax report) is fetched WITH the auth token and rendered inside a sandboxed
  // same-origin iframe in a modal — it never leaves the authenticated session as
  // a standalone blob tab. `report` holds the fetched HTML.
  const [report, setReport] = useState<{ title: string; html: string } | null>(null);
  const [reportLoading, setReportLoading] = useState<string | null>(null);
  // Opened when a report is refused for want of access, so the officer lands on
  // the fix rather than on an error they cannot act on.
  const [accessGate, setAccessGate] = useState<string | null>(null);

  const openReport = async (path: string, title: string) => {
    setReportLoading(title);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('bizdata_staff_token') : null;
      const res = await fetch(`${base}/cases/${id}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.status === 403) {
        // Not a failure to explain — a gate to walk through. Show the steps.
        setAccessGate(title);
        throw new Error(await readErrorMessage(res));
      }
      if (!res.ok) throw new Error(await readErrorMessage(res));
      setReport({ title, html: await res.text() });
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setReportLoading(null);
    }
  };

  const load = () => {
    casesApi.get(id)
      .then((data) => {
        setC(data);
        agentsApi.signals({ taxpayerId: data.taxpayerId, year: data.year }).then(setSignals).catch(() => setSignals([]));
        casesApi.listDocuments(id).then(setDocs).catch(() => setDocs([]));
        // Pull records for this identity across ALL providers (no providerId
        // filter) so the observed-flows ledger is the full cross-provider picture.
        // Capped at a sane limit — providers render collapsed and accounts reveal
        // rows in chunks, so we never need a multi-thousand-row payload on load.
        return dataRecordsApi.list({ taxpayerId: data.taxpayerId, periodYear: data.year, limit: 500 });
      })
      .then((r) => setRecords(r?.records ?? []))
      .catch((e) => setError(extractErrorMessage(e)));
  };
  useEffect(load, [id]);

  // Group the observed flows by PROVIDER, then by ACCOUNT NUMBER within each
  // provider (the cross-provider consolidation). Each account is a dated ledger
  // with its own subtotal; providers/accounts are ordered by total inflow.
  const providerGroups = useMemo(() => {
    const txDate = (r: DataRecord) => ((r.payload ?? {}) as { transactionDate?: string }).transactionDate ?? '';
    type Acct = { accountNumber: string; accountName: string; rows: DataRecord[]; inflow: number; outflow: number };
    type Grp = { providerId: string; providerName: string; accounts: Map<string, Acct>; rows: DataRecord[]; inflow: number; outflow: number };
    const map = new Map<string, Grp>();
    for (const r of records) {
      const pid = r.provider?.id ?? r.providerId ?? r.providerType;
      const pname = r.provider?.name ?? r.providerType;
      if (!map.has(pid)) map.set(pid, { providerId: pid, providerName: pname, accounts: new Map(), rows: [], inflow: 0, outflow: 0 });
      const g = map.get(pid)!;
      const acctNo = r.accountNumber || '(no account no.)';
      if (!g.accounts.has(acctNo)) g.accounts.set(acctNo, { accountNumber: acctNo, accountName: r.accountName || '', rows: [], inflow: 0, outflow: 0 });
      const a = g.accounts.get(acctNo)!;
      a.rows.push(r); a.inflow += Number(r.totalInflow ?? 0); a.outflow += Number(r.totalOutflow ?? 0);
      g.rows.push(r); g.inflow += Number(r.totalInflow ?? 0); g.outflow += Number(r.totalOutflow ?? 0);
    }
    const groups = [...map.values()].map((g) => {
      const accounts = [...g.accounts.values()];
      accounts.forEach((a) => a.rows.sort((x, y) => txDate(x).localeCompare(txDate(y))));
      accounts.sort((a, b) => b.inflow - a.inflow);
      return { ...g, accounts };
    });
    groups.sort((a, b) => b.inflow - a.inflow);
    return groups;
  }, [records]);

  // Staff list for the reassign control (active users only).
  useEffect(() => {
    usersApi.list({ limit: 200 })
      .then((r) => setStaff(r.users.filter((u) => u.isActive)))
      .catch(() => setStaff([]));
  }, []);

  const reassign = async (assignedToId: string | null) => {
    setAssigning(true); setError(null);
    try {
      await casesApi.assign(id, assignedToId);
      load();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setAssigning(false);
    }
  };

  const submit = async () => {
    if (!pending) return;
    setBusy(true); setError(null);
    try {
      await casesApi.transition(id, pending, {
        notes: notes || undefined,
        recoveredAmount: recovered ? Number(recovered) : undefined,
      });
      setPending(null); setNotes(''); setRecovered('');
      load();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !c) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!c) return <div className="p-6 text-sm text-slate-400">Loading…</div>;

  const reasons = c.reasons ?? [];
  const allowed = TRANSITIONS[c.status] ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/cases" className="text-xs text-teal-700 hover:underline">← All cases</Link>
      <div className="flex items-start justify-between flex-wrap gap-3 mt-2">
        <PageHeader
          title={caseDisplayName(c)}
          subtitle={`${c.taxpayer?.type ?? ''} · ${c.taxpayer?.stateOfResidence ?? '—'} · TIN ${c.taxpayer?.tin ?? '—'} · ${c.year}`}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => openReport('tax-report.html', 'AI Tax Report')}
            disabled={reportLoading !== null}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
          >
            {reportLoading === 'AI Tax Report' ? 'Loading…' : 'AI Tax Report'}
          </button>
          <button
            onClick={() => openReport('evidence', 'Evidence Bundle')}
            disabled={reportLoading !== null}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {reportLoading === 'Evidence Bundle' ? 'Loading…' : 'Evidence bundle'}
          </button>
          <StatusBadge status={c.status} className="px-3 py-1" />
        </div>
      </div>

      {error && <div className="mb-4 px-3 py-2 bg-[var(--bad-soft)] border border-[var(--bad)] rounded-lg text-sm text-[var(--bad)]">{error}</div>}

      {accessGate && (
        <div className="mb-4">
          <RecordAccessGate
            scope={{ caseId: id }}
            label={accessGate}
            onClose={() => setAccessGate(null)}
            onUnlocked={() => {
              setError(null);
              openReport(accessGate === 'Evidence Bundle' ? 'evidence' : 'tax-report.html', accessGate);
            }}
          />
        </div>
      )}

      {/* Money summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Metric label="Observed income" value={formatMoney(c.observedIncome)} />
        <Metric label="Declared income" value={formatMoney(c.declaredIncome)} />
        <Metric label="Discrepancy" value={formatMoney(c.discrepancyAmount)} tone="amber" />
        {c.taxBasis === 'NOT_ASSESSED_LLC' ? (
          <Metric
            label="Estimated tax due"
            value="Not state-assessed"
            hint="Limited company — income tax is federal (FIRS). Pursue PAYE / CGT / WHT remittance."
          />
        ) : (
          <Metric
            label="Estimated tax due"
            value={formatMoney(c.estimatedTaxDue)}
            tone="red"
            hint={
              c.altTaxDue != null
                ? `Graduated (NTA). Flat @ ${Math.round(Number(c.altTaxRate ?? 0) * 100)}%: ${formatMoney(c.altTaxDue)}`
                : 'Graduated Nigeria Tax Act bands'
            }
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: explainability + records */}
        <div className="lg:col-span-2 space-y-6">
          {/* Why flagged */}
          <Card title={`Why this was flagged — confidence ${Math.round(Number(c.confidence) * 100)}%`}>
            {reasons.length === 0 ? (
              <p className="text-xs text-[var(--ink-3)]">No reason codes recorded.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {reasons.map((r) => (
                    <li key={r.code} className="flex items-start justify-between gap-3 text-sm">
                      <div>
                        <span className="font-medium text-[var(--ink)]">{r.label}</span>
                        <span className="ml-2 text-xs text-[var(--ink-3)]">{r.code}</span>
                      </div>
                      <span
                        title="Contribution to the confidence score (out of 100)"
                        className={`text-xs font-medium tnum ${r.weight >= 0 ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}`}
                      >
                        {r.weight >= 0 ? '+' : ''}{Math.round(r.weight * 100)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[var(--ink-3)] mt-2">
                  Each figure is that signal’s contribution to the confidence score (out of 100) — positive raises it, negative lowers it.
                </p>
              </>
            )}
            <p className="text-xs text-[var(--ink-3)] mt-3 pt-3 border-t border-[var(--line)]">
              Detection engine {c.scan?.engineVersion ?? c.engineVersion ?? '—'} · {c.providerCount} corroborating provider{c.providerCount === 1 ? '' : 's'} · threshold {c.scan ? `${(Number(c.scan.threshold) * 100).toFixed(0)}%` : '—'}
            </p>
          </Card>

          {/* Taxpayer 360 — observed flows as a dated ledger, grouped by provider.
              When this identity (BVN/TIN/NIN) matches across providers, each
              provider's transactions appear as its own block — the cross-provider
              consolidation. */}
          <Card title={`Observed flows · ${c.year} (${records.length} transaction${records.length === 1 ? '' : 's'}${providerGroups.length > 1 ? ` · ${providerGroups.length} providers` : ''})`}>
            {records.length === 0 ? (
              <p className="text-xs text-[var(--ink-3)]">No linked records.</p>
            ) : (
              <div className="space-y-5">
                {providerGroups.length > 1 && (
                  <p className="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                    Identity matched across {providerGroups.length} providers — transactions from each are consolidated below. Expand a provider to see its ledger.
                  </p>
                )}
                {providerGroups.map((g) => {
                  const open = expandedProviders.has(g.providerId);
                  return (
                    <div key={g.providerId} className="rounded-lg border border-[var(--line)] overflow-hidden">
                      {/* Provider header — click to expand its account ledgers (collapsed by default). */}
                      <button
                        type="button"
                        onClick={() => toggleProvider(g.providerId)}
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-3 bg-[var(--surface-2)] px-3 py-2 text-left transition-colors hover:brightness-95"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <svg
                            viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.5}
                            strokeLinecap="round" strokeLinejoin="round" aria-hidden
                            className={`shrink-0 text-[var(--ink-3)] transition-transform ${open ? 'rotate-90' : ''}`}
                          >
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                          <span className="truncate text-sm font-semibold text-[var(--ink)]">{g.providerName}</span>
                        </span>
                        <span className="shrink-0 text-xs text-[var(--ink-3)]">
                          {g.accounts.length} account{g.accounts.length === 1 ? '' : 's'} · {g.rows.length} txn{g.rows.length === 1 ? '' : 's'} · in {formatMoney(g.inflow)} · out {formatMoney(g.outflow)}
                        </span>
                      </button>
                      {/* Accounts within the provider — only mounted when expanded. */}
                      {open && (
                        <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                          {g.accounts.map((a) => {
                            const key = `${g.providerId}:${a.accountNumber}`;
                            const shown = rowLimits[key] ?? INITIAL_ROWS;
                            const visible = a.rows.slice(0, shown);
                            const remaining = a.rows.length - visible.length;
                            return (
                              <div key={a.accountNumber} className="px-3 py-2 overflow-x-auto">
                                <div className="flex items-baseline justify-between mb-1">
                                  <span className="text-xs font-semibold text-[var(--ink-2)]">
                                    Acct <span className="tnum font-mono">{a.accountNumber}</span>
                                    {a.accountName && <span className="ml-2 font-normal text-[var(--ink-3)]">{a.accountName}</span>}
                                  </span>
                                  <span className="text-[11px] text-[var(--ink-3)]">
                                    {a.rows.length} txn{a.rows.length === 1 ? '' : 's'} · in {formatMoney(a.inflow)} · out {formatMoney(a.outflow)}
                                  </span>
                                </div>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--ink-3)] border-b border-[var(--line)]">
                                      <th className="py-1.5 font-medium">Date</th>
                                      <th className="py-1.5 font-medium">Description</th>
                                      <th className="py-1.5 font-medium text-right">Inflow</th>
                                      <th className="py-1.5 font-medium text-right">Outflow</th>
                                      <th className="py-1.5 font-medium text-center">Type</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {visible.map((r) => {
                                      const pl = (r.payload ?? {}) as { transactionDate?: string; description?: string; transactionType?: string };
                                      return (
                                        <tr key={r.id} className="border-b border-[var(--line)]">
                                          <td className="py-1.5 text-[var(--ink-2)] whitespace-nowrap tnum">{pl.transactionDate ? formatDate(pl.transactionDate) : '—'}</td>
                                          <td className="py-1.5 text-[var(--ink-3)] max-w-[220px] truncate" title={pl.description ?? ''}>{pl.description ?? '—'}</td>
                                          <td className="py-1.5 text-right text-[var(--ink)] tnum">{formatMoney(r.totalInflow)}</td>
                                          <td className="py-1.5 text-right text-[var(--ink-3)] tnum">{formatMoney(r.totalOutflow)}</td>
                                          <td className="py-1.5 text-center text-xs text-[var(--ink-3)]">{pl.transactionType ?? '—'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                {remaining > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setRowLimits((m) => ({ ...m, [key]: shown + ROW_STEP }))}
                                    className="mt-2 text-xs font-medium text-teal-700 hover:underline"
                                  >
                                    Show {Math.min(ROW_STEP, remaining)} more · {remaining} hidden
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* AI agent signals */}
          <Card title={`AI analytics signals (${signals.length})`}>
            {signals.length === 0 ? (
              <p className="text-xs text-slate-400">No agent signals for this taxpayer/year. Run the agents from the dashboard.</p>
            ) : (
              <ul className="space-y-2.5">
                {signals.map((s) => {
                  const tone = s.severity === 'HIGH' ? 'text-red-700 bg-red-50' : s.severity === 'MEDIUM' ? 'text-amber-700 bg-amber-50' : 'text-slate-600 bg-slate-50';
                  return (
                    <li key={s.id} className="flex items-start gap-3 text-sm">
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${tone}`}>
                        {Math.round(Number(s.score) * 100)}%
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800">{AGENT_NAMES[s.agentKey] ?? s.agentKey}</span>
                        <p className="text-xs text-slate-500">{s.summary}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Objection documents — Document Intelligence */}
          <Card title={`Objection documents (${docs.length})`}>
            <DocumentPanel caseId={id} docs={docs} onChange={load} />
          </Card>

          {/* §35 Best-of-Judgement assessment (once a notice is issued) */}
          {c.demandNoticeRef && (
            <Card title={`Best-of-Judgement assessment · ${c.demandNoticeRef}`}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row k="Assessed tax (§35)" v={formatMoney(c.assessedTax)} />
                <Row k="Late-payment penalty (10%)" v={formatMoney(c.penaltyAmount)} />
                <Row k="Total demand" v={<span className="font-semibold text-red-700">{formatMoney(c.assessedTotal)}</span>} />
                <Row k="Objection due (§41)" v={c.objectionDueAt ? formatDate(c.objectionDueAt) : '—'} />
                <Row k="Authority response due (§41(6))" v={c.authorityResponseDueAt ? formatDate(c.authorityResponseDueAt) : '—'} />
              </dl>
              <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                Presumed valid until rebutted within the §41 objection window. If the authority does not respond within 90 days, the objection is deemed upheld (§41(6)).
              </p>
            </Card>
          )}
        </div>

        {/* Right: lifecycle actions */}
        <div className="space-y-6">
          <Card title="Case actions">
            {/* Assignment — first-class control at the top of the actions rail. */}
            <div className="mb-4 pb-4 border-b border-[var(--line)] space-y-2">
              <Select
                label="Assigned to"
                value={c.assignedTo?.id ?? ''}
                disabled={assigning}
                onChange={(e) => reassign(e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </Select>
              {currentUserId && c.assignedTo?.id !== currentUserId && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  loading={assigning}
                  onClick={() => reassign(currentUserId)}
                >
                  Assign to me
                </Button>
              )}
            </div>

            {c.noticeIssuedAt && (
              <div className="mb-3 text-xs text-[var(--ink-3)]">
                Notice issued {formatDate(c.noticeIssuedAt)}
                {c.objectionDueAt && <> · objection due <span className="font-medium text-[var(--ink-2)]">{formatDate(c.objectionDueAt)}</span></>}
              </div>
            )}
            {c.recoveredAmount && (
              <div className="mb-3 text-xs text-[var(--ok)]">Recovered {formatMoney(c.recoveredAmount)}</div>
            )}

            {allowed.length === 0 ? (
              <p className="text-xs text-[var(--ink-3)]">This case is closed — no further actions.</p>
            ) : pending ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-[var(--ink)]">{ACTION_LABEL[pending]}?</p>
                {(pending === 'RECOVERED' || pending === 'SETTLED') && (
                  <div>
                    <label className="block text-xs text-[var(--ink-2)] mb-1">Recovered amount (₦)</label>
                    <input
                      type="number"
                      value={recovered}
                      onChange={(e) => setRecovered(e.target.value)}
                      placeholder={String(Math.round(Number(c.estimatedTaxDue)))}
                      className="w-full border border-[var(--line)] rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                )}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional — recorded in the audit trail)"
                  rows={2}
                  className="w-full border border-[var(--line)] rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex gap-2">
                  <Button onClick={submit} loading={busy} className="flex-1">
                    {busy ? 'Saving…' : 'Confirm'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setPending(null); setNotes(''); setRecovered(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {allowed.map((t) => (
                  <button
                    key={t}
                    onClick={() => setPending(t)}
                    className={`w-full py-2 text-sm font-medium rounded-lg border transition-colors ${
                      DANGER_TARGETS.includes(t)
                        ? 'border-[var(--bad)] text-[var(--bad)] hover:bg-[var(--bad-soft)]'
                        : 'border-teal-200 text-teal-700 hover:bg-teal-50'
                    }`}
                  >
                    {ACTION_LABEL[t]}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Details">
            <dl className="text-xs space-y-1.5 text-[var(--ink-2)]">
              <Row k="Risk level" v={`${c.riskLevel}${c.agentScore != null ? ' (incl. AI)' : ''}`} />
              <Row k="Detection confidence" v={`${Math.round(Number(c.confidence) * 100)}%`} />
              <Row k="AI corroboration" v={c.agentScore != null ? `${Math.round(Number(c.agentScore) * 100)}%` : '—'} />
              <Row k="Providers" v={String(c.providerCount)} />
              <Row k="Discrepancy %" v={`${Math.round(Number(c.discrepancyPct) * 100)}%`} />
              {/* Reassignment moved to a first-class control in the Case actions card. */}
              <Row k="Assigned to" v={c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}` : 'Unassigned'} />
              <Row k="Detected" v={formatDateTime(c.createdAt)} />
              {c.notes && <Row k="Notes" v={c.notes} />}
            </dl>
          </Card>
        </div>
      </div>

      {/* Secured in-app document viewer — the confidential report stays inside the
          authenticated session, rendered in a sandboxed same-origin iframe. The
          shared Modal supplies the focus trap, Escape-to-close and focus restore. */}
      <Modal
        open={!!report}
        onClose={() => setReport(null)}
        title={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-[var(--bad)]" />
            {report?.title}
            <span className="rounded bg-[var(--bad-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bad)]">
              Confidential · in secure session
            </span>
          </span>
        }
        size="xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const f = document.getElementById('report-frame') as HTMLIFrameElement | null;
                f?.contentWindow?.focus();
                f?.contentWindow?.print();
              }}
            >
              🖨 Print / Save as PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setReport(null)}>Close</Button>
          </div>
        }
      >
        {report && (
          <iframe
            id="report-frame"
            title={report.title}
            srcDoc={report.html}
            sandbox="allow-same-origin allow-modals"
            className="h-[68vh] w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
          />
        )}
      </Modal>
    </div>
  );
}

function Metric({ label, value, tone = 'default', hint }: { label: string; value: string; tone?: 'default' | 'amber' | 'red'; hint?: string }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-slate-700 text-right">{v}</dd>
    </div>
  );
}

function DocumentPanel({ caseId, docs, onChange }: { caseId: string; docs: CaseDocument[]; onChange: () => void }) {
  const [pastedText, setPastedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await casesApi.addDocument(caseId, { file });
      setMsg(r.reconciliation.note);
      onChange();
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const submitText = async () => {
    if (!pastedText.trim()) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await casesApi.addDocument(caseId, { pastedText });
      setMsg(r.reconciliation.note);
      setPastedText('');
      onChange();
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Upload a taxpayer’s supporting document (text/CSV read directly; for a scan or PDF, paste its OCR text below).
        Document Intelligence extracts the declared figures and reconciles them against the observed inflow.
      </p>

      {/* existing docs */}
      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-start gap-3 text-sm border border-slate-100 rounded-lg px-3 py-2">
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${d.consistent ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                {d.consistent ? 'Consistent' : 'Variance'}
              </span>
              <div className="min-w-0">
                <span className="font-medium text-slate-800">{d.fileName}</span>
                <p className="text-xs text-slate-500">{d.reconcileNote}</p>
                {d.cgtAssessed && Number(d.cgtAssessed) > 0 && (
                  <p className="text-xs mt-1">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium mr-1">CGT §50</span>
                    <span className="text-slate-600">
                      Disposal {formatMoney(d.assetDisposals)} → capital-gains tax {formatMoney(d.cgtAssessed)} assessed.
                    </span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* uploader */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">
          {busy ? 'Processing…' : 'Choose file'}
          <input type="file" hidden accept=".txt,.csv,text/plain,text/csv" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadFile(f); }} />
        </label>
        <span className="text-xs text-slate-400">or paste OCR text →</span>
      </div>
      <textarea value={pastedText} onChange={(e) => setPastedText(e.target.value)}
        placeholder="Paste the document text (e.g. 'Assessable Income: N1,700,000,000')…"
        rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono" />
      <button onClick={submitText} disabled={busy || !pastedText.trim()}
        className="px-4 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50">
        Reconcile pasted text
      </button>

      {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
