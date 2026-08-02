import { apiFetch } from './client';

export type AgentSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskSignal {
  id: string;
  taxpayerId: string;
  year: number;
  agentKey: string;
  score: string;
  severity: AgentSeverity;
  summary: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AgentRunResult {
  year: number;
  profiles: number;
  signals: number;
  perAgent: Record<string, number>;
  agents: { key: string; name: string }[];
}

export const AGENT_NAMES: Record<string, string> = {
  pattern: 'Pattern Detection',
  matching: 'TIN-BVN Matching',
  sector: 'Sector Classification',
  behavioural: 'Behavioural Analytics',
  predictive: 'Predictive Compliance',
  document: 'Document Intelligence',
};

export interface SignalRow {
  id: string;
  taxpayerId: string;
  year: number;
  agentKey: string;
  score: string;
  severity: AgentSeverity;
  summary: string;
  createdAt: string;
  /** When the agents last RECOMPUTED this signal — not when it first appeared. */
  computedAt?: string;
  taxpayerName: string;
  taxpayerType: string;
  sector: string | null;
}
export interface SignalsPage {
  signals: SignalRow[];
  total: number;
  page: number;
  limit: number;
}
export interface SignalSummary {
  total: number;
  byAgent: { agentKey: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
}

export const agentsApi = {
  run: (year: number) => apiFetch<AgentRunResult>('/agents/run', { method: 'POST', body: { year } }),
  signals: (params: { year?: number; taxpayerId?: string; agentKey?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    const q = qs.toString();
    return apiFetch<RiskSignal[]>(`/agents/signals${q ? `?${q}` : ''}`);
  },
  // paginated + enriched list for the Agent Signals page
  signalsPage: (params: { year?: number; agentKey?: string; severity?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    return apiFetch<SignalsPage>(`/agents/signals?${qs.toString()}`);
  },
  signalSummary: (year?: number) =>
    apiFetch<SignalSummary>(`/agents/signals/summary${year ? `?year=${year}` : ''}`),
};
