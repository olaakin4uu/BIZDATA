import { apiFetch } from './client';

export interface Submission {
  id: string;
  providerId: string;
  submittedByStaffId?: string | null;
  submittedByUserId?: string | null;
  periodLabel: string;
  periodYear: number;
  periodQuarter?: number | null;
  periodMonth?: number | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  recordCount: number;
  acceptedCount: number;
  rejectedCount: number;
  validationErrors?: unknown;
  status: string;
  receivedAt: string;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  provider?: {
    id: string;
    name: string;
    providerCode: string;
    providerType: string;
  };
  records?: Array<{
    id: string;
    accountNumber?: string | null;
    bvn?: string | null;
    accountName?: string | null;
    periodLabel: string;
    totalInflow?: string | null;
    flaggedAsUnderdeclared: boolean;
  }>;
}

export interface UploadSubmissionArgs {
  providerId: string;
  periodLabel: string;
  periodYear?: number;
  periodQuarter?: number;
  periodMonth?: number;
  file: File;
}

export const submissionsApi = {
  list: (params: { providerId?: string; status?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ submissions: Submission[]; total: number; page: number; limit: number }>(
      `/submissions${q ? `?${q}` : ''}`,
    );
  },
  get: (id: string) => apiFetch<Submission>(`/submissions/${id}`),
  upload: (args: UploadSubmissionArgs) => {
    const fd = new FormData();
    fd.append('file', args.file);
    fd.append('providerId', args.providerId);
    fd.append('periodLabel', args.periodLabel);
    if (args.periodYear != null) fd.append('periodYear', String(args.periodYear));
    if (args.periodQuarter != null) fd.append('periodQuarter', String(args.periodQuarter));
    if (args.periodMonth != null) fd.append('periodMonth', String(args.periodMonth));
    return apiFetch<Submission>('/submissions/upload', { method: 'POST', body: fd });
  },
  reprocess: (id: string) =>
    apiFetch<Submission>(`/submissions/${id}/process`, { method: 'PATCH' }),
};
