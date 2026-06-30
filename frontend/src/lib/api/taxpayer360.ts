import { apiFetch } from './client';

export interface SearchResult {
  id: string;
  name: string;
  type: string;
  riskLevel: string;
  tin?: string | null;
}

export interface Taxpayer360 {
  taxpayer: Record<string, any> & { name: string; nin?: string | null; bvn?: string | null; tin?: string | null };
  declaredIncomes: { year: number; assessableIncome: number; source?: string | null }[];
  dataRecordsByYear: { year: number; records: { provider: string | null; periodLabel: string; accountName: string | null; matchMethod: string | null; totalInflow: number }[] }[];
  underdeclarationCases: Record<string, any>[];
  riskSignals: { year: number; agentKey: string; score: number; severity: string; summary: string }[];
  riskTimeline: { date: string; event: string }[];
}

export const taxpayer360Api = {
  search: (q: string) => apiFetch<SearchResult[]>(`/taxpayer360/search?q=${encodeURIComponent(q)}`),
  profile: (id: string) => apiFetch<Taxpayer360>(`/taxpayer360/${id}`),
};
