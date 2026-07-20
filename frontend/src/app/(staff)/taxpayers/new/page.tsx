'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Field';
import { taxpayersApi } from '@/lib/api/taxpayers';
import { TAXPAYER_TYPES, TAXPAYER_STATUSES, extractErrorMessage } from '@/lib/utils';

type FieldKey =
  | 'type'
  | 'status'
  | 'nin'
  | 'cacRcNumber'
  | 'tin'
  | 'firstName'
  | 'lastName'
  | 'middleName'
  | 'businessName'
  | 'phone'
  | 'email'
  | 'stateOfResidence'
  | 'address';

type FieldErrors = Partial<Record<FieldKey, string>>;

// Visual/DOM order, used to pick the first field to scroll to on a failed submit.
const FIELD_ORDER: FieldKey[] = [
  'type',
  'status',
  'nin',
  'cacRcNumber',
  'tin',
  'firstName',
  'lastName',
  'middleName',
  'businessName',
  'phone',
  'email',
  'stateOfResidence',
  'address',
];

const NIN_RE = /^\d{11}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Best-effort map a server validation message to the field it concerns.
function mapServerError(message: string): FieldKey | null {
  const m = message.toLowerCase();
  if (m.includes('cac') || m.includes('rc number') || m.includes('rcnumber')) return 'cacRcNumber';
  if (m.includes('nin')) return 'nin';
  if (m.includes('tin')) return 'tin';
  if (m.includes('email')) return 'email';
  if (m.includes('phone')) return 'phone';
  if (m.includes('business')) return 'businessName';
  return null;
}

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const update = (k: FieldKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Clear a field's error as the user edits it.
    setFieldErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
  };

  const scrollToFirstError = (errs: FieldErrors) => {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (!first) return;
    const el = document.getElementById(`tp-${first}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (el as HTMLElement).focus();
    }
  };

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    // One-of rule: at least one of NIN or CAC RC number is required.
    if (!form.nin.trim() && !form.cacRcNumber.trim()) {
      errs.nin = 'Enter a NIN or a CAC RC number — at least one is required.';
    }
    if (form.nin.trim() && !NIN_RE.test(form.nin.trim())) {
      errs.nin = 'NIN must be exactly 11 digits.';
    }
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
      errs.email = 'Enter a valid email address.';
    }
    return errs;
  };

  const submit = async (e: React.FormEvent) => {
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
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== ''),
      );
      const tp = await taxpayersApi.create(payload);
      router.push(`/taxpayers/${tp.id}`);
    } catch (err) {
      const message = extractErrorMessage(err);
      const field = mapServerError(message);
      if (field) {
        const errs = { [field]: message } as FieldErrors;
        setFieldErrors(errs);
        scrollToFirstError(errs);
      } else {
        setError(message);
      }
      setBusy(false);
    }
  };

  const isIndividual = form.type === 'INDIVIDUAL';

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <PageHeader
        title="Register new taxpayer"
        actions={<Link href="/taxpayers" className="text-sm text-[var(--ink-2)] hover:text-[var(--ink)]">← Back</Link>}
      />
      <form onSubmit={submit} className="bg-[var(--surface)] rounded-xl border border-[var(--line)] shadow-sm p-6 space-y-4">
        {error && (
          <div className="px-3 py-2 bg-[var(--bad-soft)] border border-[var(--bad)] rounded-lg text-sm text-[var(--bad)]">{error}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            id="tp-type"
            label="Type"
            required
            value={form.type}
            onChange={(e) => update('type', e.target.value)}
          >
            {TAXPAYER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Select
            id="tp-status"
            label="Status"
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
          >
            {TAXPAYER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>

          <Input
            id="tp-nin"
            label="NIN"
            inputMode="numeric"
            maxLength={11}
            pattern="\d{11}"
            autoComplete="off"
            value={form.nin}
            onChange={(e) => update('nin', e.target.value)}
            error={fieldErrors.nin}
            hint={fieldErrors.nin ? undefined : '11-digit National Identification Number.'}
          />
          <Input
            id="tp-cacRcNumber"
            label="CAC RC number"
            autoComplete="off"
            value={form.cacRcNumber}
            onChange={(e) => update('cacRcNumber', e.target.value)}
            error={fieldErrors.cacRcNumber}
          />
          <Input
            id="tp-tin"
            label="TIN"
            inputMode="numeric"
            maxLength={20}
            autoComplete="off"
            wrapperClassName="md:col-span-2"
            value={form.tin}
            onChange={(e) => update('tin', e.target.value)}
            error={fieldErrors.tin}
            hint={fieldErrors.tin ? undefined : 'Tax Identification Number.'}
          />

          {isIndividual ? (
            <>
              <Input
                id="tp-firstName"
                label="First name"
                autoComplete="given-name"
                value={form.firstName}
                onChange={(e) => update('firstName', e.target.value)}
                error={fieldErrors.firstName}
              />
              <Input
                id="tp-lastName"
                label="Last name"
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => update('lastName', e.target.value)}
                error={fieldErrors.lastName}
              />
              <Input
                id="tp-middleName"
                label="Middle name"
                autoComplete="additional-name"
                wrapperClassName="md:col-span-2"
                value={form.middleName}
                onChange={(e) => update('middleName', e.target.value)}
                error={fieldErrors.middleName}
              />
            </>
          ) : (
            <Input
              id="tp-businessName"
              label="Business name"
              autoComplete="organization"
              wrapperClassName="md:col-span-2"
              value={form.businessName}
              onChange={(e) => update('businessName', e.target.value)}
              error={fieldErrors.businessName}
            />
          )}

          <Input
            id="tp-phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            error={fieldErrors.phone}
          />
          <Input
            id="tp-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            error={fieldErrors.email}
          />
          <Input
            id="tp-stateOfResidence"
            label="State of residence"
            autoComplete="address-level1"
            value={form.stateOfResidence}
            onChange={(e) => update('stateOfResidence', e.target.value)}
            error={fieldErrors.stateOfResidence}
          />
          <Input
            id="tp-address"
            label="Address"
            autoComplete="street-address"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
            error={fieldErrors.address}
          />
        </div>

        <p className="text-xs text-[var(--ink-3)]">At least one of NIN or CAC RC number is required.</p>

        <div className="flex gap-2">
          <Button type="submit" loading={busy}>
            {busy ? 'Creating…' : 'Create taxpayer'}
          </Button>
          <Link href="/taxpayers" className="px-5 py-2 border border-[var(--line)] text-sm rounded-lg hover:bg-[var(--surface-2)] text-[var(--ink)]">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
