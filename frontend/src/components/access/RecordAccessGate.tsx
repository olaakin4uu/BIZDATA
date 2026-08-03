'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  accessAssignmentsApi,
  grantTokenApi,
  type AccessAssignment,
  type AccessGrantToken,
} from '@/lib/api/access';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { extractErrorMessage, formatDateTime } from '@/lib/utils';

/**
 * The officer's half of raw-record access.
 *
 * The controls in front of a taxpayer's decrypted PII were built to be
 * self-service: assign yourself with a reason, request a token, redeem it. Only
 * the ADMIN half was ever given a screen — the approvals queue and the
 * provider-scoped grant form. There was no way for an officer to self-assign to
 * a CASE, request a token, or redeem one, so the evidence bundle and AI tax
 * report were unreachable through the app by anyone. The buttons were there; the
 * path to earning them was not, and the only feedback was a bare 403.
 *
 * This is that path, shown where the wall is rather than on a separate page.
 * Each step states why it exists, because "request access" means nothing to
 * someone who does not know what they are being asked to justify.
 */

type Scope = { caseId?: string; providerId?: string };

function scopeMatches(row: { caseId: string | null; providerId: string | null }, scope: Scope) {
  return scope.caseId ? row.caseId === scope.caseId : row.providerId === scope.providerId;
}

/** A token that currently unlocks records, as opposed to one merely issued. */
function isLiveSession(t: AccessGrantToken): boolean {
  return (
    t.status === 'REDEEMED' &&
    !t.revokedAt &&
    !!t.sessionExpiresAt &&
    new Date(t.sessionExpiresAt).getTime() > Date.now()
  );
}

export default function RecordAccessGate({
  scope,
  label,
  onUnlocked,
  onClose,
}: {
  scope: Scope;
  /** What the officer is trying to open, so the reason box has context. */
  label: string;
  onUnlocked?: () => void;
  onClose?: () => void;
}) {
  const user = useStaffAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [assignment, setAssignment] = useState<AccessAssignment | null>(null);
  const [token, setToken] = useState<AccessGrantToken | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [assignReason, setAssignReason] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [redeemToken, setRedeemToken] = useState('');
  const [password, setPassword] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [assigns, tokens] = await Promise.all([
        accessAssignmentsApi.mine().catch(() => [] as AccessAssignment[]),
        grantTokenApi.mine().catch(() => [] as AccessGrantToken[]),
      ]);
      setAssignment(assigns.find((a) => scopeMatches(a, scope) && !a.revokedAt) ?? null);
      // Prefer a live session, then the newest usable token for this scope.
      const forScope = tokens.filter((t) => scopeMatches(t, scope) && !t.revokedAt);
      setToken(forScope.find(isLiveSession) ?? forScope[0] ?? null);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoaded(true);
    }
    // scope is a fresh object each render; depend on its values, not identity.
  }, [scope.caseId, scope.providerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(extractErrorMessage(e)); } finally { setBusy(null); }
  };

  const selfAssign = () => run('assign', async () => {
    await accessAssignmentsApi.self({ ...scope, reason: assignReason.trim() });
    setAssignReason('');
    await load();
  });

  const requestToken = () => run('request', async () => {
    await grantTokenApi.request({ ...scope, reason: requestReason.trim() });
    setRequestReason('');
    await load();
  });

  const approveOwn = () => run('approve', async () => {
    if (!token) return;
    const r = await grantTokenApi.approve(token.id);
    // Shown once. It is also emailed, but the relay copy is the reliable channel.
    setIssuedToken(r.token);
    setRedeemToken(r.token);
    await load();
  });

  const redeem = () => run('redeem', async () => {
    await grantTokenApi.redeem({ ...scope, token: redeemToken.trim(), password });
    setPassword(''); setIssuedToken(null);
    await load();
    onUnlocked?.();
  });

  const endSession = () => run('revoke', async () => {
    if (!token) return;
    await grantTokenApi.revoke(token.id);
    await load();
  });

  const live = token && isLiveSession(token);

  const Step = ({ n, title, done, children }: { n: number; title: string; done: boolean; children?: React.ReactNode }) => (
    <div className="flex gap-3">
      <div
        className={`mt-0.5 h-6 w-6 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${
          done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {done ? '✓' : n}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? 'text-slate-500' : 'text-slate-800'}`}>{title}</p>
        {children}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-slate-800">Record access · {label}</h3>
        {onClose && (
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Close</button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        This document decrypts the taxpayer&apos;s identity, so access is granted per case, recorded against your name,
        and time-boxed. Every step below is audited.
      </p>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {!loaded ? (
        <p className="text-xs text-slate-400">Checking your access…</p>
      ) : live ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">Access is open</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            Until {formatDateTime(token!.sessionExpiresAt!)}. Reopen the document now.
          </p>
          <button
            onClick={endSession}
            disabled={busy === 'revoke'}
            className="mt-3 text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            End access now
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 1 — need-to-know */}
          <Step n={1} title="Assign yourself to this case" done={!!assignment}>
            {assignment ? (
              <p className="text-xs text-slate-500 mt-0.5">Assigned · {assignment.reason}</p>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-slate-500">
                  Records are need-to-know. Say why you need this one — it is stored with the assignment.
                </p>
                <input
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  placeholder="e.g. Assigned to audit this taxpayer for FY2026"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button
                  onClick={selfAssign}
                  disabled={busy === 'assign' || !assignReason.trim()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-40"
                >
                  {busy === 'assign' ? 'Assigning…' : 'Self-assign'}
                </button>
              </div>
            )}
          </Step>

          {/* 2 — request */}
          <Step n={2} title="Request an access token" done={!!token}>
            {token ? (
              <p className="text-xs text-slate-500 mt-0.5">
                {token.status === 'PENDING' ? 'Awaiting Super Admin approval' : `Token ${token.status.toLowerCase()}`}
                {token.redeemExpiresAt && token.status === 'APPROVED'
                  ? ` · redeem before ${formatDateTime(token.redeemExpiresAt)}`
                  : ''}
              </p>
            ) : !assignment ? (
              <p className="text-xs text-slate-400 mt-0.5">Assign yourself first.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <input
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Why you need to open the record now"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <button
                  onClick={requestToken}
                  disabled={busy === 'request' || !requestReason.trim()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-40"
                >
                  {busy === 'request' ? 'Requesting…' : 'Request access'}
                </button>
              </div>
            )}
          </Step>

          {/* 3 — approval */}
          <Step n={3} title="Super Admin approval" done={!!token && token.status !== 'PENDING'}>
            {!token ? (
              <p className="text-xs text-slate-400 mt-0.5">Request a token first.</p>
            ) : token.status === 'PENDING' ? (
              isSuperAdmin ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-500">
                    You are a Super Admin, so you may approve this yourself. The approval is recorded as self-approved.
                  </p>
                  <button
                    onClick={approveOwn}
                    disabled={busy === 'approve'}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40"
                  >
                    {busy === 'approve' ? 'Approving…' : 'Approve'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">
                  A Super Admin must approve this. They will see it in their approvals queue; the token is emailed to you.
                </p>
              )
            ) : (
              <p className="text-xs text-slate-500 mt-0.5">Approved.</p>
            )}
            {issuedToken && (
              <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-emerald-800">One-time token — shown once</p>
                <p className="font-mono text-base tracking-widest text-emerald-900">{issuedToken}</p>
              </div>
            )}
          </Step>

          {/* 4 — redeem */}
          <Step n={4} title="Unlock with your password" done={false}>
            {token?.status === 'APPROVED' ? (
              <div className="mt-2 space-y-2">
                <input
                  value={redeemToken}
                  onChange={(e) => setRedeemToken(e.target.value)}
                  placeholder="Access token"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tracking-widest"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter' && redeemToken.trim() && password) redeem(); }}
                />
                <button
                  onClick={redeem}
                  disabled={busy === 'redeem' || !redeemToken.trim() || !password}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {busy === 'redeem' ? 'Unlocking…' : 'Unlock records'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">Available once a token is approved.</p>
            )}
          </Step>
        </div>
      )}
    </div>
  );
}
