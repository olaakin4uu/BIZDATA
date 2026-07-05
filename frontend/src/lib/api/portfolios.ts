import { apiFetch } from './client';

export type PortfolioScope = 'PROVIDER' | 'PROVIDER_TYPE' | 'SECTOR';

export interface Portfolio {
  id: string;
  staffId: string;
  scope: PortfolioScope;
  targetValue: string;
  label: string;
  createdAt: string;
  staff: { id: string; firstName: string; lastName: string; email: string; role: string };
}

export interface Workload {
  staff: { id: string; firstName: string; lastName: string; email: string; role: string };
  openCases: number;
  revenueAtRisk: number;
  recovered: number;
  portfolios: number;
}

export const portfoliosApi = {
  list: (staffId?: string) =>
    apiFetch<Portfolio[]>(`/portfolios${staffId ? `?staffId=${staffId}` : ''}`),
  workload: () => apiFetch<Workload[]>('/portfolios/workload'),
  create: (staffId: string, scope: PortfolioScope, targetValue: string) =>
    apiFetch<Portfolio>('/portfolios', { method: 'POST', body: { staffId, scope, targetValue } }),
  remove: (id: string) => apiFetch<{ success: boolean }>(`/portfolios/${id}`, { method: 'DELETE' }),
};
