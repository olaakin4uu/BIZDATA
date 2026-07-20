'use client';
import { useEffect, useState, useCallback } from 'react';
import PageHeader from '@/components/PageHeader';
import { accessApi, type AccessElevation } from '@/lib/api/access';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { extractErrorMessage, formatDateTime } from '@/lib/utils';
import AccessAssignments from '@/components/access/AccessAssignments';

const APPROVER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];
const ASSIGNMENT_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export default function AccessPage() {
  const user = useStaffAuthStore((s) => s.user);
  const isApprover = APPROVER_ROLES.includes(user?.role ?? '');
  const isAssignmentAdmin = ASSIGNMENT_ADMIN_ROLES.includes(user?.role ?? '');

  const [mine, setMine] = useState<{ grant: AccessElevation | null; active: boolean } | null>(null);
  const [pending, setPending] = useState<AccessElevation[] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    accessApi.mine().then(setMine).catch(() => setMine(null));
    if (isApprover) accessApi.pending().then(setPending).catch(() => setPending([]));
  }, [isApprover]);

  useEffect(load, [load]);

  const submit = async () => {
    setBusy(true); setError(null);
    try { await accessApi.request(reason); setReason(''); load(); }
    catch (e) { setError(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const decide = async (id: string, action: 'approve' | 'deny') => {
    setError(null);
    try { await (action === 'approve' ? accessApi.approve(id) : accessApi.deny(id)); load(); }
    catch (e) { setError(extractErrorMessage(e)); }
  };

  const g = mine?.grant;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Sensitive-data access"
        subtitle="BVN and full account numbers are masked by default. Request time-boxed Just-in-Time access; a supervisor must approve."
      />

      {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* My elevation status */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">My access</h3>
        {mine === null ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : mine.active && g ? (
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">PII access active</span>
              <p className="text-xs text-slate-500 mt-1">Expires {formatDateTime(g.expiresAt)} · reason: {g.reason}</p>
            </div>
            <button onClick={() => g && accessApi.revoke(g.id).then(load)} className="text-xs text-red-600 hover:underline">End now</button>
          </div>
        ) : g && g.status === 'PENDING' ? (
          <p className="text-sm text-amber-700">Request pending supervisor approval · reason: {g.reason}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">You currently see BVN and account numbers <span className="font-medium">masked</span>.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Business justification (e.g. 'Case #1024 — verify BVN before issuing notice')"
              className="w-full border border-slate-300 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button onClick={submit} disabled={busy || reason.trim().length < 5}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {busy ? 'Requesting…' : 'Request 30-minute access'}
            </button>
          </div>
        )}
      </div>

      {/* Supervisor approval queue */}
      {isApprover && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Pending approvals</h3>
          {pending === null ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : pending.length === 0 ? (
            <p className="text-xs text-slate-400">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {p.staff ? `${p.staff.firstName} ${p.staff.lastName}` : p.staffId}
                      <span className="ml-2 text-xs text-slate-400">{p.staff?.role}</span>
                    </p>
                    <p className="text-xs text-slate-500 truncate">{p.reason} · {formatDateTime(p.requestedAt)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => decide(p.id, 'approve')} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-50">Approve</button>
                    <button onClick={() => decide(p.id, 'deny')} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50">Deny</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Raw-record access assignments (need-to-know) — SUPER_ADMIN/ADMIN only. */}
      {isAssignmentAdmin && <AccessAssignments />}
    </div>
  );
}
