import { apiFetch } from './client';

export interface DeclaredIncome {
  id: string;
  taxpayerId: string;
  year: number;
  assessableIncome: string;
  source?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  taxpayer?: {
    id: string;
    nin?: string | null;
    cacRcNumber?: string | null;
    businessName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export const declaredIncomeApi = {
  list: (params: { year?: number; taxpayerId?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ records: DeclaredIncome[]; total: number; page: number; limit: number }>(
      `/declared-income${q ? `?${q}` : ''}`,
    );
  },
  create: (dto: { taxpayerId: string; year: number; assessableIncome: number; source?: string; notes?: string }) =>
    apiFetch<DeclaredIncome>('/declared-income', { method: 'POST', body: dto }),
  validateCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiFetch<ImportResult>('/declared-income/validate', { method: 'POST', body: fd });
  },
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiFetch<ImportResult>('/declared-income/import', { method: 'POST', body: fd });
  },
};

export interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
  errors: string[];
  errorCount: number;
}
