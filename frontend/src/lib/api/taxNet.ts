import { apiFetch } from './client';

export type NetStatus = 'CAPTURED' | 'UNVERIFIED' | 'INVISIBLE';

export interface TaxNetRow {
  id: string;
  type: string;
  status: string;
  name: string;
  rcNumber: string | null;
  hasTin: boolean;
  hasNin: boolean;
  hasBvn: boolean;
  stateOfResidence: string | null;
  sector: string | null;
  netStatus: NetStatus;
  observedInflow: number;
  recordCount: number;
  providers: string[];
  sourceProvider: string | null;
  providerCount: number;
}

export interface TaxNetReport {
  summary: {
    captured: { count: number; observedInflow: number };
    unverified: { count: number; observedInflow: number };
    invisible: { count: number; observedInflow: number };
    totalTaxpayers: number;
    coveragePct: number;
  };
  rows: TaxNetRow[];
  total: number;
  page: number;
  limit: number;
}

export const taxNetApi = {
  report: (params: { status?: NetStatus; type?: string; year?: number; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    const q = qs.toString();
    return apiFetch<TaxNetReport>(`/tax-net/report${q ? `?${q}` : ''}`);
  },

  register: (id: string, tin?: string) =>
    apiFetch<{ id: string; tin: string; netStatus: NetStatus }>(`/tax-net/register/${id}`, {
      method: 'POST',
      body: tin ? { tin } : {},
    }),

  autoRegister: (opts: { ids?: string[]; minInflow?: number; limit?: number } = {}) =>
    apiFetch<{ registered: number; candidates: number; assigned: { id: string; tin: string }[] }>('/tax-net/auto-register', {
      method: 'POST',
      body: opts,
    }),
};
