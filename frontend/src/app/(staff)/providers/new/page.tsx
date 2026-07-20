'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { providersApi } from '@/lib/api/providers';
import { SECTION_29_PROVIDER_TYPES, PROVIDER_STATUSES, extractErrorMessage } from '@/lib/utils';

type FieldKey =
  | 'providerCode'
  | 'name'
  | 'providerType'
  | 'contactEmail'
  | 'contactPhone'
  | 'address'
  | 'status';

type FieldErrors = Partial<Record<FieldKey, string>>;

// Visual/DOM order, used to pick the first field to scroll to on a failed submit.
const FIELD_ORDER: FieldKey[] = [
  'providerCode',
  'providerType',
  'name',
  'contactEmail',
  'contactPhone',
  'address',
  'status',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Best-effort map a server validation message to the field it concerns.
function mapServerError(message: string): FieldKey | null {
  const m = message.toLowerCase();
  if (m.includes('code')) return 'providerCode';
  if (m.includes('email')) return 'contactEmail';
  if (m.includes('phone')) return 'contactPhone';
  if (m.includes('type')) return 'providerType';
  if (m.includes('address')) return 'address';
  if (m.includes('name')) return 'name';
  return null;
}

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const update = (k: FieldKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Clear a field's error as the user edits it.
    setFieldErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
  };

  const scrollToFirstError = (errs: FieldErrors) => {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (!first) return;
    const el = document.getElementById(`pv-${first}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (el as HTMLElement).focus();
    }
  };

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!form.providerCode.trim()) errs.providerCode = 'Provider code is required.';
    if (!form.name.trim()) errs.name = 'Display name is required.';
    if (form.contactEmail.trim() && !EMAIL_RE.test(form.contactEmail.trim())) {
      errs.contactEmail = 'Enter a valid email address.';
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setError(null);
      setFieldErrors(errs);
      scrollToFirstError(errs);
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const provider = await providersApi.create(form);
      router.push(`/providers/${provider.id}`);
    } catch (err) {
      const message = extractErrorMessage(err);
      const field = mapServerError(message);
      if (field) {
        const mapped = { [field]: message } as FieldErrors;
        setFieldErrors(mapped);
        scrollToFirstError(mapped);
      } else {
        setError(message);
      }
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <PageHeader
        title="Register a new provider"
        subtitle="Banks, fintechs, processors, telcos, FX bureaus, POS aggregators, e-commerce."
        actions={
          <Link href="/providers" className="text-sm text-[var(--ink-2)] hover:text-[var(--ink)]">
            ← Back to providers
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="bg-[var(--surface)] rounded-xl border border-[var(--line)] shadow-sm p-6 space-y-4">
        {error && (
          <div className="px-3 py-2 bg-[var(--bad-soft)] border border-[var(--bad)] rounded-lg text-sm text-[var(--bad)]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            id="pv-providerCode"
            label="Provider code"
            required
            value={form.providerCode}
            onChange={(e) => update('providerCode', e.target.value)}
            error={fieldErrors.providerCode}
            placeholder="e.g. GTB, OPAY, MTN"
          />
          <Select
            id="pv-providerType"
            label="Provider type"
            required
            value={form.providerType}
            onChange={(e) => update('providerType', e.target.value)}
            error={fieldErrors.providerType}
            hint={fieldErrors.providerType ? undefined : 'Only NTAA §29 financial institutions can be onboarded.'}
          >
            {SECTION_29_PROVIDER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
          <Input
            id="pv-name"
            label="Display name"
            required
            wrapperClassName="md:col-span-2"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            error={fieldErrors.name}
            placeholder="e.g. Guaranty Trust Bank"
          />
          <Input
            id="pv-contactEmail"
            label="Contact email"
            type="email"
            autoComplete="email"
            value={form.contactEmail}
            onChange={(e) => update('contactEmail', e.target.value)}
            error={fieldErrors.contactEmail}
          />
          <Input
            id="pv-contactPhone"
            label="Contact phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.contactPhone}
            onChange={(e) => update('contactPhone', e.target.value)}
            error={fieldErrors.contactPhone}
          />
          <Input
            id="pv-address"
            label="Address"
            autoComplete="street-address"
            wrapperClassName="md:col-span-2"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            error={fieldErrors.address}
          />
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--ink-2)]">Reporting frequency</p>
            <p className="text-sm text-[var(--ink)]">Quarterly</p>
            <p className="mt-1 text-xs text-[var(--ink-3)]">All §29 providers report quarterly (statutory policy).</p>
          </div>
          <Select
            id="pv-status"
            label="Initial status"
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
            error={fieldErrors.status}
          >
            {PROVIDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </Select>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" loading={busy}>
            {busy ? 'Creating…' : 'Create provider'}
          </Button>
          <Link
            href="/providers"
            className="px-5 py-2 border border-[var(--line)] text-sm rounded-lg hover:bg-[var(--surface-2)] text-[var(--ink)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
