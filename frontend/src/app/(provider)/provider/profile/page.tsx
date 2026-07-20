'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import PasswordInput from '@/components/PasswordInput';
import Icon, { type IconName } from '@/components/Icon';
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
      // Clear the forced-change flag locally so the layout guard releases the
      // provider to the rest of the portal (the backend already cleared it).
      if (me?.mustChangePassword) setUser({ ...me, mustChangePassword: false });
    } catch (err) {
      setPwErr(extractErrorMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!me) return (
    <div>
      <PageHeader title="Profile" icon="settings" />
      <div className="rounded-lg border border-rose-200 bg-[var(--bad-soft)] px-4 py-3 text-sm text-rose-700">{error ?? 'Could not load profile'}</div>
    </div>
  );

  const providerName = me.provider?.name ?? me.providerName ?? '—';

  return (
    <div className="rise-in">
      <PageHeader title="Profile" subtitle="Account and organisation details." icon="settings" />

      <section className="mb-6">
        <SectionTitle icon="taxpayers">You</SectionTitle>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="Name" value={`${me.firstName} ${me.lastName}`} />
          <Info label="Email" value={me.email} />
          <Info label="Role" value={me.role.replace(/_/g, ' ')} />
          <Info label="Last login" value={formatDateTime(me.lastLoginAt)} />
        </div>
      </section>

      <section className="mb-6">
        <SectionTitle icon="bank">Organisation</SectionTitle>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Info label="Provider" value={providerName} />
          <Info label="Code" value={me.provider?.providerCode ?? '—'} />
          <Info label="Type" value={me.provider?.providerType?.replace(/_/g, ' ') ?? '—'} />
          <Info label="Reporting frequency" value={me.provider?.reportingFrequency ?? '—'} />
          {me.provider && (
            <Info label="Status" value={
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(me.provider.status)}`}>
                {me.provider.status.replace(/_/g, ' ')}
              </span>
            } />
          )}
        </div>
      </section>

      <section>
        <SectionTitle icon="unlock">Change password</SectionTitle>
        <form onSubmit={changePassword} className="mt-3 max-w-sm space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--elev-1)]">
          {pwErr && <div className="rounded-lg border border-rose-200 bg-[var(--bad-soft)] px-3 py-2 text-sm text-rose-700">{pwErr}</div>}
          {pwMsg && <div className="rounded-lg border border-emerald-200 bg-[var(--ok-soft)] px-3 py-2 text-sm text-emerald-700">{pwMsg}</div>}
          <Field label="Current password">
            <PasswordInput required value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm transition-colors focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <PasswordInput required minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm transition-colors focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput required value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm transition-colors focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
          </Field>
          <button type="submit" disabled={pwBusy}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:hover:brightness-100"
            style={{ backgroundImage: 'var(--brand-grad)', boxShadow: 'var(--elev-brand)' }}>
            {pwBusy ? 'Updating…' : 'Change password'}
          </button>
        </form>
      </section>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
        <Icon name={icon} width={14} height={14} />
      </span>
      {children}
    </h2>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="lift rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--elev-1)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">{label}</p>
      <div className="mt-1 text-sm text-[var(--ink)]">{value}</div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-[var(--ink-3)]">{hint}</p>}
    </div>
  );
}
