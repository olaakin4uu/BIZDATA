'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { providersApi } from '@/lib/api/providers';
import { PROVIDER_TYPES, PROVIDER_STATUSES, extractErrorMessage } from '@/lib/utils';

const FREQUENCIES = ['QUARTERLY', 'MONTHLY', 'ANNUAL'];

export default function NewProviderPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    providerCode: '',
    name: '',
    providerType: 'BANK',
    contactEmail: '',
    contactPhone: '',
    address: '',
    reportingFrequency: 'QUARTERLY',
    status: 'PENDING_ONBOARDING',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const provider = await providersApi.create(form);
      router.push(`/providers/${provider.id}`);
    } catch (err) {
      setError(extractErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <PageHeader
        title="Register a new provider"
        subtitle="Banks, fintechs, processors, telcos, FX bureaus, POS aggregators, e-commerce."
        actions={
          <Link href="/providers" className="text-sm text-slate-600 hover:text-slate-900">
            ← Back to providers
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Provider code" required>
            <input
              required
              value={form.providerCode}
              onChange={(e) => update('providerCode', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g. GTB, OPAY, MTN"
            />
          </Field>
          <Field label="Provider type" required>
            <select
              value={form.providerType}
              onChange={(e) => update('providerType', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              {PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Display name" required className="md:col-span-2">
            <input
              required
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g. Guaranty Trust Bank"
            />
          </Field>
          <Field label="Contact email">
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => update('contactEmail', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </Field>
          <Field label="Contact phone">
            <input
              value={form.contactPhone}
              onChange={(e) => update('contactPhone', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </Field>
          <Field label="Address" className="md:col-span-2">
            <input
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </Field>
          <Field label="Reporting frequency">
            <select
              value={form.reportingFrequency}
              onChange={(e) => update('reportingFrequency', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Initial status">
            <select
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              {PROVIDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create provider'}
          </button>
          <Link
            href="/providers"
            className="px-5 py-2 border border-slate-300 text-sm rounded-lg hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
