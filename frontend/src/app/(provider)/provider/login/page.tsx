'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { providerAuthApi } from '@/lib/api/auth';
import { useProviderAuthStore } from '@/store/providerAuthStore';
import { extractErrorMessage } from '@/lib/utils';
import { tenantApi } from '@/lib/api/tenant';
import PasswordInput from '@/components/PasswordInput';

export default function ProviderLoginPage() {
  const router = useRouter();
  const { setAuth, token, user } = useProviderAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Organisation logo/name uploaded under Settings (public branding endpoint).
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (token && user) router.replace('/provider/dashboard');
  }, [token, user, router]);

  useEffect(() => {
    tenantApi.branding()
      .then((b) => { setOrgLogo(b.logoUrl ?? null); setOrgName(b.name ?? null); })
      .catch(() => { /* fall back to the generic mark below */ });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await providerAuthApi.providerLogin(email.trim().toLowerCase(), password);
      setAuth(res.user, res.accessToken);
      // A provider whose password was reset by an admin must set their own via
      // the profile page before working; a self-service reset already set it.
      router.replace(res.user.mustChangePassword ? '/provider/profile' : '/provider/dashboard');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden"
      style={{ backgroundImage: 'var(--brand-grad)' }}
    >
      {/* ambient mesh glow — two soft teal/cyan lights over the brand ground */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-teal-400/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-slate-950/20" />
      </div>

      <div className="relative w-full max-w-md rise-in">
        <div className="text-center mb-4">
          {orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={orgName ?? 'Organisation logo'}
              className="mx-auto mb-2.5 h-16 w-auto max-w-[220px] rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-white/25 object-contain"
            />
          ) : (
            <span className="mx-auto mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/25 shadow-lg backdrop-blur">
              <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-white" aria-hidden>
                <path d="M7 3.5h6l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
                <path d="M13 3.5V9h5" />
                <path d="m8.5 14 2 2 4-4.5" />
              </svg>
            </span>
          )}
          <p className="text-[10px] uppercase tracking-[0.22em] text-teal-100/90">Provider Portal</p>
          <h1 className="text-3xl font-bold text-white mt-0.5 tracking-tight">BizData</h1>
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-[var(--ink)] mb-1">Sign in</h2>
          <p className="text-xs text-[var(--ink-2)] mb-4">
            For registered banks, fintechs, processors, telcos, and other data providers.
          </p>
          <form onSubmit={submit} className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-[var(--bad-soft)] border border-rose-200 rounded-lg text-sm text-rose-700">
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" strokeLinecap="round" /></svg>
                <span>{error}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-[var(--ink-2)] mb-1.5">Email</label>
              <input type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[var(--line)] rounded-lg text-sm bg-[var(--surface-2)] transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-400 focus:bg-white" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[var(--ink-2)]">Password</label>
                <Link href="/provider/forgot-password" className="text-xs text-teal-700 hover:text-teal-800 hover:underline font-medium">Forgot password?</Link>
              </div>
              <PasswordInput required autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[var(--line)] rounded-lg text-sm bg-[var(--surface-2)] transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-400 focus:bg-white" />
            </div>
            <button type="submit" disabled={busy}
              className="w-full py-2.5 text-white text-sm font-semibold rounded-lg transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:hover:brightness-100"
              style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-brand)' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="text-xs text-[var(--ink-3)] text-center mt-4">
            Are you a regulator?{' '}
            <Link href="/login" className="text-teal-700 hover:text-teal-800 hover:underline font-medium">Use the staff sign-in</Link>
          </p>
        </div>

        <div className="mt-4 flex flex-col items-center justify-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.22em] text-teal-100/80">
            Powered by
          </span>
          <Image
            src="/manam-logo.jpeg"
            alt="MANAM — Advisory / Tax / Secretarial Services"
            width={150}
            height={59}
            className="rounded-lg bg-white px-3 py-1.5 shadow-lg ring-1 ring-white/25"
          />
        </div>
      </div>
    </div>
  );
}
