'use client';
import { useState } from 'react';
import PasswordInput from '@/components/PasswordInput';
import { authApi } from '@/lib/api/auth';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { extractErrorMessage } from '@/lib/utils';

// Self-service password change (requires the current password). Extracted from
// the tenant Settings page so it can live under the personal Account page.
// Changing the password bumps the server-side password epoch, which invalidates
// this session's own token — so on success we clear auth and send the user to
// sign in again with the new password.
export default function ChangePasswordPanel() {
  const { clearAuth } = useStaffAuthStore();
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true); setPwErr(null); setPwMsg(null);
    if (pwForm.newPassword.length < 8) { setPwErr('New password must be at least 8 characters'); setPwBusy(false); return; }
    if (pwForm.newPassword !== pwForm.confirm) { setPwErr('Passwords do not match'); setPwBusy(false); return; }
    try {
      await authApi.changeStaffPassword(pwForm.currentPassword, pwForm.newPassword);
      setPwMsg('Password updated. Sign in again with your new password…');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      // The token is now stale (password epoch moved). Clear and re-login.
      clearAuth();
      setTimeout(() => { window.location.href = '/login'; }, 1200);
    } catch (err) {
      setPwErr(extractErrorMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <form onSubmit={changePassword} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3 max-w-sm">
      {pwErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{pwErr}</div>}
      {pwMsg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{pwMsg}</div>}
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Current password</label>
        <PasswordInput required autoComplete="current-password" value={pwForm.currentPassword}
          onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">New password</label>
        <PasswordInput required minLength={8} autoComplete="new-password" value={pwForm.newPassword}
          onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <p className="text-xs text-slate-400 mt-1">At least 8 characters.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Confirm new password</label>
        <PasswordInput required autoComplete="new-password" value={pwForm.confirm}
          onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      </div>
      <button type="submit" disabled={pwBusy} className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
        {pwBusy ? 'Updating…' : 'Change password'}
      </button>
    </form>
  );
}
