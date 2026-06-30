import { apiFetch } from './client';

export interface ReferralCandidate {
  caseId: string;
  taxpayerId: string | null;
  name: string;
  state: string | null;
  toAuthority: string;
  estimatedTaxDue: number;
}

export interface Referral {
  id: string;
  taxpayerId?: string | null;
  direction: 'OUTBOUND' | 'INBOUND';
  fromAuthority: string;
  toAuthority: string;
  state: string;
  basis: string;
  year?: number | null;
  payload?: Record<string, any> | null;
  status: 'DRAFT' | 'SENT' | 'ACKNOWLEDGED' | 'RECEIVED' | 'CLOSED';
  createdAt: string;
}

export const crossStateApi = {
  candidates: (year: number) => apiFetch<ReferralCandidate[]>(`/cross-state/candidates?year=${year}`),
  list: () => apiFetch<Referral[]>('/cross-state'),
  generate: (year: number) => apiFetch<{ created: number }>('/cross-state/generate', { method: 'POST', body: { year } }),
  send: (id: string) => apiFetch<Referral>(`/cross-state/${id}/send`, { method: 'POST' }),
};
