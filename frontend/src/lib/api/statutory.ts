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
  providerPenaltyFirstMonth: number; // NTAA s.101 — first month of default
  providerPenaltyPerMonth: number;   // NTAA s.101 — each subsequent month
  providerPenaltyPaymentDays: number; // days to settle a penalty demand (deadline on the notice)
  /** Penalty commencement date (YYYY-MM-DD) or null → enforce from every due date. */
  providerPenaltyEffectiveFrom: string | null;
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
