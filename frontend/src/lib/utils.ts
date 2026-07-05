export function formatMoney(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(n)) return '—';
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatMoneyShort(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(n)) return '—';
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

export function formatPercent(value: number | string | null | undefined, digits = 1): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'An unexpected error occurred';
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export const PROVIDER_TYPES = [
  'BANK',
  'FINTECH',
  'PAYMENT_PROCESSOR',
  'TELCO',
  'FX_BUREAU',
  'POS_AGGREGATOR',
  'ECOMMERCE',
  'INSURANCE',
  'OTHER',
] as const;
export type ProviderType = typeof PROVIDER_TYPES[number];

// NTAA §29: only financial institutions may be onboarded / submit data. This
// mirrors the backend allow-list (common/section29.ts) — keep the two in sync.
export const SECTION_29_PROVIDER_TYPES = [
  'BANK',
  'FINTECH',
  'PAYMENT_PROCESSOR',
  'FX_BUREAU',
  'POS_AGGREGATOR',
  'INSURANCE',
] as const;
export function isSection29ProviderType(type: string | null | undefined): boolean {
  return type != null && (SECTION_29_PROVIDER_TYPES as readonly string[]).includes(type);
}

export const PROVIDER_STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING_ONBOARDING'] as const;
export type ProviderStatus = typeof PROVIDER_STATUSES[number];

export const STAFF_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'SUPERVISOR',
  'ANALYST',
  'AUDIT_OFFICER',
  'DPO',
  'READONLY',
] as const;

export const PROVIDER_USER_ROLES = [
  'PROVIDER_ADMIN',
  'COMPLIANCE_OFFICER',
  'DATA_OPERATOR',
] as const;

export const TAXPAYER_TYPES = ['INDIVIDUAL', 'CORPORATE', 'GOVERNMENT'] as const;

export const TAXPAYER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLACKLISTED', 'DECEASED'] as const;

export const SUBMISSION_STATUSES = [
  'RECEIVED',
  'VALIDATING',
  'ACCEPTED',
  'PARTIALLY_ACCEPTED',
  'REJECTED',
] as const;

export const REVIEW_STATUSES = ['PENDING_REVIEW', 'CLEARED', 'CONFIRMED'] as const;

export const STATUS_BADGE_CLASS: Record<string, string> = {
  // submission
  RECEIVED: 'bg-slate-100 text-slate-700',
  VALIDATING: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  PARTIALLY_ACCEPTED: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700',
  // provider
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  PENDING_ONBOARDING: 'bg-amber-100 text-amber-700',
  // review
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  CLEARED: 'bg-slate-100 text-slate-700',
  CONFIRMED: 'bg-red-100 text-red-700',
  // scan
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  // taxpayer
  INACTIVE: 'bg-slate-100 text-slate-600',
  BLACKLISTED: 'bg-red-100 text-red-700',
  DECEASED: 'bg-slate-200 text-slate-600',
};

export function statusBadge(status?: string | null): string {
  if (!status) return 'bg-slate-100 text-slate-600';
  return STATUS_BADGE_CLASS[status] || 'bg-slate-100 text-slate-700';
}
