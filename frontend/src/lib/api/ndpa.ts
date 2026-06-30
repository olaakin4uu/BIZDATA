import { apiFetch } from './client';

export interface DpoReport {
  lawfulBasis: string;
  purposeLimitation: string;
  dataMinimisation: string;
  encryptionAtRest: string;
  accessOversight: { piiAccessEvents: number; evidenceExports: number; totalAuditEvents: number };
  storageLimitation: { retentionYears: number; cutoff: string; recordsPastRetention: number; submissionsPastRetention: number; purgesRun: number };
  generatedAt: string;
}

export interface RetentionPreview {
  retentionYears: number;
  cutoff: string;
  recordsPastRetention: number;
  submissionsPastRetention: number;
}

export const ndpaApi = {
  dpoReport: () => apiFetch<DpoReport>('/ndpa/dpo-report'),
  retention: (years?: number) => apiFetch<RetentionPreview>(`/ndpa/retention${years != null ? `?years=${years}` : ''}`),
  purge: (years?: number) => apiFetch<any>('/ndpa/retention/purge', { method: 'POST', body: years != null ? { years } : {} }),
};
