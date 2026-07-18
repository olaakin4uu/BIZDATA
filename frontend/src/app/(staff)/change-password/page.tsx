'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/PasswordInput';
import { authApi } from '@/lib/api/auth';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { extractErrorMessage } from '@/lib/utils';

// Forced password change after an admin reset. The user signs in with the
// temporary password the admin set (that's the "current" password here), then
// sets one only they know. Changing it bumps passwordChangedAt on the server,
// which invalidates the token this page is using — so on success we clear auth
// and bounce to /login to sign in fresh.
export default function ChangePasswordPage() {
  const router = useRouter();
  const { clearAuth } = useStaffAuthStore();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (form.newPassword.length < 8) { setErr('New password must be at least 8 characters'); return; }
    if (form.newPassword !== form.confirm) { setErr('Passwords do not match'); return; }
    if (form.newPassword === form.currentPassword) { setErr('Choose a password different from the temporary one'); return; }
    setBusy(true);
    try {
      await authApi.changeStaffPassword(form.currentPassword, form.newPassword);
      setDone(true);
      // The token is now stale (password epoch moved). Clear and re-login.
      clearAuth();
      setTimeout(() => router.replace('/login'), 1200);
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
          <h1 className="text-lg font-semibold text-slate-800 mb-1">Set a new password</h1>
          <p className="text-xs text-slate-500 mb-5">
            Your password was reset by an administrator. Choose a new password only you know before continuing.
          </p>

          {done ? (
            <div className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
              Password updated. Redirecting you to sign in…
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Temporary password</label>
                <PasswordInput required autoComplete="current-password" value={form.currentPassword}
                  onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <p className="text-[11px] text-slate-400 mt-1">The one the administrator gave you to sign in.</p>
              </div>
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
              <button type="submit" disabled={busy}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {busy ? 'Updating…' : 'Set new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
