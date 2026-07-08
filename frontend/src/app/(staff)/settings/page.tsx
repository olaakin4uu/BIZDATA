'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import PasswordInput from '@/components/PasswordInput';
import { tenantApi, type Tenant } from '@/lib/api/tenant';
import { statutoryApi, type StatutoryConfig, type StatutoryHistoryItem } from '@/lib/api/statutory';
import { integrationApi, type ApiKeyRecord, type NewApiKey } from '@/lib/api/integration';
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

          <section className="mb-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Statutory parameters</h2>
            <p className="text-xs text-slate-500 mb-3">
              The legal parameters that drive assessments. Editing creates a new version; every case records the version it used.
              Confirm these against the gazetted NTAA text before relying on them.
            </p>
            <StatutoryPanel />
          </section>

          <section className="mb-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Integration API keys</h2>
            <p className="text-xs text-slate-500 mb-3">
              Keys for partner platforms (e.g. a taxpayer portal) that call the BIZDATA taxpayer-integration API.
              A key is shown once at creation — copy it then.
            </p>
            <ApiKeysPanel />
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

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Two-factor authentication</h2>
            <p className="text-xs text-slate-500 mb-3">Add a second factor (an authenticator app) to your sign-in.</p>
            <TwoFactorPanel />
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

// Statutory parameters — versioned. Editing creates a new active version.
const STAT_FIELDS: { key: keyof StatutoryConfig; label: string; hint: string; kind: 'days' | 'rate' | 'money' }[] = [
  { key: 'reportingDueDays',      label: 'Reporting due (days after period end)', hint: '§29/§6.6 — provider filing deadline', kind: 'days' },
  { key: 'objectionWindowDays',   label: 'Objection window (days)',               hint: '§41 — taxpayer’s window to object', kind: 'days' },
  { key: 'authorityResponseDays', label: 'Authority response (days)',             hint: '§41(6) — else objection deemed upheld', kind: 'days' },
  { key: 'latePaymentPenaltyRate',label: 'Late-payment penalty rate',             hint: 'Fraction, e.g. 0.10 = 10%', kind: 'rate' },
  { key: 'citRate',               label: 'Company income tax rate',               hint: 'Fraction, e.g. 0.30 = 30%', kind: 'rate' },
  { key: 'citSmallCoThreshold',   label: 'Small-company CIT threshold (₦)',       hint: 'Turnover below which CIT is nil', kind: 'money' },
  { key: 'cgtRate',               label: 'Capital-gains tax rate',                hint: 'NTA §50 — fraction, e.g. 0.10 = 10%', kind: 'rate' },
  { key: 'defaultScanThreshold',  label: 'Default scan threshold',                hint: 'Discrepancy fraction to flag, e.g. 0.20', kind: 'rate' },
];

function StatutoryPanel() {
  const [cfg, setCfg] = useState<StatutoryConfig | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<StatutoryHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Enforcement date is handled apart from the numeric grid (it's a date, and can
  // be cleared to fall back to the built-in default).
  const [enforceDate, setEnforceDate] = useState('');

  const load = () => {
    statutoryApi.active().then((c) => {
      setCfg(c);
      const f: Record<string, string> = {};
      STAT_FIELDS.forEach(({ key }) => { f[key] = String(c[key]); });
      setForm(f);
      setEnforceDate(c.fieldEnforcementDate ?? '');
    }).catch(() => setCfg(null));
    statutoryApi.history().then(setHistory).catch(() => setHistory([]));
  };
  useEffect(load, []);

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const patch: any = { note: note || undefined };
      STAT_FIELDS.forEach(({ key }) => { patch[key] = Number(form[key]); });
      // Send the date explicitly ('' clears it back to the schema default).
      patch.fieldEnforcementDate = enforceDate.trim();
      const c = await statutoryApi.update(patch);
      setMsg(`Saved as version ${c.version}.`);
      setNote('');
      load();
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  if (!cfg) return <p className="text-xs text-slate-400">Loading…</p>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-teal-50 text-teal-700">Active: version {cfg.version}</span>
        <button onClick={() => setShowHistory((v) => !v)} className="text-xs text-teal-700 hover:underline">
          {showHistory ? 'Hide history' : `Version history (${history.length})`}
        </button>
      </div>

      {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}
      {msg && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {STAT_FIELDS.map(({ key, label, hint, kind }) => (
          <Field key={key} label={label} hint={hint}>
            <input
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value.replace(kind === 'money' ? /[^\d.]/g : /[^\d.]/g, '') })}
              inputMode="decimal"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
            />
          </Field>
        ))}
      </div>

      {/* Compulsory-field enforcement date — governs the sector/businessType/
          customerType grace period on provider submissions. */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <Field
          label="Compulsory-field enforcement date"
          hint="From this date, sector, businessType & customerType are rejected if blank on a provider submission. Before it, blanks are accepted with a warning. Leave empty to use the built-in default (2027-01-01)."
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={enforceDate}
              onChange={(e) => setEnforceDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
            />
            {enforceDate && (
              <button
                type="button"
                onClick={() => setEnforceDate('')}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 underline"
              >
                Clear (use default)
              </button>
            )}
            <span className="text-xs text-slate-500">
              {enforceDate
                ? (() => {
                    const days = Math.ceil((new Date(enforceDate).getTime() - Date.now()) / 86_400_000);
                    return days > 0 ? `enforced in ${days} day${days === 1 ? '' : 's'}` : 'enforced now';
                  })()
                : 'using default: 2027-01-01'}
            </span>
          </div>
        </Field>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Change note <span className="text-slate-400">(why — recorded with the version)</span></label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Penalty rate updated per 2026 Finance Act"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      </div>

      <button onClick={save} disabled={busy} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
        {busy ? 'Saving…' : 'Save as new version'}
      </button>

      {showHistory && (
        <div className="pt-3 border-t border-slate-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-1.5 font-medium">Version</th>
                <th className="py-1.5 font-medium">Penalty</th>
                <th className="py-1.5 font-medium">Due days</th>
                <th className="py-1.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((v) => (
                <tr key={v.version} className="border-t border-slate-50">
                  <td className="py-1.5">v{v.version}{v.isActive && <span className="ml-1 text-[10px] text-teal-700 font-semibold">ACTIVE</span>}</td>
                  <td className="py-1.5">{(v.latePaymentPenaltyRate * 100).toFixed(0)}%</td>
                  <td className="py-1.5">{v.reportingDueDays}</td>
                  <td className="py-1.5 text-slate-500">{v.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TwoFactorPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Enrolment state
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  // Codes shown once after enable / regenerate
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  // Disable / regenerate confirmation
  const [action, setAction] = useState<'disable' | 'regenerate' | null>(null);
  const [confirmCode, setConfirmCode] = useState('');

  const refresh = () => {
    authApi.staffMe()
      .then((u) => { setEnabled(!!u.mfaEnabled); setRemaining(u.recoveryCodesRemaining ?? 0); })
      .catch(() => setEnabled(false));
  };
  useEffect(refresh, []);

  const beginSetup = async () => {
    setBusy(true); setErr(null); setCodes(null);
    try { setSetup(await authApi.mfaSetup()); setEnrollCode(''); }
    catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const confirmEnable = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await authApi.mfaEnable(enrollCode.trim());
      setCodes(r.recoveryCodes);
      setSetup(null); setEnrollCode('');
      refresh();
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const runAction = async () => {
    setBusy(true); setErr(null);
    try {
      if (action === 'disable') {
        await authApi.mfaDisable(confirmCode.trim());
        setCodes(null);
      } else if (action === 'regenerate') {
        const r = await authApi.mfaRegenerateRecovery(confirmCode.trim());
        setCodes(r.recoveryCodes);
      }
      setAction(null); setConfirmCode('');
      refresh();
    } catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const copyCodes = () => {
    if (!codes) return;
    navigator.clipboard.writeText(codes.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 max-w-xl">
      {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}

      {enabled === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {enabled ? 'Two-factor is ON' : 'Two-factor is OFF'}
          </span>
          {enabled && <span className="text-xs text-slate-500">{remaining} recovery code{remaining === 1 ? '' : 's'} left</span>}
        </div>
      )}

      {/* Freshly generated recovery codes (shown once) */}
      {codes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">Save these recovery codes now — they won’t be shown again. Each works once if you lose your authenticator.</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-slate-800 mb-3">
            {codes.map((c) => <span key={c} className="tracking-wider">{c}</span>)}
          </div>
          <button onClick={copyCodes} className="text-xs font-medium px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
            {copied ? 'Copied ✓' : 'Copy all'}
          </button>
        </div>
      )}

      {/* OFF → start enrolment */}
      {enabled === false && !setup && (
        <button onClick={beginSetup} disabled={busy} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
          {busy ? 'Starting…' : 'Set up two-factor'}
        </button>
      )}

      {/* Enrolment: add the key to an authenticator app, then verify */}
      {setup && (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-800 mb-2">1. Add this account to your authenticator app</p>
          <p className="text-xs text-slate-500 mb-3">Google Authenticator, Authy, 1Password, Microsoft Authenticator — any TOTP app. Enter this setup key manually:</p>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 font-mono text-base bg-slate-50 border border-slate-200 rounded px-3 py-2 break-all tracking-[0.2em] text-slate-800">{setup.secret}</code>
            <button onClick={() => { navigator.clipboard.writeText(setup.secret); setSecretCopied(true); setTimeout(() => setSecretCopied(false), 1500); }}
              className="text-xs font-medium px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg whitespace-nowrap">
              {secretCopied ? 'Copied ✓' : 'Copy key'}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            On a phone, you can also{' '}
            <a href={setup.otpauth} className="text-teal-700 hover:underline font-medium">tap to open your authenticator</a>.
            {' '}Account: <span className="font-mono">BizData</span> · type: time-based · 6 digits.
          </p>

          <p className="text-sm font-medium text-slate-800 mt-4 mb-2">2. Enter the 6-digit code to confirm</p>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric" maxLength={6} value={enrollCode} autoFocus
              onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button onClick={confirmEnable} disabled={busy || enrollCode.length !== 6} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {busy ? 'Verifying…' : 'Verify & enable'}
            </button>
            <button onClick={() => { setSetup(null); setErr(null); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}

      {/* ON → manage */}
      {enabled === true && !action && (
        <div className="flex items-center gap-3 pt-1">
          <button onClick={() => { setAction('regenerate'); setConfirmCode(''); setCodes(null); setErr(null); }} className="text-sm font-medium text-teal-700 hover:text-teal-800">
            Regenerate recovery codes
          </button>
          <span className="text-slate-300">·</span>
          <button onClick={() => { setAction('disable'); setConfirmCode(''); setCodes(null); setErr(null); }} className="text-sm font-medium text-rose-600 hover:text-rose-700">
            Turn off two-factor
          </button>
        </div>
      )}

      {/* Confirm disable / regenerate with a current code */}
      {action && (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-700 mb-2">
            {action === 'disable'
              ? 'Enter a current authenticator or recovery code to turn off two-factor.'
              : 'Enter a current authenticator code to generate a new set (the old codes stop working).'}
          </p>
          <div className="flex items-center gap-2">
            <input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder={action === 'disable' ? 'code or recovery code' : '000000'}
              className="w-56 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button onClick={runAction} disabled={busy || confirmCode.trim().length < 6}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 ${action === 'disable' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
              {busy ? 'Working…' : action === 'disable' ? 'Turn off' : 'Regenerate'}
            </button>
            <button onClick={() => { setAction(null); setErr(null); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<NewApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => { integrationApi.listKeys().then(setKeys).catch(() => setKeys([])); };
  useEffect(load, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setErr(null); setNewKey(null);
    try { const k = await integrationApi.createKey(name.trim()); setNewKey(k); setName(''); load(); }
    catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setErr(null);
    try { await integrationApi.revokeKey(id); load(); } catch (e) { setErr(extractErrorMessage(e)); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      {err && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err}</div>}

      {newKey && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800 mb-1">Copy this key now — it won’t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-white border border-amber-200 rounded px-2 py-1.5 break-all">{newKey.apiKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(newKey.apiKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-xs font-medium px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg whitespace-nowrap">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-700 mb-1">Partner name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FCT-IRS Taxpayer Portal"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <button onClick={create} disabled={busy || !name.trim()}
          className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50">
          {busy ? 'Creating…' : '+ New key'}
        </button>
      </div>

      {keys.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-1.5 font-medium">Partner</th>
              <th className="py-1.5 font-medium">Key</th>
              <th className="py-1.5 font-medium">Status</th>
              <th className="py-1.5 font-medium">Last used</th>
              <th className="py-1.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-slate-50">
                <td className="py-1.5 font-medium text-slate-700">{k.name}</td>
                <td className="py-1.5 font-mono text-slate-500">{k.keyPrefix}…</td>
                <td className="py-1.5">
                  <span className={`px-2 py-0.5 rounded-full ${k.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {k.isActive ? 'Active' : 'Revoked'}
                  </span>
                </td>
                <td className="py-1.5 text-slate-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'never'}</td>
                <td className="py-1.5 text-right">
                  {k.isActive && <button onClick={() => revoke(k.id)} className="text-rose-600 hover:text-rose-800 font-medium">Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
