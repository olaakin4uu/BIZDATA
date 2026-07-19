'use client';
import { useEffect, useMemo, useState } from 'react';
import { portfoliosApi, type Portfolio, type Workload, type PortfolioScope } from '@/lib/api/portfolios';
import { usersApi } from '@/lib/api/users';
import { providersApi } from '@/lib/api/providers';
import { PROVIDER_TYPES, formatMoneyShort, extractErrorMessage } from '@/lib/utils';

const SECTORS = ['PROFESSIONAL_SERVICES', 'TRADING', 'REAL_ESTATE', 'HOSPITALITY', 'CONSTRUCTION', 'TECH', 'OTHER'];

const SCOPE_META: Record<PortfolioScope, { label: string; chip: string }> = {
  PROVIDER:      { label: 'Provider',      chip: 'bg-sky-50 text-sky-700 ring-sky-200' },
  PROVIDER_TYPE: { label: 'Provider type', chip: 'bg-violet-50 text-violet-700 ring-violet-200' },
  SECTOR:        { label: 'Sector',        chip: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

export default function PortfoliosPage() {
  const [workload, setWorkload] = useState<Workload[] | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[] | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = () => {
    setLoadErr(null);
    portfoliosApi.workload().then(setWorkload).catch((e) => { setWorkload([]); setLoadErr(extractErrorMessage(e)); });
    portfoliosApi.list().then(setPortfolios).catch((e) => { setPortfolios([]); setLoadErr(extractErrorMessage(e)); });
  };
  useEffect(load, []);

  const remove = async (p: Portfolio) => {
    setMsg(null);
    try { await portfoliosApi.remove(p.id); setMsg(`Removed ${p.label} from ${p.staff.firstName}.`); load(); }
    catch (e) { setMsg(extractErrorMessage(e)); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-purple-900 px-7 py-6 mb-8 shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-purple-500/10" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-purple-300 mb-1">Analyst Portfolios</p>
            <h1 className="text-2xl font-bold text-white">Who owns what — and their workload</h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Give an analyst a book of work — a specific provider, a provider type, or a sector. New flagged cases
              route to the owner automatically (provider beats type beats sector) and the analyst is notified.
            </p>
          </div>
          <button onClick={() => setShowAssign(true)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-lg backdrop-blur self-center">
            + Assign portfolio
          </button>
        </div>
      </div>

      {msg && <div className="mb-4 text-sm bg-purple-50 border border-purple-200 text-purple-800 rounded-lg px-4 py-2">{msg}</div>}
      {loadErr && (
        <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 flex items-center justify-between">
          <span>Couldn’t load assignments: {loadErr}</span>
          <button onClick={load} className="text-xs text-teal-700 hover:underline font-medium">Retry</button>
        </div>
      )}

      {/* Workload */}
      <SectionTitle>Analyst workload</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {workload === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : workload.length === 0 ? (
          <p className="text-sm text-slate-400 col-span-full">No analysts carry work or a portfolio yet. Assign one below.</p>
        ) : workload.map((w) => (
          <div key={w.staff.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 truncate">{w.staff.firstName} {w.staff.lastName}</p>
                <p className="text-xs text-slate-400 truncate">{w.staff.email}</p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{w.staff.role.replace('_', ' ')}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat n={w.openCases} l="open" color="text-slate-800" />
              <Stat n={formatMoneyShort(w.revenueAtRisk)} l="at risk" color="text-rose-700" />
              <Stat n={formatMoneyShort(w.recovered)} l="recovered" color="text-emerald-700" />
              <Stat n={w.portfolios} l="portfolios" color="text-purple-700" />
            </div>
          </div>
        ))}
      </div>

      {/* Portfolio assignments */}
      <SectionTitle>Portfolio assignments</SectionTitle>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Owns</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {portfolios === null ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : portfolios.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No portfolios assigned yet.</td></tr>
              ) : portfolios.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800">{p.staff.firstName} {p.staff.lastName}</span>
                    <span className="ml-2 text-xs text-slate-400">{p.staff.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${SCOPE_META[p.scope].chip}`}>{SCOPE_META[p.scope].label}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{p.label.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(p)} className="text-xs font-medium text-rose-600 hover:text-rose-800">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Routing precedence: a case matching an owner’s <strong>specific provider</strong> wins over one matching a
        <strong> provider type</strong>, which wins over a <strong>sector</strong>. Manually-assigned cases are never overridden.
      </p>

      {showAssign && <AssignModal onClose={() => setShowAssign(false)} onDone={(m) => { setMsg(m); setShowAssign(false); load(); }} />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">{children}</h2>;
}
function Stat({ n, l, color }: { n: string | number; l: string; color: string }) {
  return (
    <div>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{n}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{l}</p>
    </div>
  );
}

function AssignModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [staff, setStaff] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [staffId, setStaffId] = useState('');
  const [scope, setScope] = useState<PortfolioScope>('PROVIDER');
  const [targetValue, setTargetValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    usersApi.list({ limit: 200 }).then((r) => setStaff(r.users)).catch(() => setStaff([]));
    providersApi.list({ limit: 200 }).then((r) => setProviders(r.providers.map((p) => ({ id: p.id, name: p.name })))).catch(() => setProviders([]));
  }, []);

  // Reset target when scope changes.
  useEffect(() => { setTargetValue(''); }, [scope]);

  const targetOptions = useMemo(() => {
    if (scope === 'PROVIDER') return providers.map((p) => ({ value: p.id, label: p.name }));
    if (scope === 'PROVIDER_TYPE') return PROVIDER_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }));
    return SECTORS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }));
  }, [scope, providers]);

  const submit = async () => {
    if (!staffId || !targetValue) { setError('Choose an analyst and a target.'); return; }
    setBusy(true); setError(null);
    try {
      await portfoliosApi.create(staffId, scope, targetValue);
      const who = staff.find((s) => s.id === staffId);
      const what = targetOptions.find((o) => o.value === targetValue)?.label;
      onDone(`Assigned ${what} to ${who?.firstName ?? 'analyst'}.`);
    } catch (e) { setError(extractErrorMessage(e)); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Assign a portfolio</h2>
          <p className="text-xs text-slate-500">New cases in this book of work will route to the analyst automatically.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Analyst</label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="">Choose a staff member…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.email}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Scope</label>
            <div className="flex gap-2">
              {(['PROVIDER', 'PROVIDER_TYPE', 'SECTOR'] as PortfolioScope[]).map((sc) => (
                <button key={sc} onClick={() => setScope(sc)}
                  className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border ${scope === sc ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {SCOPE_META[sc].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {scope === 'PROVIDER' ? 'Which provider' : scope === 'PROVIDER_TYPE' ? 'Which provider type' : 'Which sector'}
            </label>
            <select value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="">Choose…</option>
              {targetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50">
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
