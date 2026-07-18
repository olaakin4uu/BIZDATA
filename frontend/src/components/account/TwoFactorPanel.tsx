'use client';
import { useEffect, useState } from 'react';
import { authApi } from '@/lib/api/auth';
import { extractErrorMessage } from '@/lib/utils';

// Two-factor (TOTP) enrolment & management. Extracted from the tenant Settings
// page so it can live under the personal Account & security page.
export default function TwoFactorPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Enrolment state
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  // Codes shown once after enable / regenerate
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  // Disable / regenerate confirmation
  const [action, setAction] = useState<'disable' | 'regenerate' | null>(null);
  const [confirmCode, setConfirmCode] = useState('');

  const refresh = () => {
    authApi.staffMe()
      .then((u) => { setEnabled(!!u.mfaEnabled); setRemaining(u.recoveryCodesRemaining ?? 0); })
      .catch(() => setEnabled(false));
  };
  useEffect(refresh, []);

  const beginSetup = async () => {
    setBusy(true); setErr(null); setCodes(null);
    try { setSetup(await authApi.mfaSetup()); setEnrollCode(''); }
    catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const confirmEnable = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await authApi.mfaEnable(enrollCode.trim());
      setCodes(r.recoveryCodes);
      setSetup(null); setEnrollCode('');
      refresh();
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const runAction = async () => {
    setBusy(true); setErr(null);
    try {
      if (action === 'disable') {
        await authApi.mfaDisable(confirmCode.trim());
        setCodes(null);
      } else if (action === 'regenerate') {
        const r = await authApi.mfaRegenerateRecovery(confirmCode.trim());
        setCodes(r.recoveryCodes);
      }
      setAction(null); setConfirmCode('');
      refresh();
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const copyCodes = () => {
    if (!codes) return;
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 max-w-xl">
      {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}

      {enabled === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {enabled ? 'Two-factor is ON' : 'Two-factor is OFF'}
          </span>
          {enabled && <span className="text-xs text-slate-500">{remaining} recovery code{remaining === 1 ? '' : 's'} left</span>}
        </div>
      )}

      {/* Freshly generated recovery codes (shown once) */}
      {codes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">Save these recovery codes now — they won’t be shown again. Each works once if you lose your authenticator.</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-slate-800 mb-3">
            {codes.map((c) => <span key={c} className="tracking-wider">{c}</span>)}
          </div>
          <button onClick={copyCodes} className="text-xs font-medium px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
            {copied ? 'Copied ✓' : 'Copy all'}
          </button>
        </div>
      )}

      {/* OFF → start enrolment */}
      {enabled === false && !setup && (
        <button onClick={beginSetup} disabled={busy} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
          {busy ? 'Starting…' : 'Set up two-factor'}
        </button>
      )}

      {/* Enrolment: add the key to an authenticator app, then verify */}
      {setup && (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-800 mb-2">1. Add this account to your authenticator app</p>
          <p className="text-xs text-slate-500 mb-3">Google Authenticator, Authy, 1Password, Microsoft Authenticator — any TOTP app. Enter this setup key manually:</p>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 font-mono text-base bg-slate-50 border border-slate-200 rounded px-3 py-2 break-all tracking-[0.2em] text-slate-800">{setup.secret}</code>
            <button onClick={() => { navigator.clipboard.writeText(setup.secret); setSecretCopied(true); setTimeout(() => setSecretCopied(false), 1500); }}
              className="text-xs font-medium px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg whitespace-nowrap">
              {secretCopied ? 'Copied ✓' : 'Copy key'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            On a phone, you can also{' '}
            <a href={setup.otpauth} className="text-teal-700 hover:underline font-medium">tap to open your authenticator</a>.
            {' '}Account: <span className="font-mono">BizData</span> · type: time-based · 6 digits.
          </p>

          <p className="text-sm font-medium text-slate-800 mt-4 mb-2">2. Enter the 6-digit code to confirm</p>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric" maxLength={6} value={enrollCode} autoFocus
              onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button onClick={confirmEnable} disabled={busy || enrollCode.length !== 6} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {busy ? 'Verifying…' : 'Verify & enable'}
            </button>
            <button onClick={() => { setSetup(null); setErr(null); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}

      {/* ON → manage */}
      {enabled === true && !action && (
        <div className="flex items-center gap-3 pt-1">
          <button onClick={() => { setAction('regenerate'); setConfirmCode(''); setCodes(null); setErr(null); }} className="text-sm font-medium text-teal-700 hover:text-teal-800">
            Regenerate recovery codes
          </button>
          <span className="text-slate-300">·</span>
          <button onClick={() => { setAction('disable'); setConfirmCode(''); setCodes(null); setErr(null); }} className="text-sm font-medium text-rose-600 hover:text-rose-700">
            Turn off two-factor
          </button>
        </div>
      )}

      {/* Confirm disable / regenerate with a current code */}
      {action && (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-700 mb-2">
            {action === 'disable'
              ? 'Enter a current authenticator or recovery code to turn off two-factor.'
              : 'Enter a current authenticator code to generate a new set (the old codes stop working).'}
          </p>
          <div className="flex items-center gap-2">
            <input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder={action === 'disable' ? 'code or recovery code' : '000000'}
              className="w-56 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button onClick={runAction} disabled={busy || confirmCode.trim().length < 6}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 ${action === 'disable' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
              {busy ? 'Working…' : action === 'disable' ? 'Turn off' : 'Regenerate'}
            </button>
            <button onClick={() => { setAction(null); setErr(null); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
