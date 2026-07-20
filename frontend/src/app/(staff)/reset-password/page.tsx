'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PasswordInput from '@/components/PasswordInput';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { authApi } from '@/lib/api/auth';
import { extractErrorMessage } from '@/lib/utils';
import { APP_NAME } from '@/lib/appName';

// Shared staff password policy — kept identical to the admin-forced change-password
// page so the two flows enforce the same minimum and show the same strength cue.
const MIN_PASSWORD = 10;
function scorePassword(pw: string): number {
  let s = 0;
  if (pw.length >= MIN_PASSWORD) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return s; // 0–4
}
const STRENGTH = [
  { label: 'Very weak', tone: 'var(--bad)' },
  { label: 'Weak', tone: 'var(--bad)' },
  { label: 'Fair', tone: 'var(--warn)' },
  { label: 'Good', tone: 'var(--ok)' },
  { label: 'Strong', tone: 'var(--ok)' },
];
function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const score = scorePassword(value);
  const { label, tone } = STRENGTH[score];
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i < score ? tone : 'var(--line)' }} />
        ))}
      </div>
      <p className="mt-1 text-[11px]" style={{ color: tone }}>
        {label} · use 12+ characters with a mix of cases, numbers &amp; symbols
      </p>
    </div>
  );
}

// Staff password reset, reached from the emailed link (/reset-password?token=…).
// On success the user signs in with the new password. Wrapped in Suspense
// because useSearchParams requires it.
function StaffResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [form, setForm] = useState({ newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!token) { setErr('This reset link is invalid. Request a new one.'); return; }
    if (form.newPassword.length < MIN_PASSWORD) { setErr(`New password must be at least ${MIN_PASSWORD} characters`); return; }
    if (form.newPassword !== form.confirm) { setErr('Passwords do not match'); return; }
    setBusy(true);
    try {
      await authApi.staffResetPassword(token, form.newPassword);
      setDone(true);
      setTimeout(() => { window.location.href = '/login'; }, 1500);
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
          <h1 className="text-lg font-semibold text-slate-800 mb-1">Choose a new password</h1>
          <p className="text-xs text-slate-500 mb-5">Set a new password for your {APP_NAME} account.</p>

          {done ? (
            <div className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
              Password set. Redirecting you to sign in…
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
              {!token && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  This link is missing its token. <Link href="/forgot-password" className="underline font-medium">Request a new link</Link>.
                </div>
              )}
              <div>
                <Field id="new-password" label="New password">
                  <PasswordInput id="new-password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={form.newPassword}
                    onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--line)] rounded-lg text-sm bg-[var(--surface)] text-[var(--ink)]" />
                </Field>
                <PasswordStrength value={form.newPassword} />
              </div>
              <Field id="confirm-password" label="Confirm new password">
                <PasswordInput id="confirm-password" required autoComplete="new-password" value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--line)] rounded-lg text-sm bg-[var(--surface)] text-[var(--ink)]" />
              </Field>
              <Button type="submit" size="lg" loading={busy} disabled={!token} className="w-full">
                {busy ? 'Setting…' : 'Set new password'}
              </Button>
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

export default function StaffResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>}>
      <StaffResetPasswordInner />
    </Suspense>
  );
}
