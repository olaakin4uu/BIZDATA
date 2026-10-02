'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { crossStateApi, type ReferralCandidate, type Referral } from '@/lib/api/crossState';
import { formatNaira } from '@/lib/api/cases';
import { formatDate, extractErrorMessage } from '@/lib/utils';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import PageContainer from '@/components/PageContainer';
import { loadBranding } from '@/lib/branding';

const YEARS = [2026, 2025, 2024];
// Endpoints /cross-state/generate and /{id}/send are role-gated on the backend.
const REFERRAL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];
const STATUS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700', SENT: 'bg-blue-100 text-blue-800',
  ACKNOWLEDGED: 'bg-teal-100 text-teal-800', RECEIVED: 'bg-indigo-100 text-indigo-800', CLOSED: 'bg-slate-200 text-slate-600',
};

export default function CrossStatePage() {
  const role = useStaffAuthStore((s) => s.user?.role);
  const canRefer = REFERRAL_ROLES.includes(role ?? '');
  const [year, setYear] = useState(new Date().getFullYear());
  const [candidates, setCandidates] = useState<ReferralCandidate[] | null>(null);
  const [refs, setRefs] = useState<Referral[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendingMany, setSendingMany] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The authority's own territory, so this screen never names someone else's.
  const [territory, setTerritory] = useState<string>('');

  useEffect(() => {
    loadBranding()
      .then((b) => setTerritory(b?.homeTerritoryLabel || ''))
      .catch(() => setTerritory(''));
  }, []);
  const resident = territory ? `${territory}-resident` : 'resident';

  const load = () => {
    setErr(null);
    crossStateApi.candidates(year).then(setCandidates).catch((e) => { setCandidates([]); setErr(extractErrorMessage(e)); });
    crossStateApi.list().then(setRefs).catch((e) => { setRefs([]); setErr(extractErrorMessage(e)); });
    setSelected(new Set());
  };
  useEffect(load, [year]);

  const generate = async () => {
    setBusy(true); setMsg(null);
    try { const r = await crossStateApi.generate(year); setMsg(`${r.created} referral(s) drafted`); load(); }
    catch (e) { setMsg(extractErrorMessage(e)); } finally { setBusy(false); }
  };
  const send = async (id: string) => {
    setSendingId(id); setMsg(null);
    // Previously fire-and-forget: a failed/unauthorised send gave no feedback.
    try { await crossStateApi.send(id); setMsg('Referral sent.'); load(); }
    catch (e) { setMsg(extractErrorMessage(e)); }
    finally { setSendingId(null); }
  };

  // Only outbound drafts can be sent; selection is limited to those.
  const sendable = (refs ?? []).filter((r) => r.direction === 'OUTBOUND' && r.status === 'DRAFT');
  const allSelected = sendable.length > 0 && sendable.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(sendable.map((r) => r.id)));
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const sendSelected = async () => {
    setSendingMany(true); setMsg(null);
    try { const r = await crossStateApi.sendMany(Array.from(selected)); setMsg(`${r.sent} referral(s) sent.`); load(); }
    catch (e) { setMsg(extractErrorMessage(e)); }
    finally { setSendingMany(false); }
  };

  return (
    <PageContainer>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="Cross-state referrals" subtitle={`JRB Act 2025 §15 — refer taxpayers resident outside ${territory || 'this territory'} to their home State IRS (minimised data: TIN + amounts only).`} />
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg text-sm px-3 py-1.5">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {canRefer && (
            <button onClick={generate} disabled={busy || !(candidates?.length)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">
              {busy ? 'Drafting…' : `Draft referrals (${candidates?.length ?? 0})`}
            </button>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-teal-700 mt-2">{msg}</p>}
      {err && (
        <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>Couldn’t load referral data: {err}</span>
          <button onClick={load} className="text-xs text-teal-700 hover:underline font-medium">Retry</button>
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mt-6 mb-3">{`Candidates — non-${resident} parties with flagged cases`}</h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        {candidates === null ? <p className="text-xs text-slate-400 p-4">Loading…</p> : candidates.length === 0 ? (
          <p className="text-xs text-slate-400 p-4">No outstanding candidates for {year} (all referred, or resident here).</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="py-2.5 px-4 font-medium">Taxpayer</th><th className="py-2.5 px-4 font-medium">State</th><th className="py-2.5 px-4 font-medium">Refer to</th><th className="py-2.5 px-4 font-medium text-right">Est. tax</th>
            </tr></thead>
            <tbody>{candidates.map((c) => (
              <tr key={c.caseId} className="border-b border-slate-50">
                <td className="py-2.5 px-4 font-medium text-slate-800">{c.name}</td>
                <td className="py-2.5 px-4 text-slate-600">{c.state}</td>
                <td className="py-2.5 px-4 text-slate-600">{c.toAuthority}</td>
                <td className="py-2.5 px-4 text-right font-semibold text-red-700">{formatNaira(c.estimatedTaxDue)}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Referrals</h2>
        {canRefer && sendable.length > 0 && (
          <button onClick={sendSelected} disabled={sendingMany || selected.size === 0} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">
            {sendingMany ? 'Sending…' : `Send selected (${selected.size})`}
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {refs === null ? <p className="text-xs text-slate-400 p-4">Loading…</p> : refs.length === 0 ? (
          <p className="text-xs text-slate-400 p-4">No referrals yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
              {canRefer && (
                <th className="py-2.5 pl-4 w-8">
                  <input type="checkbox" aria-label="Select all drafts" checked={allSelected} disabled={sendable.length === 0} onChange={toggleAll} className="accent-teal-600" />
                </th>
              )}
              <th className="py-2.5 px-4 font-medium">Direction</th><th className="py-2.5 px-4 font-medium">From → To</th><th className="py-2.5 px-4 font-medium">State</th><th className="py-2.5 px-4 font-medium">Status</th><th className="py-2.5 px-4 font-medium">When</th><th className="py-2.5 px-4"></th>
            </tr></thead>
            <tbody>{refs.map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                {canRefer && (
                  <td className="py-2.5 pl-4 w-8">
                    {r.direction === 'OUTBOUND' && r.status === 'DRAFT' && (
                      <input type="checkbox" aria-label="Select referral" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-teal-600" />
                    )}
                  </td>
                )}
                <td className="py-2.5 px-4"><span className={`text-xs font-medium ${r.direction === 'OUTBOUND' ? 'text-teal-700' : 'text-indigo-700'}`}>{r.direction}</span></td>
                <td className="py-2.5 px-4 text-slate-600 text-xs">{r.fromAuthority} → {r.toAuthority}</td>
                <td className="py-2.5 px-4 text-slate-600">{r.state}</td>
                <td className="py-2.5 px-4"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS[r.status]}`}>{r.status}</span></td>
                <td className="py-2.5 px-4 text-xs text-slate-400">{formatDate(r.createdAt)}</td>
                <td className="py-2.5 px-4 text-right">{canRefer && r.direction === 'OUTBOUND' && r.status === 'DRAFT' && (
                  <button onClick={() => send(r.id)} disabled={sendingId === r.id} className="text-xs text-teal-700 hover:underline font-medium disabled:opacity-50">
                    {sendingId === r.id ? 'Sending…' : 'Send →'}
                  </button>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
