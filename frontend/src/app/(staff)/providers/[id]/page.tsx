'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import LoadingSpinner from '@/components/LoadingSpinner';
import ProviderUploadsModal from '@/components/providers/ProviderUploadsModal';
import PasswordInput from '@/components/PasswordInput';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { providersApi, type Provider, type ProviderUserRecord } from '@/lib/api/providers';
import { complianceApi, type ProviderCompliance, type PeriodStatus } from '@/lib/api/compliance';
import { PROVIDER_STATUSES, PROVIDER_USER_ROLES, SECTION_29_PROVIDER_TYPES, formatDate, formatDateTime, statusBadge, extractErrorMessage } from '@/lib/utils';

type Params = Promise<{ id: string }>;

const CURRENT_YEAR = new Date().getFullYear();

/** Naira, formatted exactly as /compliance and /providers do — one house style for money. */
function ngn(n: number | undefined | null): string {
  return `₦${Math.round(Number(n ?? 0)).toLocaleString('en-NG')}`;
}
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

const PERIOD_META: Record<PeriodStatus, { bg: string; label: string; text: string; ring: string }> = {
  ON_TIME: { bg: 'bg-emerald-500', label: 'On time', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  LATE:    { bg: 'bg-amber-500',   label: 'Late',    text: 'text-amber-700',   ring: 'ring-amber-200' },
  MISSING: { bg: 'bg-rose-500',    label: 'Missing', text: 'text-rose-700',    ring: 'ring-rose-200' },
  PENDING: { bg: 'bg-slate-200',   label: 'Not due', text: 'text-slate-500',   ring: 'ring-slate-200' },
};
const compColor = (r: number) => (r >= 80 ? 'text-emerald-700' : r >= 50 ? 'text-amber-600' : 'text-rose-700');
const compBar = (r: number) => (r >= 80 ? 'bg-emerald-500' : r >= 50 ? 'bg-amber-500' : 'bg-rose-500');

export default function ProviderDetailPage({ params }: { params: Params }) {
  const { id } = usePromise(params);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showUploads, setShowUploads] = useState(false);
  const [resetFor, setResetFor] = useState<ProviderUserRecord | null>(null);

  const [year, setYear] = useState(CURRENT_YEAR);
  const [compliance, setCompliance] = useState<ProviderCompliance | null>(null);
  // Distinguish "still fetching" from "fetched, no row" so a non-ACTIVE provider
  // doesn't render the loading state forever (it never had a compliance row).
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [issuedTotal, setIssuedTotal] = useState(0);

  const refresh = () => {
    setLoading(true);
    providersApi.get(id).then(setProvider).catch((err) => setError(extractErrorMessage(err))).finally(() => setLoading(false));
  };
  useEffect(refresh, [id]);

  const toggleActive = async (u: ProviderUserRecord) => {
    setError(null);
    try { await providersApi.updateUser(u.id, { isActive: !u.isActive }); refresh(); }
    catch (e) { setError(extractErrorMessage(e)); }
  };

  // Per-provider compliance for the selected year.
  useEffect(() => {
    setComplianceLoading(true);
    setCompliance(null);
    complianceApi.list(year)
      .then((rows) => setCompliance(rows.find((r) => r.provider.id === id) ?? null))
      .catch(() => setCompliance(null))
      .finally(() => setComplianceLoading(false));
  }, [id, year]);

  // What has actually been ASSESSED against this provider — waived penalties
  // excluded, since a waived penalty is no longer a liability.
  useEffect(() => {
    complianceApi.penalties({ providerId: id, year })
      .then((ps) => setIssuedTotal(ps.filter((p) => p.status !== 'WAIVED').reduce((s, p) => s + Number(p.amount ?? 0), 0)))
      .catch(() => setIssuedTotal(0));
  }, [id, year]);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (error || !provider) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/providers" className="text-sm text-slate-600 hover:text-slate-900">← All providers</Link>
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error ?? 'Not found'}</div>
      </div>
    );
  }

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const byQuarter: Record<string, PeriodStatus> = {};
  compliance?.periods.forEach((p) => { const m = p.period.match(/Q(\d)/); if (m) byQuarter[`Q${m[1]}`] = p.status; });
  const totalUploads = provider.submissions?.length ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ── Header banner ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-sky-900 px-7 py-6 mb-6 shadow-lg">
        <div className="pointer-events-none absolute -top-10 -right-10 h-52 w-52 rounded-full bg-sky-500/10" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <Link href="/providers" className="text-xs text-sky-300 hover:text-sky-200">← All providers</Link>
            <h1 className="text-2xl font-bold text-white mt-1">{provider.name}</h1>
            <p className="text-sm text-slate-300 mt-1">
              {provider.providerType.replace(/_/g, ' ')} · <span className="font-mono">{provider.providerCode}</span>
              <span className={`ml-2 inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${statusBadge(provider.status)}`}>
                {provider.status.replace(/_/g, ' ')}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3 self-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Year</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                className="border border-slate-600 rounded-lg text-sm px-3 py-1.5 bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-sky-500">
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={() => setEditing((v) => !v)}
              className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur">
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <EditProviderForm provider={provider} onSaved={() => { setEditing(false); refresh(); }} onCancel={() => setEditing(false)} />
      )}

      {/* ── Compliance summary KPIs ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <MiniKpi label={`${year} compliance`} value={compliance ? `${compliance.complianceRate}%` : '—'}
          valueClass={compliance ? compColor(compliance.complianceRate) : 'text-slate-400'}
          hint={compliance ? `${compliance.onTime} on-time of ${compliance.expected}` : ''} />
        <MiniKpi label="Missing periods" value={compliance?.missing ?? '—'}
          valueClass={compliance && compliance.missing > 0 ? 'text-rose-700' : 'text-slate-700'}
          hint={compliance ? `${compliance.late} late · ${compliance.pending} not due` : ''} />
        <MiniKpi label={`${year} uploads`} value={compliance?.submissions ?? '—'}
          valueClass="text-sky-700" hint={`${totalUploads} all-time`} />
        <MiniKpi label="Rejection rate" value={compliance ? `${compliance.rejectionRate}%` : '—'}
          valueClass={compliance && compliance.rejectionRate > 10 ? 'text-amber-600' : 'text-slate-700'}
          hint="of submitted records" />
        {/* Same field (compliance.penaltyTotal), same wording and same number
            format as this provider's row on /compliance and /providers — one
            source, so the three screens cannot disagree. `assessed` is the
            separate, formally-issued figure; only that is a real liability. */}
        <MiniKpi label="Penalty exposure" value={compliance ? ngn(compliance.penaltyTotal) : '—'}
          valueClass={compliance && (compliance.penaltyTotal ?? 0) > 0 ? 'text-rose-700' : 'text-slate-700'}
          hint={issuedTotal > 0 ? `${ngn(issuedTotal)} assessed · accrued §101` : 'Accrued NTAA §101 — not yet assessed'} />
      </div>

      {/* ── Quarterly compliance timeline ─────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">{year} reporting timeline</h2>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            {(['ON_TIME', 'LATE', 'MISSING', 'PENDING'] as PeriodStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${PERIOD_META[s].bg}`} />{PERIOD_META[s].label}</span>
            ))}
          </div>
        </div>
        {complianceLoading ? (
          <p className="text-xs text-slate-400">Loading compliance…</p>
        ) : compliance === null ? (
          <p className="text-xs text-slate-400">No compliance data for this provider{provider.status !== 'ACTIVE' ? ` (${provider.status.toLowerCase()})` : ''} in {year}.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3 mb-4">
              {quarters.map((q) => {
                const st = byQuarter[q] ?? 'PENDING';
                const period = compliance.periods.find((p) => p.period.includes(q));
                return (
                  <div key={q} className={`rounded-xl border ring-1 ${PERIOD_META[st].ring} border-transparent p-4 text-center`}>
                    <div className={`mx-auto mb-2 h-8 w-8 rounded-lg ${PERIOD_META[st].bg}`} />
                    <p className="text-xs font-semibold text-slate-700">{q}</p>
                    <p className={`text-[11px] font-medium ${PERIOD_META[st].text}`}>{PERIOD_META[st].label}</p>
                    {period && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        due {formatDate(period.dueAt)}{period.receivedAt ? ` · got ${formatDate(period.receivedAt)}` : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full ${compBar(compliance.complianceRate)}`} style={{ width: `${compliance.complianceRate}%` }} />
              </div>
              <span className={`text-xs font-semibold ${compColor(compliance.complianceRate)}`}>{compliance.complianceRate}% compliant</span>
            </div>
          </>
        )}
      </div>

      {/* ── Details + Uploads action ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Info label="Reporting frequency" value={provider.reportingFrequency ?? '—'} />
          <Info label="Contact email" value={provider.contactEmail ?? '—'} />
          <Info label="Contact phone" value={provider.contactPhone ?? '—'} />
          <Info label="Registered" value={formatDate(provider.createdAt)} />
          <Info label="Address" value={provider.address ?? '—'} className="md:col-span-2" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Submitted uploads</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{totalUploads}</p>
            <p className="text-xs text-slate-400 mt-1">Records behind step-up authorisation</p>
          </div>
          <button
            onClick={() => setShowUploads(true)}
            disabled={totalUploads === 0}
            className={`mt-3 px-4 py-2 text-sm font-semibold rounded-lg ${
              totalUploads > 0 ? 'bg-sky-600 hover:bg-sky-700 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {totalUploads > 0 ? '🔒 View uploads' : 'No uploads yet'}
          </button>
        </div>
      </div>

      {/* ── Portal users ──────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Portal users</h2>
          <button onClick={() => setShowUserForm((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg">
            {showUserForm ? 'Close' : '+ Add user'}
          </button>
        </div>
        {showUserForm && (
          <NewUserForm providerId={provider.id} onCreated={() => { setShowUserForm(false); refresh(); }} onCancel={() => setShowUserForm(false)} />
        )}
        {provider.users && provider.users.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Name', 'Email', 'Role', 'Last login', 'Status', 'Actions'].map((h) => (
                  <th key={h} className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase ${h === 'Actions' ? 'text-right' : ''}`}>{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {provider.users.map((u: ProviderUserRecord) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-xs">{u.role.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'never'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setResetFor(u)} className="text-xs font-medium text-teal-700 hover:text-teal-900">Reset password</button>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <button onClick={() => toggleActive(u)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                        {u.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-8 text-center text-xs text-slate-400">
            No portal users yet — add one so the provider can sign in to upload.
          </div>
        )}
      </section>

      {/* ── Recent submissions ────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Recent submissions</h2>
          <Link href={`/submissions?providerId=${provider.id}`} className="text-xs text-teal-700 hover:underline font-medium">View all →</Link>
        </div>
        {provider.submissions && provider.submissions.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>{['Period', 'File', 'Status', 'Records', 'Date'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {provider.submissions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{s.periodLabel}</td>
                    <td className="px-4 py-3 text-xs">
                      <Link href={`/submissions/${s.id}`} className="text-teal-700 hover:underline">{s.fileName ?? s.id.slice(0, 8)}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(s.status)}`}>{s.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">{s.acceptedCount}/{s.recordCount}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-8 text-center text-xs text-slate-400">No submissions received yet.</div>
        )}
      </section>

      {showUploads && (
        <ProviderUploadsModal providerId={provider.id} providerName={provider.name} onClose={() => setShowUploads(false)} />
      )}

      {resetFor && (
        <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} onDone={() => { setResetFor(null); refresh(); }} />
      )}
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onDone }: { user: ProviderUserRecord; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    setBusy(true); setErr(null);
    try { await providersApi.resetUserPassword(user.id, pw); setDone(true); }
    catch (e) { setErr(extractErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Reset password — ${user.firstName} ${user.lastName}`}
      footer={
        done ? (
          <div className="flex justify-end">
            <Button onClick={onDone}>Done</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={busy} disabled={pw.length < 8}>Reset password</Button>
          </div>
        )
      }
    >
      <p className="-mt-1 text-xs text-[var(--ink-3)]">
        Set a temporary password. {user.email} will be <strong>forced to change it</strong> on their next login.
      </p>
      {done ? (
        <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
          Password reset. Share the temporary password securely — the user must change it on first login.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="reset-temp-password" className="block text-[10px] font-medium text-slate-500 mb-1 uppercase">Temporary password</label>
            <PasswordInput id="reset-temp-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} minLength={8}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

function MiniKpi({ label, value, hint, valueClass }: { label: string; value: string | number; hint: string; valueClass: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
}

function Info({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-4 ${className ?? ''}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm text-slate-800 mt-1">{value}</div>
    </div>
  );
}

function EditProviderForm({ provider, onSaved, onCancel }: { provider: Provider; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: provider.name, providerType: provider.providerType, contactEmail: provider.contactEmail ?? '', contactPhone: provider.contactPhone ?? '',
    address: provider.address ?? '', reportingFrequency: provider.reportingFrequency ?? 'QUARTERLY', status: provider.status,
  });
  // §29 allows switching only between financial-institution types. If this provider
  // is currently an out-of-scope legacy type, surface it (disabled) so the select
  // still shows the real value instead of silently defaulting to the first option.
  const typeOptions = SECTION_29_PROVIDER_TYPES.includes(provider.providerType as never)
    ? SECTION_29_PROVIDER_TYPES
    : [provider.providerType, ...SECTION_29_PROVIDER_TYPES];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await providersApi.update(provider.id, form); onSaved(); }
    catch (err) { setError(extractErrorMessage(err)); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 mb-6">
      {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
        <div><label className="block text-xs font-medium text-slate-700 mb-1">Provider type</label>
          <select value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            {typeOptions.map((t) => (
              <option key={t} value={t} disabled={!SECTION_29_PROVIDER_TYPES.includes(t as never)}>
                {t.replace(/_/g, ' ')}{!SECTION_29_PROVIDER_TYPES.includes(t as never) ? ' (out of §29 scope)' : ''}
              </option>
            ))}</select>
          <p className="mt-1 text-[11px] text-slate-400">Only §29 financial-institution types are selectable.</p></div>
        <div><label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            {PROVIDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-slate-700 mb-1">Contact email</label>
          <input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
        <div><label className="block text-xs font-medium text-slate-700 mb-1">Contact phone</label>
          <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
        <div className="md:col-span-2"><label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
        <div><label className="block text-xs font-medium text-slate-700 mb-1">Reporting frequency</label>
          <div className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600">Quarterly</div>
          <p className="mt-1 text-[11px] text-slate-400">Fixed — all §29 providers report quarterly.</p></div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">Cancel</button>
      </div>
    </form>
  );
}

function NewUserForm({ providerId, onCreated, onCancel }: { providerId: string; onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'COMPLIANCE_OFFICER', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await providersApi.createUser(providerId, form); onCreated(); }
    catch (err) { setError(extractErrorMessage(err)); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3 mb-4">
      {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <input required placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm col-span-2" />
        <PasswordInput required placeholder="Password (min 8 chars)" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" wrapperClassName="col-span-2" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          {PROVIDER_USER_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</select>
        <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">{busy ? 'Creating…' : 'Create user'}</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">Cancel</button>
      </div>
    </form>
  );
}
