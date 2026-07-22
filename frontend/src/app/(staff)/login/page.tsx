'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api/auth';
import { tenantApi, type TenantBranding } from '@/lib/api/tenant';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { extractErrorMessage } from '@/lib/utils';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import PasswordInput from '@/components/PasswordInput';
import { APP_NAME } from '@/lib/appName';

export default function StaffLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get('expired') === '1';
  const { setAuth, token, user, clearAuth } = useStaffAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);

  useEffect(() => {
    // Don't auto-bounce to the dashboard when we've been sent here by an expired
    // session — the in-memory store may still hold a stale token that localStorage
    // was already cleared of. Bouncing back would 401 again → infinite loop
    // ("blinking"). Clear the stale store first; only redirect on a genuine login.
    if (expired) {
      if (token || user) clearAuth();
      return;
    }
    if (token && user) router.replace(user.mustChangePassword ? '/change-password' : '/dashboard');
  }, [expired, token, user, router, clearAuth]);

  useEffect(() => {
    tenantApi.branding().then(setBranding).catch(() => setBranding(null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await authApi.staffLogin(email.trim().toLowerCase(), password, needsTotp ? totp.trim() : undefined);
      setAuth(res.user, res.accessToken);
      // After an admin reset the account must set its own password first.
      router.replace(res.user.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err) {
      const msg = extractErrorMessage(err);
      if (msg === 'MFA code required' && !needsTotp) {
        // First-time MFA challenge: surface via the neutral info notice below,
        // not the red error channel — a TOTP prompt is not a sign-in failure.
        setNeedsTotp(true);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900">
      {/* Left: tenant / subscriber branding */}
      <div className="lg:flex-1 flex items-center justify-center px-6 py-12 lg:py-0">
        {branding?.logoUrl ? (
          <div className="flex flex-col items-center gap-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoUrl} alt={branding.name} className="max-w-[260px] max-h-[260px] object-contain drop-shadow-xl" />
            <span className="text-lg font-semibold text-white/90">{branding.name}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 w-full max-w-sm aspect-square rounded-3xl border-2 border-dashed border-white/20 text-white/40">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-16 h-16">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3.75h18a.75.75 0 0 1 .75.75v15a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75V4.5A.75.75 0 0 1 3 3.75Z" />
            </svg>
            <span className="text-sm uppercase tracking-widest">Your organisation logo</span>
          </div>
        )}
      </div>

      {/* Right: sign-in */}
      <div className="lg:flex-1 flex items-center justify-center px-4 pb-12 lg:py-0">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-[10px] uppercase tracking-widest text-teal-300">
            Multi-Source Data Intelligence
          </p>
          <h1 className="text-4xl font-bold text-white mt-1">{APP_NAME}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Staff sign-in</h2>
          <p className="text-xs text-slate-500 mb-5">
            Authorised analysts, supervisors, and administrators only.
          </p>

          {expired && !error && (
            <div className="mb-4 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
              <span>Your session expired. Please sign in again to continue.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            {needsTotp && !error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm bg-[var(--info-soft)] border border-[var(--info)]/30 text-[var(--info)]">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
                <span>Enter the 6-digit code from your authenticator app to finish signing in.</span>
              </div>
            )}
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="staff-password" className="block text-xs font-medium text-[var(--ink-2)]">Password</label>
                <Link href="/forgot-password" className="text-xs text-teal-700 hover:underline font-medium">Forgot password?</Link>
              </div>
              <PasswordInput
                id="staff-password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:border-teal-500"
              />
            </div>
            {needsTotp && (
              <Input
                label="Authenticator code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                maxLength={12}
                required
                autoFocus
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                placeholder="000000"
                hint="Lost your device? Enter one of your recovery codes."
                className="text-center font-mono tracking-widest"
              />
            )}
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-5">
            Provider account?{' '}
            <Link href="/provider/login" className="text-teal-700 hover:underline font-medium">
              Use the provider portal
            </Link>
          </p>
        </div>

      </div>
      </div>
    </div>
  );
}
