'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/Button';
import { Input } from '@/components/Field';
import { candidateApi, candToken, brandingApi } from './lib';

export default function CandidateLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Public org branding → show the configured KIRS logo on the login screen.
  useEffect(() => {
    brandingApi.get().then((b) => setLogoUrl(b.logoUrl ?? null)).catch(() => {});
  }, []);

  // Resume an in-progress sitting if a valid candidate token is already stored.
  useEffect(() => {
    if (!candToken.get()) {
      setChecking(false);
      return;
    }
    candidateApi
      .state()
      .then((s) => {
        if (s.status === 'IN_PROGRESS') router.replace('/assessment/exam');
        else {
          candToken.clear();
          setChecking(false);
        }
      })
      .catch(() => {
        candToken.clear();
        setChecking(false);
      });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await candidateApi.login(code.trim());
      candToken.set(token);
      router.replace('/assessment/exam');
    } catch (err) {
      setError((err as Error).message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          {logoUrl && (
            <img src={logoUrl} alt="KIRS" className="mx-auto mb-4 h-20 w-auto object-contain drop-shadow-lg" />
          )}
          <p className="text-[10px] uppercase tracking-widest text-teal-300">Aptitude Assessment</p>
          <h1 className="text-2xl font-bold text-white mt-1 leading-snug">KIRS Staff Internal Capability and Career Development Review</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Enter your access code</h2>
          <p className="text-xs text-slate-500 mb-5">
            Your invigilator issued a one-time access code. The test takes <strong>5 minutes</strong> and the
            countdown starts as soon as you begin.
          </p>

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}
            <Input
              label="Access code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FD-XXXXXX"
              autoFocus
              required
              disabled={checking}
              className="text-center font-mono tracking-widest uppercase"
            />
            <Button type="submit" size="lg" loading={busy} disabled={checking} className="w-full">
              {busy ? 'Starting…' : 'Begin test'}
            </Button>
          </form>

          <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600">
            <p className="font-medium text-slate-700 mb-1">What to expect</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Part 1 — your personal details (50%)</li>
              <li>Part 2 — 5 questions on Excel, Word &amp; Cybersecurity (50%)</li>
              <li>When the 5 minutes end, the test submits automatically</li>
            </ul>
          </div>
        </div>

        <p className="text-center text-xs text-white/50 mt-5">
          Administrator?{' '}
          <Link href="/assessment/admin" className="text-teal-300 hover:underline font-medium">
            Results dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
