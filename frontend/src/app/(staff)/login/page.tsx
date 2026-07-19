'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { authApi } from '@/lib/api/auth';
import { tenantApi, type TenantBranding } from '@/lib/api/tenant';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { extractErrorMessage } from '@/lib/utils';

export default function StaffLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expired = searchParams.get('expired') === '1';
  const { setAuth, token, user, clearAuth } = useStaffAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        setNeedsTotp(true);
        setError('Enter the 6-digit code from your authenticator app.');
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
          <h1 className="text-4xl font-bold text-white mt-1">BizData</h1>
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
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">Password</label>
                <Link href="/forgot-password" className="text-xs text-teal-700 hover:underline font-medium">Forgot password?</Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {needsTotp && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Authenticator code</label>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  maxLength={12}
                  required
                  autoFocus
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  placeholder="000000"
                  className="w-full px-3 py-2 border border-teal-400 rounded-lg text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[11px] text-slate-400 mt-1 text-center">Lost your device? Enter one of your recovery codes.</p>
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-5">
            Provider account?{' '}
            <Link href="/provider/login" className="text-teal-700 hover:underline font-medium">
              Use the provider portal
            </Link>
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3">
          <span className="text-xs uppercase tracking-widest text-slate-300">
            Powered by
          </span>
          <Image
            src="/manam-logo.jpeg"
            alt="MANAM — Advisory / Tax / Secretarial Services"
            width={220}
            height={86}
            className="rounded-xl bg-white px-4 py-3 shadow-lg"
            priority
          />
        </div>
      </div>
      </div>
    </div>
  );
}
