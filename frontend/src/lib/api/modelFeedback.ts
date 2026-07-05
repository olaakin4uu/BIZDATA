import { apiFetch } from './client';

export interface Recommendation {
  action: 'RAISE' | 'HOLD' | 'LOWER';
  suggestedThreshold: number | null;
  rationale: string;
}

export interface SectorFeedbackRow {
  sector: string;
  reviewed: number;
  confirmed: number;
  cleared: number;
  precision: number | null;
  falsePositiveRate: number | null;
  currentThreshold: number | null;
  recommendation: Recommendation;
}

export interface FeedbackReport {
  year: number;
  overallPrecision: number | null;
  totalReviewed: number;
  sectors: SectorFeedbackRow[];
}

export interface FairnessRate {
  type: string;
  taxpayers: number;
  flagRate: number;
}

export interface FairnessResult {
  sector: string;
  proposedThreshold: number;
  rates: FairnessRate[];
  impactRatio: number;
  passes: boolean;
  verdict: string;
}

export interface SectorOverride {
  sector: string;
  threshold: number;
  fairnessPassed: boolean;
  updatedAt: string;
}

export const modelFeedbackApi = {
  feedback: (year: number) => apiFetch<FeedbackReport>(`/model-feedback?year=${year}`),
  fairness: (sector: string, threshold: number, year: number) =>
    apiFetch<FairnessResult>(`/model-feedback/fairness?sector=${encodeURIComponent(sector)}&threshold=${threshold}&year=${year}`),
  overrides: () => apiFetch<SectorOverride[]>(`/model-feedback/overrides`),
  apply: (sector: string, threshold: number, year: number, force = false) =>
    apiFetch<{ sector: string; threshold: number; fairness: FairnessResult }>(`/model-feedback/overrides`, {
      method: 'POST',
      body: { sector, threshold, year, force },
    }),
  removeOverride: (sector: string) =>
    apiFetch<{ success: boolean }>(`/model-feedback/overrides/${encodeURIComponent(sector)}`, { method: 'DELETE' }),
};
