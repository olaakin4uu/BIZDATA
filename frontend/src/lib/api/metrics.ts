import { apiFetch } from './client';

export interface ModelMetrics {
  year: number;
  precision: number | null;
  resolved: number;
  counts: { open: number; confirmed: number; settled: number; recovered: number; dismissed: number; total: number };
  byType: { type: string; count: number }[];
  byState: { state: string; count: number }[];
  limitations: string;
}

export const metricsApi = {
  model: (year: number) => apiFetch<ModelMetrics>(`/metrics/model?year=${year}`),
};
