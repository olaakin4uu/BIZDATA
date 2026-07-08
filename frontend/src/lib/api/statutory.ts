import { apiFetch } from './client';

export interface StatutoryConfig {
  version: number;
  reportingDueDays: number;
  objectionWindowDays: number;
  authorityResponseDays: number;
  latePaymentPenaltyRate: number;
  citRate: number;
  citSmallCoThreshold: number;
  cgtRate: number;
  defaultScanThreshold: number;
  /** Date the phased-in compulsory fields become mandatory (YYYY-MM-DD) or null. */
  fieldEnforcementDate: string | null;
}
export interface StatutoryHistoryItem extends StatutoryConfig {
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

export const statutoryApi = {
  active: () => apiFetch<StatutoryConfig>('/statutory'),
  history: () => apiFetch<StatutoryHistoryItem[]>('/statutory/history'),
  update: (patch: Partial<StatutoryConfig> & { note?: string }) =>
    apiFetch<StatutoryConfig>('/statutory', { method: 'PATCH', body: patch }),
};
