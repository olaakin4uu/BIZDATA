'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { casesApi, caseDisplayName, type UnderdeclarationCase, type CaseStatus, type CaseDocument } from '@/lib/api/cases';
import { dataRecordsApi, type DataRecord } from '@/lib/api/data-records';
import { agentsApi, AGENT_NAMES, type RiskSignal } from '@/lib/api/agents';
import { formatMoney, formatDate, formatDateTime, extractErrorMessage } from '@/lib/utils';

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

const STATUS_BADGE: Record<CaseStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800',
  UNDER_REVIEW: 'bg-blue-100 text-blue-800',
  NOTICE_ISSUED: 'bg-indigo-100 text-indigo-800',
  OBJECTION: 'bg-purple-100 text-purple-800',
  CONFIRMED: 'bg-teal-100 text-teal-800',
  SETTLED: 'bg-emerald-100 text-emerald-800',
  RECOVERED: 'bg-emerald-200 text-emerald-900',
  DISMISSED: 'bg-slate-200 text-slate-600',
  CLOSED: 'bg-slate-200 text-slate-600',
};

const DANGER_TARGETS: CaseStatus[] = ['DISMISSED'];

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

  const load = () => {
    casesApi.get(id)
      .then((data) => {
        setC(data);
        agentsApi.signals({ taxpayerId: data.taxpayerId, year: data.year }).then(setSignals).catch(() => setSignals([]));
        casesApi.listDocuments(id).then(setDocs).catch(() => setDocs([]));
        return dataRecordsApi.list({ taxpayerId: data.taxpayerId, periodYear: data.year, limit: 100 });
      })
      .then((r) => setRecords(r?.records ?? []))
      .catch((e) => setError(extractErrorMessage(e)));
  };
  useEffect(load, [id]);

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
            onClick={async () => {
              const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';
              const token = typeof window !== 'undefined' ? localStorage.getItem('bizdata_staff_token') : null;
              const res = await fetch(`${base}/cases/${id}/evidence`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
              const html = await res.text();
              const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
              window.open(url, '_blank');
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Evidence bundle
          </button>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[c.status]}`}>
            {c.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Money summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Metric label="Observed income" value={formatMoney(c.observedIncome)} />
        <Metric label="Declared income" value={formatMoney(c.declaredIncome)} />
        <Metric label="Discrepancy" value={formatMoney(c.discrepancyAmount)} tone="amber" />
        <Metric label="Estimated tax due" value={formatMoney(c.estimatedTaxDue)} tone="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: explainability + records */}
        <div className="lg:col-span-2 space-y-6">
          {/* Why flagged */}
          <Card title={`Why this was flagged — confidence ${Math.round(Number(c.confidence) * 100)}%`}>
            {reasons.length === 0 ? (
              <p className="text-xs text-slate-400">No reason codes recorded.</p>
            ) : (
              <ul className="space-y-2">
                {reasons.map((r) => (
                  <li key={r.code} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{r.label}</span>
                      <span className="ml-2 text-xs text-slate-400">{r.code}</span>
                    </div>
                    <span className={`text-xs font-medium ${r.weight >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                      {r.weight >= 0 ? '+' : ''}{Math.round(r.weight * 100)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
              Detection engine {c.scan?.engineVersion ?? c.engineVersion ?? '—'} · {c.providerCount} corroborating provider{c.providerCount === 1 ? '' : 's'} · threshold {c.scan ? `${(Number(c.scan.threshold) * 100).toFixed(0)}%` : '—'}
            </p>
          </Card>

          {/* Taxpayer 360 — observed flows by provider */}
          <Card title={`Observed flows · ${c.year} (${records.length} record${records.length === 1 ? '' : 's'})`}>
            {records.length === 0 ? (
              <p className="text-xs text-slate-400">No linked records.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="py-2 font-medium">Provider</th>
                      <th className="py-2 font-medium text-right">Inflow</th>
                      <th className="py-2 font-medium text-right">Outflow</th>
                      <th className="py-2 font-medium text-center">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50">
                        <td className="py-2 text-slate-700">{r.provider?.name ?? r.providerType}</td>
                        <td className="py-2 text-right text-slate-600">{formatMoney(r.totalInflow)}</td>
                        <td className="py-2 text-right text-slate-500">{formatMoney(r.totalOutflow)}</td>
                        <td className="py-2 text-center text-xs text-slate-400">
                          {(r as unknown as { matchMethod?: string }).matchMethod ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            {c.noticeIssuedAt && (
              <div className="mb-3 text-xs text-slate-500">
                Notice issued {formatDate(c.noticeIssuedAt)}
                {c.objectionDueAt && <> · objection due <span className="font-medium text-slate-700">{formatDate(c.objectionDueAt)}</span></>}
              </div>
            )}
            {c.recoveredAmount && (
              <div className="mb-3 text-xs text-emerald-700">Recovered {formatMoney(c.recoveredAmount)}</div>
            )}

            {allowed.length === 0 ? (
              <p className="text-xs text-slate-400">This case is closed — no further actions.</p>
            ) : pending ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-800">{ACTION_LABEL[pending]}?</p>
                {(pending === 'RECOVERED' || pending === 'SETTLED') && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Recovered amount (₦)</label>
                    <input
                      type="number"
                      value={recovered}
                      onChange={(e) => setRecovered(e.target.value)}
                      placeholder={String(Math.round(Number(c.estimatedTaxDue)))}
                      className="w-full border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                )}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional — recorded in the audit trail)"
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex gap-2">
                  <button onClick={submit} disabled={busy} className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                    {busy ? 'Saving…' : 'Confirm'}
                  </button>
                  <button onClick={() => { setPending(null); setNotes(''); setRecovered(''); }} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                    Cancel
                  </button>
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
                        ? 'border-red-200 text-red-700 hover:bg-red-50'
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
            <dl className="text-xs space-y-1.5 text-slate-600">
              <Row k="Risk level" v={`${c.riskLevel}${c.agentScore != null ? ' (incl. AI)' : ''}`} />
              <Row k="Detection confidence" v={`${Math.round(Number(c.confidence) * 100)}%`} />
              <Row k="AI corroboration" v={c.agentScore != null ? `${Math.round(Number(c.agentScore) * 100)}%` : '—'} />
              <Row k="Providers" v={String(c.providerCount)} />
              <Row k="Discrepancy %" v={`${Math.round(Number(c.discrepancyPct) * 100)}%`} />
              <Row k="Assigned to" v={c.assignedTo ? `${c.assignedTo.firstName} ${c.assignedTo.lastName}` : 'Unassigned'} />
              <Row k="Detected" v={formatDateTime(c.createdAt)} />
              {c.notes && <Row k="Notes" v={c.notes} />}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'amber' | 'red' }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
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
