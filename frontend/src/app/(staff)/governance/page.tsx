'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { governanceApi, type GovernanceReport, type BankMou, type KeyRotationStatus } from '@/lib/api/governance';
import { formatNaira } from '@/lib/api/cases';
import { extractErrorMessage } from '@/lib/utils';
import { useStaffAuthStore } from '@/store/staffAuthStore';

const YEARS = [2026, 2025, 2024];

export default function GovernancePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState<GovernanceReport | null>(null);
  const [mous, setMous] = useState<BankMou[] | null>(null);

  useEffect(() => {
    setReport(null);
    governanceApi.report(year).then(setReport).catch(() => setReport(null));
    governanceApi.listMou().then(setMous).catch(() => setMous([]));
  }, [year]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="Governance & oversight" subtitle="Steering-committee report pack and bank MoU / onboarding status." />
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg text-sm px-3 py-1.5">
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mt-6 mb-3">Performance report — {year}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Revenue at risk" value={report ? formatNaira(report.revenueAtRisk) : '—'} tone="red" />
        <StatCard label="Recovered" value={report ? formatNaira(report.recovered) : '—'} tone="emerald" />
        <StatCard label="Total cases" value={report?.totalCases?.toLocaleString() ?? '—'} hint={`${report?.agentSignalCount ?? 0} agent signals`} />
        <StatCard label="Providers reporting" value={report ? `${report.providers.withSubmissions}/${report.providers.active}` : '—'} tone="teal" />
      </div>

      {report && Object.keys(report.casesByStatus).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Cases by status</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(report.casesByStatus).map(([s, n]) => (
              <span key={s} className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                {s.replace(/_/g, ' ')} · <span className="font-semibold text-slate-800">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {report && report.topCases.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Top cases by recoverable tax</h3>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">Case</th>
                <th className="py-2 font-medium">Year</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium text-right">Est. tax</th>
              </tr>
            </thead>
            <tbody>
              {report.topCases.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="py-2"><Link href={`/cases/${c.id}`} className="font-mono text-xs text-teal-700 hover:underline">{c.id.slice(0, 8)}</Link></td>
                  <td className="py-2 text-xs text-slate-600">{c.year}</td>
                  <td className="py-2 text-xs text-slate-600">{c.status.replace(/_/g, ' ')}</td>
                  <td className="py-2 text-right font-semibold text-red-700">{formatNaira(c.estimatedTaxDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Bank MoU / onboarding</h2>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {mous === null ? <p className="text-xs text-slate-400 p-6">Loading…</p> : mous.length === 0 ? (
          <p className="text-xs text-slate-400 p-6">No MoUs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="py-2.5 px-4 font-medium">Provider</th><th className="py-2.5 px-4 font-medium">Status</th><th className="py-2.5 px-4 font-medium">Channel</th><th className="py-2.5 px-4 font-medium">Contact</th>
            </tr></thead>
            <tbody>
              {mous.map((m) => (
                <tr key={m.id} className="border-b border-slate-50">
                  <td className="py-2.5 px-4 font-medium text-slate-800">{m.provider?.name ?? m.providerId}</td>
                  <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">{m.status}</span></td>
                  <td className="py-2.5 px-4 text-slate-600">{m.channel ?? '—'}</td>
                  <td className="py-2.5 px-4 text-slate-500 text-xs">{m.contactEmail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mt-8 mb-3">PII key rotation</h2>
      <KeyRotationCard />
    </div>
  );
}

// PII envelope-encryption key status + re-encrypt action (90-day rotation policy).
function KeyRotationCard() {
  const role = useStaffAuthStore((s) => s.user?.role);
  const canReencrypt = ['SUPER_ADMIN', 'ADMIN'].includes(role ?? '');
  const [status, setStatus] = useState<KeyRotationStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    governanceApi.keyStatus().then(setStatus).catch((e) => setErr(extractErrorMessage(e)));
  };
  useEffect(load, []);

  const reencrypt = async () => {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const r = await governanceApi.reencryptPii();
      setMsg(`Re-encrypted ${r.migrated} of ${r.scanned} scanned values under key "${r.activeKeyId}".`);
      load();
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl">
      {err && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
      {msg && <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{msg}</div>}
      {status === null && !err ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : status ? (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${status.rotationDue ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.rotationDue ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {status.rotationDue ? 'Rotation due' : 'Within policy'}
            </span>
            <span className="text-xs text-slate-500">
              Active key <span className="font-mono">{status.activeKeyId}</span> · {status.activeKeyAgeDays} days old · {status.keyCount} key{status.keyCount === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            PII is encrypted with envelope keys rotated on a 90-day policy. After minting a new key, re-encrypt existing
            data so nothing remains under a retired key.
          </p>
          {canReencrypt ? (
            <button onClick={reencrypt} disabled={busy} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {busy ? 'Re-encrypting…' : 'Re-encrypt PII under active key'}
            </button>
          ) : (
            <p className="text-xs text-slate-400">Only an administrator can run re-encryption.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
