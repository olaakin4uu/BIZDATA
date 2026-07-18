'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PasswordInput from '@/components/PasswordInput';
import { authApi } from '@/lib/api/auth';
import { extractErrorMessage } from '@/lib/utils';

// Staff password reset, reached from the emailed link (/reset-password?token=…).
// On success the user signs in with the new password. Wrapped in Suspense
// because useSearchParams requires it.
function StaffResetPasswordInner() {
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
      await authApi.staffResetPassword(token, form.newPassword);
      setDone(true);
      setTimeout(() => { window.location.href = '/login'; }, 1500);
    } catch (e2) {
      setErr(extractErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
          <h1 className="text-lg font-semibold text-slate-800 mb-1">Choose a new password</h1>
          <p className="text-xs text-slate-500 mb-5">Set a new password for your BizData account.</p>

          {done ? (
            <div className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
              Password set. Redirecting you to sign in…
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
              {!token && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  This link is missing its token. <Link href="/forgot-password" className="underline font-medium">Request a new link</Link>.
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">New password</label>
                <PasswordInput required minLength={8} autoComplete="new-password" value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <p className="text-[11px] text-slate-400 mt-1">At least 8 characters.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Confirm new password</label>
                <PasswordInput required autoComplete="new-password" value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <button type="submit" disabled={busy || !token}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {busy ? 'Setting…' : 'Set new password'}
              </button>
              <div className="text-center">
                <Link href="/login" className="text-xs text-slate-500 hover:text-slate-700">Back to sign in</Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StaffResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>}>
      <StaffResetPasswordInner />
    </Suspense>
  );
}
