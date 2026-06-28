'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { providerPortalApi } from '@/lib/api/provider-portal';
import type { ProviderUser } from '@/lib/api/auth';
import { useProviderAuthStore } from '@/store/providerAuthStore';
import { extractErrorMessage, formatDateTime, statusBadge } from '@/lib/utils';

export default function ProviderProfilePage() {
  const setUser = useProviderAuthStore((s) => s.setUser);
  const [me, setMe] = useState<ProviderUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    providerPortalApi.me()
      .then((m) => { setMe(m); setUser(m); })
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [setUser]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr(null); setPwMsg(null);
    if (pwForm.newPassword.length < 8) { setPwErr('New password must be at least 8 characters'); return; }
    if (pwForm.newPassword !== pwForm.confirm) { setPwErr('Passwords do not match'); return; }
    setPwBusy(true);
    try {
      await providerPortalApi.changePassword(pwForm.currentPassword, pwForm.newPassword);
      setPwMsg('Password updated.');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwErr(extractErrorMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!me) return (
    <div>
      <PageHeader title="Profile" />
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error ?? 'Could not load profile'}</div>
    </div>
  );

  const providerName = me.provider?.name ?? me.providerName ?? '—';

  return (
    <div>
      <PageHeader title="Profile" subtitle="Account and organisation details." />

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">You</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Info label="Name" value={`${me.firstName} ${me.lastName}`} />
          <Info label="Email" value={me.email} />
          <Info label="Role" value={me.role.replace('_', ' ')} />
          <Info label="Last login" value={formatDateTime(me.lastLoginAt)} />
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Organisation</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Info label="Provider" value={providerName} />
          <Info label="Code" value={me.provider?.providerCode ?? '—'} />
          <Info label="Type" value={me.provider?.providerType?.replace('_', ' ') ?? '—'} />
          <Info label="Reporting frequency" value={me.provider?.reportingFrequency ?? '—'} />
          {me.provider && (
            <Info label="Status" value={
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(me.provider.status)}`}>
                {me.provider.status.replace('_', ' ')}
              </span>
            } />
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Change password</h2>
        <form onSubmit={changePassword} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-sm space-y-3">
          {pwErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{pwErr}</div>}
          {pwMsg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{pwMsg}</div>}
          <Field label="Current password">
            <input type="password" required value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input type="password" required minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <Field label="Confirm new password">
            <input type="password" required value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <button type="submit" disabled={pwBusy} className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {pwBusy ? 'Updating…' : 'Change password'}
          </button>
        </form>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-slate-800 mt-1">{value}</div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
