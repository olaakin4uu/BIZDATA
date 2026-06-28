'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { taxpayersApi } from '@/lib/api/taxpayers';
import { TAXPAYER_TYPES, TAXPAYER_STATUSES, extractErrorMessage } from '@/lib/utils';

export default function NewTaxpayerPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    type: 'INDIVIDUAL' as 'INDIVIDUAL' | 'CORPORATE' | 'GOVERNMENT',
    status: 'ACTIVE',
    nin: '',
    cacRcNumber: '',
    tin: '',
    firstName: '',
    lastName: '',
    middleName: '',
    businessName: '',
    phone: '',
    email: '',
    address: '',
    stateOfResidence: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== ''),
      );
      const tp = await taxpayersApi.create(payload);
      router.push(`/taxpayers/${tp.id}`);
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  };

  const isIndividual = form.type === 'INDIVIDUAL';

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <PageHeader
        title="Register new taxpayer"
        actions={<Link href="/taxpayers" className="text-sm text-slate-600 hover:text-slate-900">← Back</Link>}
      />
      <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Type" required>
            <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'INDIVIDUAL' | 'CORPORATE' | 'GOVERNMENT' })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              {TAXPAYER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
              {TAXPAYER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="NIN">
            <input value={form.nin} onChange={(e) => setForm({ ...form, nin: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <Field label="CAC RC number">
            <input value={form.cacRcNumber} onChange={(e) => setForm({ ...form, cacRcNumber: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <Field label="TIN" className="md:col-span-2">
            <input value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>

          {isIndividual ? (
            <>
              <Field label="First name">
                <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </Field>
              <Field label="Last name">
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </Field>
              <Field label="Middle name" className="md:col-span-2">
                <input value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </Field>
            </>
          ) : (
            <Field label="Business name" className="md:col-span-2">
              <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </Field>
          )}

          <Field label="Phone">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <Field label="State of residence">
            <input value={form.stateOfResidence} onChange={(e) => setForm({ ...form, stateOfResidence: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
          <Field label="Address">
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </Field>
        </div>

        <p className="text-xs text-slate-500">At least one of NIN or CAC RC number is required.</p>

        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
            {busy ? 'Creating…' : 'Create taxpayer'}
          </button>
          <Link href="/taxpayers" className="px-5 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
