import { providerApiFetch } from './provider-client';
import type { Submission } from './submissions';
import type { ProviderUser } from './auth';

export interface ProviderDashboard {
  stats: {
    submissions: number;
    records: number;
    accepted: number;
    flagged: number;
  };
  /** Set while this provider has not yet filed an accepted return in the current format. */
  returnFormatNotice?: { changedOn: string; columns: string[] } | null;
  unreadNotifications?: number;
  recentSubmissions: Submission[];
}

/** A notification addressed to this provider — never a staff service alert. */
export interface ProviderNotification {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  entity?: string | null;
  entityId?: string | null;
  read: boolean;
  createdAt: string;
}

export type PeriodStatus = 'ON_TIME' | 'LATE' | 'MISSING' | 'PENDING';

export interface CompliancePeriod {
  period: string;      // e.g. "2026-Q1"
  dueAt: string;       // statutory due date (ISO)
  status: PeriodStatus;
  receivedAt: string | null;
  monthsInDefault?: number;
  penalty?: number;         // NTAA §101 penalty for this period (0 if none/not enforced)
  penaltyEnforced?: boolean; // false when the period is before the commencement date
}

export interface IssuedPenalty {
  id: string;
  periodLabel: string;
  reason: 'LATE' | 'MISSING' | string;
  monthsInDefault: number;
  amount: number;
  status: string;       // ASSESSED | NOTIFIED | WAIVED | PAID
  noticeRef: string | null;
  notifiedAt: string | null;
}

export interface ProviderCompliance {
  provider: { id: string; name: string; providerType: string; status: string; reportingFrequency: string };
  expected: number; // reportingFrequency lives under `provider`, not at top level
  onTime: number;
  late: number;
  missing: number;
  pending: number;
  complianceRate: number;
  submissions: number;
  rejectionRate: number;
  penaltyTotal?: number; // accrued NTAA §101 exposure across late/missing periods
  periods: CompliancePeriod[];
  penalties?: {
    issued: IssuedPenalty[];
    issuedTotal: number;
    accruedTotal: number;
  };
}

export interface ProviderUploadArgs {
  periodLabel: string;
  periodYear?: number;
  periodQuarter?: number;
  periodMonth?: number;
  file: File;
}

export const providerPortalApi = {
  me: () => providerApiFetch<ProviderUser>('/provider-portal/me'),
  dashboard: () => providerApiFetch<ProviderDashboard>('/provider-portal/dashboard'),
  compliance: (year: number) => providerApiFetch<ProviderCompliance | null>(`/provider-portal/compliance?year=${year}`),
  listSubmissions: (params: { status?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return providerApiFetch<{ submissions: Submission[]; total: number; page: number; limit: number }>(
      `/provider-portal/submissions${q ? `?${q}` : ''}`,
    );
  },
  getSubmission: (id: string) => providerApiFetch<Submission>(`/provider-portal/submissions/${id}`),
  notifications: () => providerApiFetch<ProviderNotification[]>('/provider-portal/notifications'),
  markNotificationRead: (id: string) =>
    providerApiFetch<ProviderNotification>(`/provider-portal/notifications/${id}/read`, { method: 'PATCH' }),
  upload: (args: ProviderUploadArgs) => {
    const fd = new FormData();
    fd.append('file', args.file);
    fd.append('periodLabel', args.periodLabel);
    if (args.periodYear != null) fd.append('periodYear', String(args.periodYear));
    if (args.periodQuarter != null) fd.append('periodQuarter', String(args.periodQuarter));
    if (args.periodMonth != null) fd.append('periodMonth', String(args.periodMonth));
    return providerApiFetch<Submission>('/provider-portal/submissions/upload', {
      method: 'POST',
      body: fd,
    });
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    providerApiFetch<{ success: boolean }>('/provider-portal/me/password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    }),

  /** Download the CSV upload template for this provider's type (auth'd blob). */
  downloadTemplate: async () => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';
    const token = typeof window !== 'undefined' ? localStorage.getItem('bizdata_provider_token') : null;
    const res = await fetch(`${base}/provider-portal/template`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Could not download the template.');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || 'bizdata-template.csv';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
};
