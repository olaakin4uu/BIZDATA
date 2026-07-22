'use client';
import { useEffect, useState } from 'react';
import {
  providersApi, type ProviderUpload, type UploadRecord, type UploadsResponse,
} from '@/lib/api/providers';
import { accessAssignmentsApi, stepUpApi, grantTokenApi, type AccessGrantToken } from '@/lib/api/access';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { formatBytes, formatDate, formatDateTime, formatMoneyShort, extractErrorMessage } from '@/lib/utils';
import PasswordInput from '@/components/PasswordInput';
import { Modal } from '@/components/Modal';

const RAW_ACCESS_ROLES = ['SUPER_ADMIN', 'ADMIN'];

// Standard, audit-friendly reasons an officer can pick instead of free-typing.
// Selecting one fills the reason field (still editable, so a bespoke reason is
// always possible). Keeps the audit trail consistent and speeds up access.
const ACCESS_REASONS = [
  'Assessing an under-declaration case',
  'Verifying a taxpayer’s declared income',
  'Investigating a compliance flag',
  'Cross-checking a provider submission',
  'Responding to a taxpayer objection',
  'Preparing a demand notice',
  'Routine data-quality review',
  'Supervisor / audit review',
];

interface Props {
  providerId: string;
  providerName: string;
  onClose: () => void;
}

const SUB_BADGE: Record<string, string> = {
  ACCEPTED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PARTIALLY_ACCEPTED: 'bg-amber-50 text-amber-700 ring-amber-200',
  RECEIVED: 'bg-sky-50 text-sky-700 ring-sky-200',
  VALIDATING: 'bg-slate-50 text-slate-600 ring-slate-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export default function ProviderUploadsModal({ providerId, providerName, onClose }: Props) {
  const [uploads, setUploads] = useState<UploadsResponse | null>(null);
  const [loadingUploads, setLoadingUploads] = useState(true);

  // need-to-know assignment state
  const user = useStaffAuthStore((s) => s.user);
  const canHoldAccess = RAW_ACCESS_ROLES.includes(user?.role ?? '');
  const [assigned, setAssigned] = useState<boolean | null>(null); // null = checking
  const [assignReason, setAssignReason] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // four-eyes grant-token state
  const [grant, setGrant] = useState<AccessGrantToken | null>(null); // this provider's live grant, if any
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [token, setToken] = useState('');

  // step-up state
  const [stepToken, setStepToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Check assignment (need-to-know) + any live grant token for THIS provider.
  const refreshGrant = () => {
    grantTokenApi.mine()
      .then((rows) => setGrant(rows.find((g) => g.providerId === providerId && !g.revokedAt) ?? null))
      .catch(() => setGrant(null));
  };
  useEffect(() => {
    accessAssignmentsApi.mine()
      .then((rows) => setAssigned(rows.some((a) => a.providerId === providerId && !a.revokedAt)))
      .catch(() => setAssigned(false));
    refreshGrant();
  }, [providerId]);

  const requestToken = async () => {
    if (!assignReason.trim()) { setGrantError('A reason is required to request access.'); return; }
    setGrantBusy(true); setGrantError(null);
    try {
      await grantTokenApi.request({ providerId, reason: assignReason.trim() });
      setAssignReason(''); refreshGrant();
    } catch (e) { setGrantError(extractErrorMessage(e)); }
    finally { setGrantBusy(false); }
  };

  const selfAssign = async () => {
    if (!assignReason.trim()) { setAssignError('A reason is required.'); return; }
    setAssignBusy(true); setAssignError(null);
    try {
      await accessAssignmentsApi.self({ providerId, reason: assignReason.trim() });
      setAssigned(true); setAssignReason('');
    } catch (e) { setAssignError(extractErrorMessage(e)); }
    finally { setAssignBusy(false); }
  };

  // Sliding-session keepalive: while records are open, renew the step-up token on
  // active use so an actively-working officer isn't interrupted; an idle screen
  // (no renew) lets the token expire (5-min idle lock, 8h hard ceiling server-side).
  const renewSession = async () => {
    if (!stepToken) return;
    try {
      const r = await stepUpApi.renew(stepToken);
      setStepToken(r.stepUpToken);
      setExpiresAt(Date.now() + r.expiresInSeconds * 1000);
    } catch {
      // idle-expired or ceiling reached → drop the session; user re-authorises.
      setStepToken(null); setExpiresAt(null); setRecords(null); setSelected(null);
    }
  };

  // selected submission records
  const [selected, setSelected] = useState<ProviderUpload | null>(null);
  const [records, setRecords] = useState<UploadRecord[] | null>(null);
  const [recTotal, setRecTotal] = useState(0);
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  useEffect(() => {
    providersApi.listUploads(providerId)
      .then(setUploads)
      .catch(() => setUploads(null))
      .finally(() => setLoadingUploads(false));
  }, [providerId]);

  // countdown for the step-up token
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setRemaining(s);
      if (s === 0) { setStepToken(null); setExpiresAt(null); setRecords(null); setSelected(null); }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const doStepUp = async () => {
    setAuthBusy(true); setAuthError(null);
    try {
      // Four-eyes: redeem the SUPER_ADMIN-approved token with the password FIRST.
      // Reusable for the work session, so if it's already redeemed this just
      // confirms the session is live. Then issue the sliding-session step-up.
      await grantTokenApi.redeem({ providerId, token: token.trim().toUpperCase(), password });
      const r = await providersApi.stepUp(password, providerId, needTotp ? totp.trim() : undefined);
      setStepToken(r.stepUpToken);
      setExpiresAt(Date.now() + r.expiresInSeconds * 1000);
      setPassword(''); setTotp(''); setToken('');
      refreshGrant();
    } catch (err) {
      const msg = extractErrorMessage(err);
      if (msg === 'MFA code required' && !needTotp) { setNeedTotp(true); setAuthError('Enter your authenticator code.'); }
      else setAuthError(msg);
    } finally { setAuthBusy(false); }
  };

  const openRecords = async (sub: ProviderUpload) => {
    if (!stepToken) return;
    setSelected(sub); setRecords(null); setRecError(null); setRecBusy(true);
    try {
      const r = await providersApi.uploadRecords(sub.id, stepToken, 1, 100);
      setRecords(r.records); setRecTotal(r.total);
      renewSession(); // active use → extend the sliding session
    } catch (err) {
      setRecError(extractErrorMessage(err));
    } finally { setRecBusy(false); }
  };

  const [exporting, setExporting] = useState<string | null>(null);
  const exportCsv = async (sub: ProviderUpload) => {
    if (!stepToken) return;
    setExporting(sub.id);
    try {
      const { blob, filename } = await providersApi.exportUploadCsv(sub.id, stepToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* surfaced inline elsewhere; keep quiet on download */
    } finally { setExporting(null); }
  };

  return (
    <Modal open onClose={onClose} size="xl" title="Provider uploads">
      <p className="-mt-1 mb-4 text-xs text-slate-500">{providerName}</p>
      {/* uploads list */}
          {loadingUploads ? (
            <p className="text-sm text-slate-400">Loading uploads…</p>
          ) : !uploads || uploads.submissions.length === 0 ? (
            <p className="text-sm text-slate-500">This provider has not submitted any uploads yet.</p>
          ) : (
            <div className="space-y-2">
              {uploads.submissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{s.periodLabel}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ${SUB_BADGE[s.status] ?? 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {s.fileName ?? 'file'} · {formatBytes(s.fileSizeBytes)} · {s.recordCount.toLocaleString()} records
                      {s.rejectedCount > 0 && <span className="text-rose-600"> · {s.rejectedCount} rejected</span>}
                      {' '}· {formatDate(s.receivedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {stepToken && (
                      <button
                        onClick={() => exportCsv(s)}
                        disabled={exporting === s.id}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        title="Download all records as CSV (audited)"
                      >
                        {exporting === s.id ? 'Exporting…' : '⬇ CSV'}
                      </button>
                    )}
                    <button
                      onClick={() => openRecords(s)}
                      disabled={!stepToken}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap ${
                        stepToken ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                      title={stepToken ? 'View records' : 'Authorise access first'}
                    >
                      {stepToken ? 'View records →' : '🔒 Locked'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* step-up gate */}
          {/* Need-to-know gate: wrong role → blocked; right role but unassigned →
              self-assign (reason); assigned + no token → password unlock. */}
          {!stepToken && !canHoldAccess ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              🔒 Raw taxpayer records can only be viewed by Super Admin or Admin officers assigned to this provider.
              You do not have the required role.
            </div>
          ) : !stepToken && assigned === false ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="text-xl">⛔</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">You are not assigned to {providerName}</p>
                  <p className="text-xs text-slate-600 mt-0.5 mb-3">
                    Access to this provider&apos;s raw records is need-to-know. Assign yourself with a reason (this is
                    recorded in the audit trail), or ask an administrator to grant you access.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Reason for access</label>
                      <select
                        value={ACCESS_REASONS.includes(assignReason) ? assignReason : ''}
                        onChange={(e) => e.target.value && setAssignReason(e.target.value)}
                        className="mb-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm w-72 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Choose a reason…</option>
                        {ACCESS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        <option value="" disabled>──────────</option>
                      </select>
                      <input
                        value={assignReason} onChange={(e) => setAssignReason(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && selfAssign()}
                        placeholder="…or type a specific reason"
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <button
                      onClick={selfAssign} disabled={assignBusy || !assignReason.trim()}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                    >
                      {assignBusy ? 'Assigning…' : 'Assign myself (audited)'}
                    </button>
                  </div>
                  {assignError && <p className="text-xs text-rose-600 mt-2">{assignError}</p>}
                </div>
              </div>
            </div>
          ) : !stepToken && assigned === null ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Checking your access…</div>
          ) : !stepToken && (!grant || grant.status === 'REVOKED' || grant.status === 'EXPIRED') ? (
            /* Assigned, but no live grant token — request one (four-eyes). */
            <div className="mt-6 rounded-xl border border-sky-200 bg-sky-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="text-xl">🪪</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">Request access to upload records</p>
                  <p className="text-xs text-slate-600 mt-0.5 mb-3">
                    Viewing raw records requires a <strong>Super Admin</strong> to approve your access (four-eyes). Request it
                    with a reason; you&apos;ll receive a one-time token to unlock with your password. This is audited.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Reason for access</label>
                      <select
                        value={ACCESS_REASONS.includes(assignReason) ? assignReason : ''}
                        onChange={(e) => e.target.value && setAssignReason(e.target.value)}
                        className="mb-1.5 px-3 py-2 border border-slate-300 rounded-lg text-sm w-72 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="">Choose a reason…</option>
                        {ACCESS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <input value={assignReason} onChange={(e) => setAssignReason(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && requestToken()}
                        placeholder="…or type a specific reason"
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-sky-500" />
                    </div>
                    <button onClick={requestToken} disabled={grantBusy || !assignReason.trim()}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                      {grantBusy ? 'Requesting…' : 'Request access'}
                    </button>
                  </div>
                  {grantError && <p className="text-xs text-rose-600 mt-2">{grantError}</p>}
                </div>
              </div>
            </div>
          ) : !stepToken && grant?.status === 'PENDING' ? (
            /* Requested — waiting for a Super Admin to approve. */
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-5 text-sm text-slate-700">
              <p className="font-semibold text-slate-800">⏳ Awaiting Super Admin approval</p>
              <p className="text-xs text-slate-600 mt-1">
                Your access request is pending. A Super Admin will approve it and issue you a one-time token (also emailed).
                Once you have the token, refresh and enter it with your password below.
              </p>
              <button onClick={refreshGrant} className="mt-2 text-xs font-medium text-amber-700 hover:underline">Refresh status</button>
            </div>
          ) : !stepToken ? (
            /* Approved (or redeemed within session) — redeem password + token to unlock. */
            <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="text-xl">🔐</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">Unlock upload records</p>
                  <p className="text-xs text-slate-600 mt-0.5 mb-3">
                    Your access was approved. Enter your <strong>password</strong> and the <strong>one-time token</strong> (from
                    the Super Admin / your email) to unlock. Your session stays open while you work and locks after 5 minutes idle. Audited.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Your password</label>
                      <PasswordInput
                        value={password} autoComplete="current-password"
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && doStepUp()}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Access token</label>
                      <input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && doStepUp()}
                        placeholder="e.g. 3F9A2C7B10" maxLength={10}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-44 font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    {needTotp && (
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">Authenticator code</label>
                        <input inputMode="numeric" maxLength={6} value={totp}
                          onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={(e) => e.key === 'Enter' && doStepUp()}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-32 font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </div>
                    )}
                    <button onClick={doStepUp} disabled={authBusy || !password || !token.trim()}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                      {authBusy ? 'Verifying…' : 'Unlock'}
                    </button>
                  </div>
                  {authError && <p className="text-xs text-rose-600 mt-2">{authError}</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span>✓ Access authorised for {providerName}</span>
              <span className="text-emerald-500">· locks in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} if idle (extends while you work)</span>
            </div>
          )}

          {/* records table */}
          {selected && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  Records in {selected.periodLabel}
                  {records && <span className="text-slate-400 font-normal"> · showing {records.length} of {recTotal.toLocaleString()}</span>}
                </h3>
              </div>
              {recBusy ? (
                <p className="text-sm text-slate-400">Loading records…</p>
              ) : recError ? (
                <p className="text-sm text-rose-600">{recError}</p>
              ) : records && records.length > 0 ? (
                <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-left text-slate-500">
                        <th className="px-3 py-2 font-medium">Account name</th>
                        <th className="px-3 py-2 font-medium">BVN</th>
                        <th className="px-3 py-2 font-medium">NIN</th>
                        <th className="px-3 py-2 font-medium text-right">Inflow</th>
                        <th className="px-3 py-2 font-medium text-right">Outflow</th>
                        <th className="px-3 py-2 font-medium">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{r.accountName ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{r.bvn ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-slate-600">{r.nin ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{r.totalInflow ? formatMoneyShort(r.totalInflow) : '—'}</td>
                          <td className="px-3 py-2 text-right text-rose-700">{r.totalOutflow ? formatMoneyShort(r.totalOutflow) : '—'}</td>
                          <td className="px-3 py-2 text-slate-500">{r.matchMethod ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No records in this upload.</p>
              )}
            </div>
          )}
    </Modal>
  );
}
