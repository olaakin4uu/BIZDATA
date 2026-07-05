import { apiFetch } from './client';

export interface ProviderAnalyticsRow {
  provider: { id: string; name: string; providerType: string; providerCode: string };
  records: number;
  taxpayers: number;
  observedInflow: number;
  flaggedRecords: number;
  rejectionRate: number;
  identityCompleteness: number;
  yieldPer1k: number;
}
export interface ProviderAnalytics {
  totals: { providers: number; records: number; observedInflow: number; flagged: number };
  rows: ProviderAnalyticsRow[];
}

export interface SectorAnalyticsRow {
  sector: string;
  taxpayers: number;
  flaggedTaxpayers: number;
  observedInflow: number;
  estimatedTax: number;
  coveragePct: number;
  flaggedPct: number;
}
export interface SectorAnalytics {
  totals: { sectors: number; classified: number; unclassified: number };
  rows: SectorAnalyticsRow[];
}

export const analyticsApi = {
  byProvider: (year?: number) =>
    apiFetch<ProviderAnalytics>(`/analytics/by-provider${year ? `?year=${year}` : ''}`),
  bySector: (year?: number) =>
    apiFetch<SectorAnalytics>(`/analytics/by-sector${year ? `?year=${year}` : ''}`),
};
