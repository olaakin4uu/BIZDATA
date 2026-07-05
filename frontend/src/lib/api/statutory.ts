import { apiFetch } from './client';

export interface StatutoryConfig {
  version: number;
  reportingDueDays: number;
  objectionWindowDays: number;
  authorityResponseDays: number;
  latePaymentPenaltyRate: number;
  citRate: number;
  citSmallCoThreshold: number;
  defaultScanThreshold: number;
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
