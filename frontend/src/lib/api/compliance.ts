import { apiFetch } from './client';

export type PeriodStatus = 'ON_TIME' | 'LATE' | 'MISSING' | 'PENDING';

export interface CompliancePeriod {
  period: string;
  dueAt: string;
  status: PeriodStatus;
  receivedAt: string | null;
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
  periods: CompliancePeriod[];
}

export interface ComplianceSummary {
  year: number;
  providers: number;
  avgCompliance: number;
  totalMissing: number;
  totalLate: number;
  atRisk: { id: string; name: string; missing: number }[];
}

export const complianceApi = {
  summary: (year: number) => apiFetch<ComplianceSummary>(`/providers/compliance/summary?year=${year}`),
  list: (year: number) => apiFetch<ProviderCompliance[]>(`/providers/compliance?year=${year}`),
};
