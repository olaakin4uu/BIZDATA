import { apiFetch } from './client';

export type PeriodStatus = 'ON_TIME' | 'LATE' | 'MISSING' | 'PENDING';

export interface CompliancePeriod {
  period: string;
  dueAt: string;
  status: PeriodStatus;
  receivedAt: string | null;
  monthsInDefault?: number;
  penalty?: number;          // NTAA §101 penalty for this period (0 if none / not enforced)
  penaltyEnforced?: boolean; // false when before the commencement date
}

export interface ProviderCompliance {
  provider: { id: string; name: string; providerType: string; status: string; reportingFrequency: string };
  expected: number;
  onTime: number;
  late: number;
  missing: number;
  pending: number;
  complianceRate: number;
  submissions: number;
  rejectionRate: number;
  penaltyTotal?: number;     // accrued §101 exposure across late/missing periods
  periods: CompliancePeriod[];
}

export interface ComplianceSummary {
  year: number;
  providers: number;
  avgCompliance: number;
  totalMissing: number;
  totalLate: number;
  totalPenalty?: number;     // aggregate §101 exposure across all providers
  atRisk: { id: string; name: string; missing: number }[];
}

export interface ProviderPenalty {
  id: string;
  providerId: string;
  periodLabel: string;
  periodYear: number;
  reason: 'LATE' | 'MISSING' | string;
  monthsInDefault: number;
  amount: string;            // Decimal serialized as string
  status: string;            // ASSESSED | NOTIFIED | WAIVED | PAID
  noticeRef: string | null;
  notifiedAt: string | null;
  createdAt: string;
  provider?: { id: string; name: string; providerType: string };
}

export const complianceApi = {
  summary: (year: number) => apiFetch<ComplianceSummary>(`/providers/compliance/summary?year=${year}`),
  list: (year: number) => apiFetch<ProviderCompliance[]>(`/providers/compliance?year=${year}`),

  // ── NTAA §101 provider penalties ──
  penalties: (params: { year?: number; providerId?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, String(v)); });
    const q = qs.toString();
    return apiFetch<ProviderPenalty[]>(`/providers/penalties${q ? `?${q}` : ''}`);
  },
  issuePenalty: (providerId: string, periodLabel: string) =>
    apiFetch<ProviderPenalty>('/providers/penalties/issue', { method: 'POST', body: { providerId, periodLabel } }),
  issueAllPenalties: (year: number) =>
    apiFetch<{ year: number; issued: number; results: { providerId: string; period: string; amount: number }[] }>(
      '/providers/penalties/issue-all', { method: 'POST', body: { year } },
    ),
  /** Path of the formal demand notice (fetched with the auth token, rendered in-app). */
  noticePath: (penaltyId: string) => `/providers/penalties/${penaltyId}/notice`,
};
