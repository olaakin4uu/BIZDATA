'use client';
import { useState } from 'react';
import Link from 'next/link';
import { providerAuthApi } from '@/lib/api/auth';
import { extractErrorMessage } from '@/lib/utils';

// Provider "forgot password" request. Always shows the same confirmation
// whether or not the email maps to an account (no enumeration).
export default function ProviderForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await providerAuthApi.providerForgotPassword(email.trim().toLowerCase());
      setSent(true);
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
          <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">Reset your password</h2>
          <p className="text-xs text-[var(--ink-2)] mb-5">Enter your email and we’ll send a link to set a new password.</p>

          {sent ? (
            <div className="space-y-4">
              <div className="px-3 py-3 bg-[var(--good-soft)] border border-emerald-200 rounded-lg text-sm text-emerald-700">
                If an account exists for that email, a reset link is on its way. The link expires in 1 hour.
              </div>
              <Link href="/provider/login" className="text-sm text-teal-700 hover:underline font-medium">← Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {err && <div className="px-3 py-2 bg-[var(--bad-soft)] border border-rose-200 rounded-lg text-sm text-rose-700">{err}</div>}
              <div>
                <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5">Email</label>
                <input type="email" required autoFocus autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[var(--line)] rounded-lg text-sm bg-[var(--surface-2)] transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-400 focus:bg-white" />
              </div>
              <button type="submit" disabled={busy}
                className="w-full py-2.5 text-white text-sm font-semibold rounded-lg transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-brand)' }}>
                {busy ? 'Sending…' : 'Send reset link'}
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
