'use client';
import { useEffect, useState, useCallback } from 'react';
import { grantTokenApi, type AccessGrantToken } from '@/lib/api/access';
import { usersApi, type StaffUserRecord } from '@/lib/api/users';
import { providersApi, type Provider } from '@/lib/api/providers';
import { extractErrorMessage, formatDateTime } from '@/lib/utils';

/**
 * SUPER_ADMIN approvals queue for four-eyes raw-record access. Shows pending
 * requests; approving mints a one-time token displayed here to relay to the
 * officer (and emailed to them). You cannot approve your own request.
 */
export default function GrantApprovals() {
  const [pending, setPending] = useState<AccessGrantToken[]>([]);
  const [officers, setOfficers] = useState<StaffUserRecord[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [issued, setIssued] = useState<{ id: string; token: string; officer: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    grantTokenApi.pending().then(setPending).catch((e) => setError(extractErrorMessage(e)));
  }, []);
  useEffect(() => {
    usersApi.list({ limit: 200 }).then((r) => setOfficers(r.users)).catch(() => setOfficers([]));
    providersApi.list({ limit: 200 }).then((r) => setProviders(r.providers)).catch(() => setProviders([]));
  }, []);
  useEffect(load, [load]);

  const nameOf = (id: string) => {
    const o = officers.find((x) => x.id === id);
    return o ? `${o.firstName} ${o.lastName}` : id.slice(0, 8);
  };
  const scopeOf = (t: AccessGrantToken) =>
    t.providerId ? `Provider · ${providers.find((p) => p.id === t.providerId)?.name ?? t.providerId.slice(0, 8)}` : `Case · ${t.caseId?.slice(0, 8)}`;

  const approve = async (t: AccessGrantToken) => {
    setBusy(t.id); setError(null);
    try {
      const r = await grantTokenApi.approve(t.id);
      setIssued({ id: r.id, token: r.token, officer: nameOf(t.staffId) });
      load();
    } catch (e) { setError(extractErrorMessage(e)); }
    finally { setBusy(null); }
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Raw-record access approvals (four-eyes)</h2>
      <p className="text-xs text-slate-500 mb-4">
        Officers assigned to a provider/case must still get a <strong>Super Admin</strong> to approve each access. Approving
        issues a one-time token (shown here to relay + emailed to the officer); they redeem it with their password to unlock.
        You cannot approve your own request.
      </p>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {issued && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-800 mb-1">Access token issued for {issued.officer}</p>
          <p className="text-xs text-emerald-700 mb-2">Relay this token to the officer (also emailed to them). It is shown once.</p>
          <div className="flex items-center gap-3">
            <code className="font-mono text-lg tracking-[0.3em] bg-white border border-emerald-200 rounded-lg px-4 py-2 text-slate-800">{issued.token}</code>
            <button onClick={() => { navigator.clipboard.writeText(issued.token); }} className="text-xs font-medium text-emerald-700 hover:underline">Copy</button>
            <button onClick={() => setIssued(null)} className="text-xs text-slate-400 hover:text-slate-600">Dismiss</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-2.5 font-medium">Officer</th>
              <th className="px-4 py-2.5 font-medium">Scope</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5 font-medium">Requested</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">No pending requests.</td></tr>
            ) : pending.map((t) => (
              <tr key={t.id} className="border-b border-slate-50">
                <td className="px-4 py-2.5 text-slate-800">{nameOf(t.staffId)}</td>
                <td className="px-4 py-2.5 text-slate-600">{scopeOf(t)}</td>
                <td className="px-4 py-2.5 text-slate-500 max-w-[220px] truncate" title={t.reason}>{t.reason}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDateTime(t.requestedAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => approve(t)} disabled={busy === t.id}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50">
                    {busy === t.id ? 'Approving…' : 'Approve & issue token'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
