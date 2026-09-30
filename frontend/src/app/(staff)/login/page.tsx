'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api/auth';
import { type TenantBranding } from '@/lib/api/tenant';
import { loadBranding } from '@/lib/branding';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { extractErrorMessage } from '@/lib/utils';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import PasswordInput from '@/components/PasswordInput';
import { APP_NAME } from '@/lib/appName';

const TAGLINE = 'Financial and Non-Financial Institution Reports Intelligence System';

/** Faint diagonal weave over the brand panel, so the ground reads textured rather than flat. */
const PANEL_PATTERN =
  "url(\"data:image/svg+xml,%3csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3e%3cg fill='%23ffffff' fill-rule='evenodd'%3e%3cpath d='m0 40 40-40h-40v40zm40 0v-40h-40l40 40z'/%3e%3c/g%3e%3c/svg%3e\")";

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
  // A round seal fills a circle beautifully; a wide banner logo (which several
  // tenants use) would sit marooned in one, so the frame follows the artwork.
  const [logoIsSquare, setLogoIsSquare] = useState<boolean | null>(null);

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
    loadBranding().then(setBranding).catch(() => setBranding(null));
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

  const year = new Date().getFullYear();

  return (
    // Split screen: a full-height brand panel carrying the tenant's identity, and a
    // clean sign-in panel. On phones the brand panel collapses to the logo and name
    // above the form, because a 46% colour block would eat the fold.
    <div className="min-h-screen bg-[var(--surface)] lg:flex">
      {/* Brand panel — desktop only */}
      <aside
        className="relative hidden overflow-hidden text-white lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16"
        style={{ background: 'var(--brand-grad)' }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: PANEL_PATTERN }} />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem]"
          style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-teal-400, #2dd4bf) 30%, transparent), transparent 65%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-48 -left-32 h-[34rem] w-[34rem]"
          style={{ background: 'radial-gradient(circle, rgba(4, 30, 32, 0.55), transparent 65%)' }}
        />

        <div className="relative text-center">
          <p className="text-lg font-semibold tracking-tight">{APP_NAME}</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-white/75 text-balance">{TAGLINE}</p>
        </div>

        <div className="relative flex flex-col items-center text-center">
          {branding?.logoUrl ? (
            <div
              className={`bg-white shadow-2xl ring-8 ring-white/10 ${
                logoIsSquare ? 'rounded-full p-5' : 'rounded-3xl px-8 py-7'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logoUrl}
                alt={branding.name}
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                  if (w && h) setLogoIsSquare(Math.abs(w / h - 1) <= 0.25);
                }}
                className={
                  logoIsSquare
                    ? 'h-52 w-52 object-contain xl:h-60 xl:w-60'
                    : 'max-h-40 w-[18rem] object-contain xl:w-[21rem]'
                }
              />
            </div>
          ) : (
            <div className="flex h-64 w-64 flex-col items-center justify-center gap-3 rounded-full border-2 border-dashed border-white/25 text-white/45 xl:h-72 xl:w-72">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="h-14 w-14">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3.75h18a.75.75 0 0 1 .75.75v15a.75.75 0 0 1-.75.75H3a.75.75 0 0 1-.75-.75V4.5A.75.75 0 0 1 3 3.75Z" />
              </svg>
              <span className="text-xs uppercase tracking-widest">Your organisation logo</span>
            </div>
          )}
          {branding?.name && <h2 className="mt-8 text-3xl font-bold tracking-wide xl:text-4xl text-balance">{branding.name}</h2>}
          <span className="mt-4 h-1 w-16 rounded-full bg-amber-400" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/80">Secure access to the {APP_NAME} back office</p>
        </div>

        <p className="relative text-center text-xs text-white/60">
          &copy; {year} {branding?.name || APP_NAME}. All rights reserved.
        </p>
      </aside>

      {/* Sign-in panel */}
      <main className="flex min-h-screen flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            {/* Phones: the brand panel is hidden, so the identity rides above the form. */}
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              {branding?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logoUrl}
                  alt={branding.name}
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    if (w && h) setLogoIsSquare(Math.abs(w / h - 1) <= 0.25);
                  }}
                  className={`mb-3 object-contain ${
                    logoIsSquare ? 'h-20 w-20' : 'max-h-16 w-auto max-w-[15rem]'
                  }`}
                />
              ) : null}
              <p className="text-[10px] uppercase tracking-[0.12em] leading-[1.7] text-teal-700 text-balance">{TAGLINE}</p>
              <h1 className="mt-1 text-3xl font-bold text-[var(--ink)]">{APP_NAME}</h1>
            </div>

            <div className="mb-6 hidden lg:block">
              <h1 className="text-3xl font-bold tracking-tight text-[var(--ink)]">Staff sign-in</h1>
              <p className="mt-2 text-sm text-[var(--ink-3)]">
                Authorised analysts, supervisors, and administrators only.
              </p>
            </div>

            {/* Card chrome on phones only — on desktop the panel itself is the card. */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--elev-3)] sm:p-8 lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none">
              <div className="mb-5 lg:hidden">
                <h2 className="text-lg font-semibold text-[var(--ink)]">Staff sign-in</h2>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Authorised analysts, supervisors, and administrators only.
                </p>
              </div>

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

              <p className="text-xs text-[var(--ink-3)] text-center mt-5">
                Provider account?{' '}
                <Link href="/provider/login" className="text-teal-700 hover:underline font-medium">
                  Use the provider portal
                </Link>
              </p>
            </div>

            <p className="mt-8 text-center text-xs text-[var(--ink-3)] lg:hidden">
              &copy; {year} {branding?.name || APP_NAME}. All rights reserved.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
