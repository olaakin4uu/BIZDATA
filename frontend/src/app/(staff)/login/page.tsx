'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api/auth';
import { useStaffAuthStore } from '@/store/staffAuthStore';
import { extractErrorMessage } from '@/lib/utils';

export default function StaffLoginPage() {
  const router = useRouter();
  const { setAuth, token, user } = useStaffAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token && user) router.replace('/dashboard');
  }, [token, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await authApi.staffLogin(email.trim().toLowerCase(), password);
      setAuth(res.user, res.accessToken);
      router.replace('/dashboard');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900">
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
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
      </div>
    </div>
  );
}
