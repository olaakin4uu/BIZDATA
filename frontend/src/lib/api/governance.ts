import { apiFetch } from './client';

export interface GovernanceReport {
  year: number;
  revenueAtRisk: number;
  recovered: number;
  casesByStatus: Record<string, number>;
  totalCases: number;
  agentSignalCount: number;
  providers: { active: number; withSubmissions: number };
  topCases: { id: string; year: number; estimatedTaxDue: number; status: string }[];
}

export interface BankMou {
  id: string;
  providerId: string;
  status: 'DRAFT' | 'SENT' | 'EXECUTED' | 'TERMINATED';
  channel?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  signedAt?: string | null;
  provider?: { name: string; providerType: string };
}

export const governanceApi = {
  report: (year: number) => apiFetch<GovernanceReport>(`/governance/report?year=${year}`),
  listMou: () => apiFetch<BankMou[]>('/governance/mou'),
  upsertMou: (dto: Partial<BankMou> & { providerId: string }) => apiFetch<BankMou>('/governance/mou', { method: 'POST', body: dto }),
};
