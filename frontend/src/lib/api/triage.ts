import { apiFetch } from './client';

export type TriageAction = 'ADVANCE_REVIEW' | 'DISMISS' | 'REQUEST_DATA' | 'ISSUE_NOTICE' | 'HOLD';

export interface TriageCaseSnapshot {
  caseId: string;
  taxpayer: string;
  year: number;
  status: string;
  riskLevel: string;
  estimatedTaxDue: number;
  discrepancyPct: number;
  confidence: number;
}

export interface TriageRecommendation {
  id: string;
  runId: string | null;
  caseId: string;
  action: TriageAction;
  confidence: number;
  priority: number;
  rationale: string;
  keyEvidence: string[];
  risks: string[];
  statutoryNotes: string | null;
  model: string | null;
  status: 'PENDING' | 'APPLIED' | 'SKIPPED' | 'SUPERSEDED';
  appliedTo: string | null;
  createdAt: string;
  caseSnapshot: TriageCaseSnapshot | null;
}

export interface TriageRunResult {
  runId: string | null;
  count: number;
  recommendations: TriageRecommendation[];
}

export interface TriageScope {
  status?: string;
  riskLevel?: string;
  year?: number;
  assignedToMe?: boolean;
  limit?: number;
  /** Skip cases that already have a pending/skipped recommendation (for full sweeps). */
  skipTriaged?: boolean;
}

export const triageApi = {
  run: (scope: TriageScope) => apiFetch<TriageRunResult>('/triage/run', { method: 'POST', body: scope }),
  investigate: (caseId: string) => apiFetch<TriageRecommendation>(`/triage/cases/${caseId}/investigate`, { method: 'POST' }),
  list: (params: { status?: string; runId?: string; caseId?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
    const q = qs.toString();
    return apiFetch<TriageRecommendation[]>(`/triage/recommendations${q ? `?${q}` : ''}`);
  },
  apply: (id: string) => apiFetch<{ recommendation: TriageRecommendation; case: unknown }>(`/triage/recommendations/${id}/apply`, { method: 'POST' }),
  skip: (id: string) => apiFetch<{ status: string }>(`/triage/recommendations/${id}/skip`, { method: 'POST' }),
};

/* Presentation helpers shared by the batch page and the per-case panel. */
export const ACTION_LABEL: Record<TriageAction, string> = {
  ADVANCE_REVIEW: 'Advance to review',
  DISMISS: 'Dismiss case',
  REQUEST_DATA: 'Request more data',
  ISSUE_NOTICE: 'Issue §35 notice',
  HOLD: 'Hold for review',
};

/** Which actions execute a transition on approval. */
export const APPLYABLE: TriageAction[] = ['ADVANCE_REVIEW', 'DISMISS', 'ISSUE_NOTICE'];

export function actionTone(a: TriageAction): string {
  switch (a) {
    case 'ISSUE_NOTICE': return 'bg-[var(--bad-soft)] text-[var(--bad)]';
    case 'ADVANCE_REVIEW': return 'bg-teal-100 text-teal-700';
    case 'REQUEST_DATA': return 'bg-[var(--warn-soft)] text-[var(--warn)]';
    case 'DISMISS': return 'bg-[var(--surface-2)] text-[var(--ink-2)]';
    default: return 'bg-[var(--surface-2)] text-[var(--ink-2)]';
  }
}
