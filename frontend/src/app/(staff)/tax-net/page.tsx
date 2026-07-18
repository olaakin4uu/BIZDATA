'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { taxNetApi, type TaxNetReport, type TaxNetRow, type NetStatus } from '@/lib/api/taxNet';
import { identityApi, type IdentityStatus } from '@/lib/api/identity';
import { formatMoneyShort, extractErrorMessage } from '@/lib/utils';

const NET_META: Record<NetStatus, { label: string; chip: string; dot: string; desc: string }> = {
  CAPTURED:   { label: 'Captured',   chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', desc: 'Has the truth-of-record ID (RC / TIN)' },
  UNVERIFIED: { label: 'Unverified', chip: 'bg-amber-50 text-amber-700 ring-amber-200',       dot: 'bg-amber-500',   desc: 'Registered but anchoring ID missing' },
  INVISIBLE:  { label: 'Invisible',  chip: 'bg-rose-50 text-rose-700 ring-rose-200',           dot: 'bg-rose-500',    desc: 'Observed inflow, no registration' },
};

export default function TaxNetPage() {
  const [report, setReport] = useState<TaxNetReport | null>(null);
  const [statusFilter, setStatusFilter] = useState<NetStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [payeGapOnly, setPayeGapOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [idStatus, setIdStatus] = useState<IdentityStatus | null>(null);
  const [idOpen, setIdOpen] = useState(false);
  const limit = 25;

  const load = () => {
    taxNetApi.report({ status: statusFilter || undefined, type: typeFilter || undefined, payeGap: payeGapOnly || undefined, page, limit })
      .then(setReport).catch(() => setReport(null));
  };
  useEffect(load, [statusFilter, typeFilter, payeGapOnly, page]);
  useEffect(() => { identityApi.status().then(setIdStatus).catch(() => setIdStatus(null)); }, []);

  const s = report?.summary;

  const registerOne = async (row: TaxNetRow) => {
    setBusyId(row.id); setMsg(null);
    try {
      const r = await taxNetApi.register(row.id);
      setMsg(`${row.name} registered — TIN ${r.tin}`);
      load();
    } catch (e) { setMsg(extractErrorMessage(e)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 px-7 py-6 mb-8 shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-emerald-500/10" />
        <div className="relative">
          <p className="text-xs uppercase tracking-widest text-emerald-300 mb-1">Tax-Net Comparative</p>
          <h1 className="text-2xl font-bold text-white">Who is in the tax net — and who isn’t</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
            Every observed party classified against its truth-of-record identifier (RC for companies, TIN for people),
            ranked by observed inflow. Register the invisible and unverified into the net — one at a time, or in bulk.
          </p>
        </div>
      </div>

      {/* Identity resolution strip (Phase 4 — NIBSS BVN→NIN bridge) */}
      {idStatus && idStatus.resolvable > 0 && (
        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 flex flex-wrap items-center gap-4">
          <div className="text-2xl">🪪</div>
          <div className="flex-1 min-w-[240px]">
            <p className="text-sm font-semibold text-slate-800">
              Resolve identities — {idStatus.resolvable.toLocaleString()} taxpayers have a BVN but no NIN
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Bridge each BVN to its linked NIN via {idStatus.isMock ? 'the identity service' : idStatus.provider} to bring
              them a step closer to the net. {idStatus.verified > 0 && <span className="text-emerald-700 font-medium">{idStatus.verified.toLocaleString()} already verified.</span>}
              {idStatus.isMock && <span className="ml-1 text-amber-700">Running in demo mode — NINs are synthetic until NIBSS is connected.</span>}
            </p>
          </div>
          <button onClick={() => setIdOpen(true)}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg whitespace-nowrap">
            🪪 Resolve identities…
          </button>
        </div>
      )}

      {/* Segment KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SegmentCard title="Captured" tone="emerald" count={s?.captured.count} inflow={s?.captured.observedInflow}
          extra={s ? `${s.coveragePct}% coverage` : ''} onClick={() => { setStatusFilter('CAPTURED'); setPage(1); }} active={statusFilter === 'CAPTURED'} />
        <SegmentCard title="Unverified" tone="amber" count={s?.unverified.count} inflow={s?.unverified.observedInflow}
          extra="registerable" onClick={() => { setStatusFilter('UNVERIFIED'); setPage(1); }} active={statusFilter === 'UNVERIFIED'} />
        <SegmentCard title="Invisible" tone="rose" count={s?.invisible.count} inflow={s?.invisible.observedInflow}
          extra="enforcement priority" onClick={() => { setStatusFilter('INVISIBLE'); setPage(1); }} active={statusFilter === 'INVISIBLE'} />
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Registered into net</p>
            <p className="text-3xl font-bold text-slate-800 mt-1 tabular-nums">{s ? s.captured.count : '—'}</p>
            <p className="text-xs text-slate-400 mt-1">of {s?.totalTaxpayers ?? '—'} observed</p>
          </div>
          <button onClick={() => setAutoOpen(true)}
            className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg">
            ⤵ Auto-register…
          </button>
        </div>
      </div>

      {msg && <div className="mb-4 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2">{msg}</div>}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1 text-xs">
          {(['', 'CAPTURED', 'UNVERIFIED', 'INVISIBLE'] as const).map((st) => (
            <button key={st || 'all'} onClick={() => { setStatusFilter(st); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg font-medium ${statusFilter === st ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {st ? NET_META[st].label : 'All'}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setPayeGapOnly((v) => !v); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${payeGapOnly ? 'bg-rose-600 text-white border-rose-600' : 'bg-white border-rose-200 text-rose-700 hover:bg-rose-50'}`}
          title="Corporates observed earning that are NOT confirmed PAYE-registered by the Tax app">
          ⚠ PAYE gap{s ? ` (${s.payeGap.count})` : ''}
        </button>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white ml-auto">
          <option value="">All types</option>
          <option value="INDIVIDUAL">Individual</option>
          <option value="CORPORATE">Corporate</option>
        </select>
      </div>

      {/* Ranked table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 font-medium">Party</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Source provider</th>
                <th className="px-4 py-3 font-medium">Identity</th>
                <th className="px-4 py-3 font-medium text-right">Observed inflow</th>
                <th className="px-4 py-3 font-medium">Tax-net status</th>
                <th className="px-4 py-3 font-medium">PAYE</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {report === null ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : report.rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">No taxpayers match.</td></tr>
              ) : report.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/taxpayers/${r.id}`} className="font-medium text-slate-800 hover:text-emerald-700">{r.name}</Link>
                    {r.sector && <span className="ml-2 text-[10px] text-slate-400">{r.sector}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.type}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.sourceProvider ? (
                      <>
                        {r.sourceProvider}
                        {r.providerCount > 1 && <span className="ml-1 text-slate-400">+{r.providerCount - 1}</span>}
                      </>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <IdPip on={r.hasTin} label="TIN" />
                      <IdPip on={!!r.rcNumber} label="RC" />
                      <IdPip on={r.hasBvn} label="BVN" />
                      <IdPip on={r.hasNin} label="NIN" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-700">{r.observedInflow > 0 ? formatMoneyShort(r.observedInflow) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${NET_META[r.netStatus].chip}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${NET_META[r.netStatus].dot}`} />{NET_META[r.netStatus].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.type !== 'CORPORATE' ? (
                      <span className="text-[10px] text-slate-300">n/a</span>
                    ) : r.payeStatus === 'REGISTERED' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200" title={r.payeRegNumber ?? undefined}>Registered</span>
                    ) : r.payeGap ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 bg-rose-50 text-rose-700 ring-rose-200" title="Earning but not confirmed PAYE-registered">⚠ Gap</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ring-1 bg-slate-50 text-slate-500 ring-slate-200">Unknown</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.netStatus === 'CAPTURED' ? (
                      <span className="text-xs text-slate-300">✓ in net</span>
                    ) : (
                      <button onClick={() => registerOne(r)} disabled={busyId === r.id}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        {busyId === r.id ? 'Registering…' : '+ Register'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report && report.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, report.total)} of {report.total.toLocaleString()}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border border-slate-200 rounded disabled:opacity-40">Prev</button>
              <button disabled={page * limit >= report.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border border-slate-200 rounded disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-3">
        Ranked by observed inflow — biggest first. Registration assigns a provisional TIN and moves the party to Captured;
        the action is audited. Provisional TINs should be confirmed against the FIRS registry.
      </p>

      {autoOpen && <AutoRegisterModal onClose={() => setAutoOpen(false)} onDone={(n) => { setMsg(`Auto-registered ${n} taxpayers into the net.`); setAutoOpen(false); load(); }} invisibleCount={s?.invisible.count ?? 0} />}
      {idOpen && idStatus && <ResolveIdentityModal onClose={() => setIdOpen(false)} status={idStatus}
        onDone={(r) => { setMsg(`Resolved ${r} identities via the BVN→NIN bridge.`); setIdOpen(false); identityApi.status().then(setIdStatus); load(); }} />}
    </div>
  );
}

function SegmentCard({ title, tone, count, inflow, extra, onClick, active }: {
  title: string; tone: 'emerald' | 'amber' | 'rose'; count?: number; inflow?: number; extra: string; onClick: () => void; active: boolean;
}) {
  const border: Record<string, string> = { emerald: 'border-l-emerald-500', amber: 'border-l-amber-400', rose: 'border-l-rose-500' };
  const text: Record<string, string> = { emerald: 'text-emerald-700', amber: 'text-amber-600', rose: 'text-rose-700' };
  return (
    <button onClick={onClick}
      className={`text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 border-l-4 ${border[tone]} hover:shadow-md transition-shadow ${active ? 'ring-2 ring-slate-800' : ''}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${text[tone]}`}>{count?.toLocaleString() ?? '—'}</p>
      <p className="text-xs text-slate-400 mt-1">{inflow != null && inflow > 0 ? `${formatMoneyShort(inflow)} observed · ` : ''}{extra}</p>
    </button>
  );
}

function IdPip({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${on ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-300'}`}>{label}</span>
  );
}

function AutoRegisterModal({ onClose, onDone, invisibleCount }: { onClose: () => void; onDone: (n: number) => void; invisibleCount: number }) {
  const [minInflow, setMinInflow] = useState('');
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await taxNetApi.autoRegister({
        minInflow: minInflow ? Number(minInflow) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      onDone(r.registered);
    } catch (e) { setError(extractErrorMessage(e)); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Auto-register into the tax net</h2>
          <p className="text-xs text-slate-500">Assigns a provisional TIN to registerable individuals (no TIN on file).</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
            {invisibleCount.toLocaleString()} taxpayers are currently invisible. Use the filters below to scope the batch.
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Minimum observed inflow (₦, optional)</label>
            <input value={minInflow} onChange={(e) => setMinInflow(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"
              placeholder="e.g. 1000000 — only those receiving over ₦1m"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Max to register this run (optional)</label>
            <input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"
              placeholder="leave blank for all matching"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={run} disabled={busy} className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50">
            {busy ? 'Registering…' : 'Register batch'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResolveIdentityModal({ onClose, onDone, status }: { onClose: () => void; onDone: (resolved: number) => void; status: IdentityStatus }) {
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ resolved: number; notFound: number; candidates: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const r = await identityApi.resolveBulk({ limit: limit ? Number(limit) : undefined });
      setResult({ resolved: r.resolved, notFound: r.notFound, candidates: r.candidates });
    } catch (e) { setError(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Resolve identities · BVN → NIN</h2>
          <p className="text-xs text-slate-500">
            Bridges each stored BVN to its linked NIN via {status.provider}. {status.resolvable.toLocaleString()} resolvable.
          </p>
        </div>
        <div className="p-6 space-y-4">
          {status.isMock && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Demo mode: resolved NINs are synthetic. Connect NIBSS (set IDENTITY_PROVIDER=nibss) for authoritative resolution.
            </div>
          )}
          {result ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              Resolved <strong>{result.resolved}</strong> of {result.candidates}.
              {result.notFound > 0 && <span className="text-slate-600"> {result.notFound} had no linked NIN.</span>}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max to resolve this run (optional)</label>
              <input value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"
                placeholder="leave blank for all resolvable"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={result ? () => onDone(result.resolved) : onClose}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button onClick={run} disabled={busy}
              className="px-4 py-2 text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg disabled:opacity-50">
              {busy ? 'Resolving…' : 'Resolve now'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
