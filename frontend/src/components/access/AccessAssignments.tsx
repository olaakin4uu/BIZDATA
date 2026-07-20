'use client';
import { useEffect, useState, useCallback } from 'react';
import { accessAssignmentsApi, type AccessAssignment } from '@/lib/api/access';
import { usersApi, type StaffUserRecord } from '@/lib/api/users';
import { providersApi, type Provider } from '@/lib/api/providers';
import { extractErrorMessage, formatDateTime } from '@/lib/utils';

// Only these roles may hold a raw-record access assignment.
const ASSIGNABLE_ROLES = ['SUPER_ADMIN', 'ADMIN'];

/**
 * Admin console for need-to-know access assignments: grant an officer access to
 * a provider's raw records, list active grants, and revoke. Case-level grants
 * are made from the case page; this manages the provider-level ones + shows all.
 */
export default function AccessAssignments() {
  const [rows, setRows] = useState<AccessAssignment[]>([]);
  const [officers, setOfficers] = useState<StaffUserRecord[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [staffId, setStaffId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [reason, setReason] = useState('');
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    accessAssignmentsApi.list({ includeRevoked }).then(setRows).catch((e) => setError(extractErrorMessage(e)));
  }, [includeRevoked]);

  useEffect(() => {
    // Only SUPER_ADMIN/ADMIN can hold assignments — filter the officer picker.
    usersApi.list({ limit: 200 }).then((r) => setOfficers(r.users.filter((u) => ASSIGNABLE_ROLES.includes(u.role) && u.isActive))).catch(() => setOfficers([]));
    providersApi.list({ limit: 200 }).then((r) => setProviders(r.providers)).catch(() => setProviders([]));
  }, []);
  useEffect(load, [load]);

  const nameOf = (id: string) => {
    const o = officers.find((x) => x.id === id);
    return o ? `${o.firstName} ${o.lastName}` : id.slice(0, 8);
  };
  const providerName = (id: string | null) => providers.find((p) => p.id === id)?.name ?? id ?? '—';

  const grant = async () => {
    if (!staffId || !providerId || !reason.trim()) { setError('Officer, provider and a reason are all required.'); return; }
    setBusy(true); setError(null);
    try {
      await accessAssignmentsApi.grant({ staffId, providerId, reason: reason.trim() });
      setStaffId(''); setProviderId(''); setReason(''); load();
    } catch (e) { setError(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    setError(null);
    try { await accessAssignmentsApi.revoke(id); load(); }
    catch (e) { setError(extractErrorMessage(e)); }
  };

  const active = rows.filter((r) => !r.revokedAt);

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Raw-record access assignments</h2>
      <p className="text-xs text-slate-500 mb-4">
        Only <strong>Super Admin / Admin</strong> officers may view or download raw taxpayer records, and only for the
        providers/cases they are assigned to. Assignments are re-checked on every access — a revoke takes effect immediately.
        Every grant and revoke is audited.
      </p>

      {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Grant form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Officer</label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="">Select officer…</option>
              {officers.map((o) => <option key={o.id} value={o.id}>{o.firstName} {o.lastName} · {o.role}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Provider</label>
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="">Select provider…</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason (required)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. assessing case #1234"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </div>
        <div className="mt-3">
          <button onClick={grant} disabled={busy} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {busy ? 'Granting…' : 'Grant access'}
          </button>
        </div>
      </div>

      {/* Assignments list */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{active.length} active assignment{active.length === 1 ? '' : 's'}</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={includeRevoked} onChange={(e) => setIncludeRevoked(e.target.checked)} /> show revoked
        </label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-2.5 font-medium">Officer</th>
              <th className="px-4 py-2.5 font-medium">Scope</th>
              <th className="px-4 py-2.5 font-medium">Reason</th>
              <th className="px-4 py-2.5 font-medium">Granted</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">No assignments.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="px-4 py-2.5 text-slate-800">{nameOf(r.staffId)}{r.selfAssigned && <span className="ml-1 text-[10px] text-amber-600">(self)</span>}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.providerId ? `Provider · ${providerName(r.providerId)}` : `Case · ${r.caseId?.slice(0, 8)}`}</td>
                <td className="px-4 py-2.5 text-slate-500 max-w-[220px] truncate" title={r.reason}>{r.reason}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{formatDateTime(r.createdAt)}</td>
                <td className="px-4 py-2.5">
                  {r.revokedAt
                    ? <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-500">Revoked</span>
                    : <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">Active</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!r.revokedAt && (
                    <button onClick={() => revoke(r.id)} className="text-xs font-medium text-rose-600 hover:text-rose-800">Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
