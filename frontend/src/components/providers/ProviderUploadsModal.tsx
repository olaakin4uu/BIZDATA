'use client';
import { useEffect, useState } from 'react';
import {
  providersApi, type ProviderUpload, type UploadRecord, type UploadsResponse,
} from '@/lib/api/providers';
import { formatBytes, formatDate, formatDateTime, formatMoneyShort, extractErrorMessage } from '@/lib/utils';

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

  // step-up state
  const [stepToken, setStepToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
      const r = await providersApi.stepUp(password, providerId, needTotp ? totp.trim() : undefined);
      setStepToken(r.stepUpToken);
      setExpiresAt(Date.now() + r.expiresInSeconds * 1000);
      setPassword(''); setTotp('');
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Provider uploads</h2>
            <p className="text-xs text-slate-500">{providerName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>

        <div className="p-6">
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
                        {s.status.replace('_', ' ')}
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
          {!stepToken ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="text-xl">🔐</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">Authorise access to upload records</p>
                  <p className="text-xs text-slate-600 mt-0.5 mb-3">
                    Viewing the actual records inside an upload reveals sensitive taxpayer data (BVN, NIN, account details).
                    Re-enter your password to unlock this for 10 minutes. This action is audited.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Your password</label>
                      <input
                        type="password" value={password} autoComplete="current-password"
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && doStepUp()}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    {needTotp && (
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">Authenticator code</label>
                        <input
                          inputMode="numeric" maxLength={6} value={totp}
                          onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={(e) => e.key === 'Enter' && doStepUp()}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-32 font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    )}
                    <button
                      onClick={doStepUp} disabled={authBusy || !password}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                    >
                      {authBusy ? 'Verifying…' : 'Unlock'}
                    </button>
                  </div>
                  {authError && <p className="text-xs text-rose-600 mt-2">{authError}</p>}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span>✓ Access authorised</span>
              <span className="text-emerald-500">· expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>
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
        </div>
      </div>
    </div>
  );
}
