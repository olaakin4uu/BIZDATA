'use client';
import PageHeader from '@/components/PageHeader';
import ChangePasswordPanel from '@/components/account/ChangePasswordPanel';
import TwoFactorPanel from '@/components/account/TwoFactorPanel';

// Personal "Account & security" page, reached from the user menu (top-right).
// Holds the things that belong to the signed-in user rather than the tenant:
// their password and their two-factor setup. Tenant/org settings live under
// Settings.
export default function AccountPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title="Account & security" subtitle="Your password and sign-in security." />

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Change your password</h2>
        <ChangePasswordPanel />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Two-factor authentication</h2>
        <p className="text-xs text-slate-500 mb-3">Add a second factor (an authenticator app) to your sign-in.</p>
        <TwoFactorPanel />
      </section>
    </div>
  );
}
