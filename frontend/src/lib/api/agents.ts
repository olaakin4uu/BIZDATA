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

export const agentsApi = {
  run: (year: number) => apiFetch<AgentRunResult>('/agents/run', { method: 'POST', body: { year } }),
  signals: (params: { year?: number; taxpayerId?: string; agentKey?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    const q = qs.toString();
    return apiFetch<RiskSignal[]>(`/agents/signals${q ? `?${q}` : ''}`);
  },
};
