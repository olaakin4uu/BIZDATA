'use client';
import { useEffect, useState, use as usePromise } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import LoadingSpinner from '@/components/LoadingSpinner';
import { providersApi, type Provider, type ProviderUserRecord } from '@/lib/api/providers';
import { PROVIDER_STATUSES, PROVIDER_USER_ROLES, formatDate, statusBadge, extractErrorMessage } from '@/lib/utils';

type Params = Promise<{ id: string }>;

export default function ProviderDetailPage({ params }: { params: Params }) {
  const { id } = usePromise(params);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);

  const refresh = () => {
    setLoading(true);
    providersApi
      .get(id)
      .then(setProvider)
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [id]);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;
  if (error || !provider) {
    return (
      <div className="p-6">
        <PageHeader title="Provider" actions={<Link href="/providers" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>} />
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error ?? 'Not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={provider.name}
        subtitle={`${provider.providerType.replace('_', ' ')} · ${provider.providerCode}`}
        actions={
          <>
            <Link href="/providers" className="text-sm text-slate-600 hover:text-slate-900">
              ← All providers
            </Link>
            <button
              onClick={() => setEditing((v) => !v)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              {editing ? 'Cancel edit' : 'Edit'}
            </button>
          </>
        }
      />

      {editing ? (
        <EditProviderForm provider={provider} onSaved={() => { setEditing(false); refresh(); }} onCancel={() => setEditing(false)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Info label="Status" value={
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(provider.status)}`}>
              {provider.status.replace('_', ' ')}
            </span>
          } />
          <Info label="Reporting frequency" value={provider.reportingFrequency ?? '—'} />
          <Info label="Contact email" value={provider.contactEmail ?? '—'} />
          <Info label="Contact phone" value={provider.contactPhone ?? '—'} />
          <Info label="Address" value={provider.address ?? '—'} className="md:col-span-2" />
          <Info label="Registered" value={formatDate(provider.createdAt)} />
          <Info label="Last updated" value={formatDate(provider.updatedAt)} />
        </div>
      )}

      {/* Provider Users */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Portal users</h2>
          <button
            onClick={() => setShowUserForm((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
          >
            {showUserForm ? 'Close' : '+ Add user'}
          </button>
        </div>

        {showUserForm && (
          <NewUserForm
            providerId={provider.id}
            onCreated={() => { setShowUserForm(false); refresh(); }}
            onCancel={() => setShowUserForm(false)}
          />
        )}

        {provider.users && provider.users.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Name', 'Email', 'Role', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {provider.users.map((u: ProviderUserRecord) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-xs">{u.role.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
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

      {/* Recent submissions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-800">Recent submissions</h2>
          <Link href={`/submissions?providerId=${provider.id}`} className="text-xs text-teal-700 hover:underline font-medium">
            View all →
          </Link>
        </div>
        {provider.submissions && provider.submissions.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Period', 'File', 'Status', 'Records', 'Date'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {provider.submissions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{s.periodLabel}</td>
                    <td className="px-4 py-3 text-xs">
                      <Link href={`/submissions/${s.id}`} className="text-teal-700 hover:underline">
                        {s.fileName ?? s.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{s.acceptedCount}/{s.recordCount}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-8 text-center text-xs text-slate-400">
            No submissions received yet.
          </div>
        )}
      </section>
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

function EditProviderForm({
  provider,
  onSaved,
  onCancel,
}: {
  provider: Provider;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: provider.name,
    contactEmail: provider.contactEmail ?? '',
    contactPhone: provider.contactPhone ?? '',
    address: provider.address ?? '',
    reportingFrequency: provider.reportingFrequency ?? 'QUARTERLY',
    status: provider.status,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await providersApi.update(provider.id, form);
      onSaved();
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 mb-6">
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            {PROVIDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Contact email</label>
          <input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Contact phone</label>
          <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Reporting frequency</label>
          <select value={form.reportingFrequency} onChange={(e) => setForm({ ...form, reportingFrequency: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="QUARTERLY">QUARTERLY</option>
            <option value="MONTHLY">MONTHLY</option>
            <option value="ANNUAL">ANNUAL</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

function NewUserForm({
  providerId,
  onCreated,
  onCancel,
}: {
  providerId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'COMPLIANCE_OFFICER',
    phone: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await providersApi.createUser(providerId, form);
      onCreated();
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3 mb-4">
      {error && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <input required placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm col-span-2" />
        <input required type="password" placeholder="Password (min 8 chars)" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm col-span-2" />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          {PROVIDER_USER_ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
        <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
          {busy ? 'Creating…' : 'Create user'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
