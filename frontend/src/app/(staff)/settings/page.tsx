'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import PasswordInput from '@/components/PasswordInput';
import { tenantApi, type Tenant } from '@/lib/api/tenant';
import { authApi } from '@/lib/api/auth';
import { applyBrandColor } from '@/lib/brand';
import { extractErrorMessage } from '@/lib/utils';

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    shortName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    themeColor: '#0f766e',
    scanThreshold: '0.2',
  });
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    tenantApi.get()
      .then((t) => {
        setTenant(t);
        setForm({
          name: t.name,
          shortName: t.shortName,
          contactEmail: t.contactEmail ?? '',
          contactPhone: t.contactPhone ?? '',
          address: t.address ?? '',
          themeColor: t.themeColor ?? '#0f766e',
          scanThreshold: String(t.scanThreshold),
        });
      })
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const saveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveBusy(true); setSaveErr(null); setSaveMsg(null);
    try {
      const updated = await tenantApi.update({
        name: form.name,
        shortName: form.shortName,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        address: form.address || null,
        themeColor: form.themeColor || null,
        scanThreshold: form.scanThreshold,
      });
      setTenant(updated);
      applyBrandColor(updated.themeColor);
      setSaveMsg('Settings saved.');
    } catch (err) {
      setSaveErr(extractErrorMessage(err));
    } finally {
      setSaveBusy(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true); setPwErr(null); setPwMsg(null);
    if (pwForm.newPassword.length < 8) { setPwErr('New password must be at least 8 characters'); setPwBusy(false); return; }
    if (pwForm.newPassword !== pwForm.confirm) { setPwErr('Passwords do not match'); setPwBusy(false); return; }
    try {
      await authApi.changeStaffPassword(pwForm.currentPassword, pwForm.newPassword);
      setPwMsg('Password updated.');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwErr(extractErrorMessage(err));
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title="Settings" subtitle="Tenant profile and your account preferences." />

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      ) : (
        <>
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Organisation logo</h2>
            <LogoUpload tenant={tenant} onChange={(logoUrl) => setTenant(tenant ? { ...tenant, logoUrl } : tenant)} />

            <h2 className="text-sm font-semibold text-slate-800 mb-3 mt-6">Tenant</h2>
            <form onSubmit={saveTenant} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              {saveErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{saveErr}</div>}
              {saveMsg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{saveMsg}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
                <Field label="Short name"><input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
                <Field label="Contact email"><input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
                <Field label="Contact phone"><input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
                <Field label="Address" className="md:col-span-2"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
                <Field label="Theme colour" hint="Hex code, e.g. #0f766e — re-skins the app live">
                  <div className="flex items-center gap-2">
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.themeColor) ? form.themeColor : '#0f766e'}
                      onChange={(e) => { setForm({ ...form, themeColor: e.target.value }); applyBrandColor(e.target.value); }}
                      className="h-9 w-12 rounded border border-slate-300 bg-white p-0.5 cursor-pointer" />
                    <input value={form.themeColor}
                      onChange={(e) => { setForm({ ...form, themeColor: e.target.value }); applyBrandColor(e.target.value); }}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
                  </div>
                </Field>
                <Field label="Default scan threshold" hint="0–1 (e.g. 0.20 = 20%)">
                  <input value={form.scanThreshold} onChange={(e) => setForm({ ...form, scanThreshold: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </Field>
              </div>
              <button type="submit" disabled={saveBusy} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {saveBusy ? 'Saving…' : 'Save settings'}
              </button>
            </form>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Change your password</h2>
            <form onSubmit={changePassword} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3 max-w-sm">
              {pwErr && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{pwErr}</div>}
              {pwMsg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{pwMsg}</div>}
              <Field label="Current password"><PasswordInput required value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
              <Field label="New password" hint="At least 8 characters."><PasswordInput required minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
              <Field label="Confirm new password"><PasswordInput required value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></Field>
              <button type="submit" disabled={pwBusy} className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {pwBusy ? 'Updating…' : 'Change password'}
              </button>
            </form>
          </section>
        </>
      )}

      {tenant && (
        <p className="text-xs text-slate-400 mt-6">Tenant ID: <span className="font-mono">{tenant.id}</span></p>
      )}
    </div>
  );
}

function LogoUpload({ tenant, onChange }: { tenant: Tenant | null; onChange: (logoUrl: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const r = await tenantApi.uploadLogo(file);
      onChange(r.logoUrl);
    } catch (e2) {
      setErr(extractErrorMessage(e2));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-center gap-5">
      <div className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
        {tenant?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logoUrl} alt="Organisation logo" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-[10px] uppercase tracking-widest text-slate-400 text-center px-2">No logo</span>
        )}
      </div>
      <div>
        <label className="inline-block px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg cursor-pointer">
          {busy ? 'Uploading…' : tenant?.logoUrl ? 'Replace logo' : 'Upload logo'}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" disabled={busy} onChange={onFile} />
        </label>
        <p className="text-xs text-slate-400 mt-2">PNG, JPEG, SVG or WebP · max 1&nbsp;MB. Appears on the sign-in screen.</p>
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </div>
    </div>
  );
}

function Field({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
