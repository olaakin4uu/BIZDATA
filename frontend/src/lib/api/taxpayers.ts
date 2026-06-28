import { apiFetch } from './client';

export interface Taxpayer {
  id: string;
  nin?: string | null;
  cacRcNumber?: string | null;
  tin?: string | null;
  type: 'INDIVIDUAL' | 'CORPORATE' | 'GOVERNMENT';
  status: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  businessName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  stateOfResidence?: string | null;
  riskScore: number;
  riskLevel: string;
  riskComputedAt?: string | null;
  riskFlags?: unknown;
  createdAt: string;
  updatedAt: string;
  declaredIncomes?: Array<{
    id: string;
    year: number;
    assessableIncome: string;
    source?: string | null;
    notes?: string | null;
  }>;
}

export const taxpayersApi = {
  list: (params: { search?: string; type?: string; status?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ taxpayers: Taxpayer[]; total: number; page: number; limit: number }>(
      `/taxpayers${q ? `?${q}` : ''}`,
    );
  },
  get: (id: string) => apiFetch<Taxpayer>(`/taxpayers/${id}`),
  create: (dto: Partial<Taxpayer>) =>
    apiFetch<Taxpayer>('/taxpayers', { method: 'POST', body: dto }),
  update: (id: string, dto: Partial<Taxpayer>) =>
    apiFetch<Taxpayer>(`/taxpayers/${id}`, { method: 'PATCH', body: dto }),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiFetch<{ created: number; updated: number; skipped: number; errors: string[] }>(
      '/taxpayers/import',
      { method: 'POST', body: fd },
    );
  },
};
