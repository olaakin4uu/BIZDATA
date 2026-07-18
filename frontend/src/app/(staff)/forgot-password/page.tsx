'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api/auth';
import { extractErrorMessage } from '@/lib/utils';

// Staff "forgot password" request. Always shows the same confirmation whether
// or not the email maps to an account (the backend never reveals which) — so
// this page cannot be used to enumerate accounts.
export default function StaffForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await authApi.staffForgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e2) {
      // A rate-limit (429) is the only expected error; show it plainly.
      setErr(extractErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
          <h1 className="text-lg font-semibold text-slate-800 mb-1">Reset your password</h1>
          <p className="text-xs text-slate-500 mb-5">
            Enter your work email and we’ll send a link to set a new password.
          </p>

          {sent ? (
            <div className="space-y-4">
              <div className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                If an account exists for that email, a reset link is on its way. The link expires in 1 hour.
              </div>
              <Link href="/login" className="text-sm text-teal-700 hover:underline font-medium">← Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input type="email" autoComplete="email" required autoFocus value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <button type="submit" disabled={busy}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {busy ? 'Sending…' : 'Send reset link'}
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
