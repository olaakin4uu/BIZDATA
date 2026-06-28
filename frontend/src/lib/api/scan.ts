import { apiFetch } from './client';

export interface Scan {
  id: string;
  year: number;
  threshold: string;
  providerTypes?: string[] | null;
  totalScanned: number;
  totalFlagged: number;
  totalRecovered?: string | null;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string | null;
  startedById: string;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
  startedBy?: { id: string; firstName: string; lastName: string };
}

export const scanApi = {
  list: (params: { year?: number; status?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ scans: Scan[]; total: number; page: number; limit: number }>(
      `/scan${q ? `?${q}` : ''}`,
    );
  },
  get: (id: string) => apiFetch<Scan>(`/scan/${id}`),
  create: (dto: { year: number; threshold?: number; providerTypes?: string[] }) =>
    apiFetch<Scan>('/scan', { method: 'POST', body: dto }),
};
