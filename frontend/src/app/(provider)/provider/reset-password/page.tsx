'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PasswordInput from '@/components/PasswordInput';
import { providerAuthApi } from '@/lib/api/auth';
import { extractErrorMessage } from '@/lib/utils';

// Provider password reset, reached from the emailed link
// (/provider/reset-password?token=…). On success the user signs in anew.
function ProviderResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [form, setForm] = useState({ newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!token) { setErr('This reset link is invalid. Request a new one.'); return; }
    if (form.newPassword.length < 8) { setErr('New password must be at least 8 characters'); return; }
    if (form.newPassword !== form.confirm) { setErr('Passwords do not match'); return; }
    setBusy(true);
    try {
      await providerAuthApi.providerResetPassword(token, form.newPassword);
      setDone(true);
      setTimeout(() => { window.location.href = '/provider/login'; }, 1500);
    } catch (e2) {
      setErr(extractErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden" style={{ backgroundImage: 'var(--brand-grad)' }}>
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-teal-400/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-slate-950/20" />
      </div>

      <div className="relative w-full max-w-md rise-in">
        <div className="rounded-2xl border border-white/60 bg-white/95 p-8 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">Choose a new password</h2>
          <p className="text-xs text-[var(--ink-2)] mb-5">Set a new password for your provider account.</p>

          {done ? (
            <div className="px-3 py-3 bg-[var(--good-soft)] border border-emerald-200 rounded-lg text-sm text-emerald-700">
              Password set. Redirecting you to sign in…
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {err && <div className="px-3 py-2 bg-[var(--bad-soft)] border border-rose-200 rounded-lg text-sm text-rose-700">{err}</div>}
              {!token && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  This link is missing its token. <Link href="/provider/forgot-password" className="underline font-medium">Request a new link</Link>.
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5">New password</label>
                <PasswordInput required minLength={8} autoComplete="new-password" value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[var(--line)] rounded-lg text-sm bg-[var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-400 focus:bg-white" />
                <p className="text-[11px] text-[var(--ink-3)] mt-1">At least 8 characters.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5">Confirm new password</label>
                <PasswordInput required autoComplete="new-password" value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[var(--line)] rounded-lg text-sm bg-[var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-400 focus:bg-white" />
              </div>
              <button type="submit" disabled={busy || !token}
                className="w-full py-2.5 text-white text-sm font-semibold rounded-lg transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-brand)' }}>
                {busy ? 'Setting…' : 'Set new password'}
              </button>
              <p className="text-xs text-[var(--ink-3)] text-center">
                <Link href="/provider/login" className="hover:underline">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProviderResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>}>
      <ProviderResetPasswordInner />
    </Suspense>
  );
}
