import { providerApiFetch } from './provider-client';
import type { Submission } from './submissions';
import type { ProviderUser } from './auth';

export interface ProviderDashboard {
  stats: {
    submissions: number;
    records: number;
    accepted: number;
    flagged: number;
  };
  recentSubmissions: Submission[];
}

export interface ProviderUploadArgs {
  periodLabel: string;
  periodYear?: number;
  periodQuarter?: number;
  periodMonth?: number;
  file: File;
}

export const providerPortalApi = {
  me: () => providerApiFetch<ProviderUser>('/provider-portal/me'),
  dashboard: () => providerApiFetch<ProviderDashboard>('/provider-portal/dashboard'),
  listSubmissions: (params: { status?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return providerApiFetch<{ submissions: Submission[]; total: number; page: number; limit: number }>(
      `/provider-portal/submissions${q ? `?${q}` : ''}`,
    );
  },
  getSubmission: (id: string) => providerApiFetch<Submission>(`/provider-portal/submissions/${id}`),
  upload: (args: ProviderUploadArgs) => {
    const fd = new FormData();
    fd.append('file', args.file);
    fd.append('periodLabel', args.periodLabel);
    if (args.periodYear != null) fd.append('periodYear', String(args.periodYear));
    if (args.periodQuarter != null) fd.append('periodQuarter', String(args.periodQuarter));
    if (args.periodMonth != null) fd.append('periodMonth', String(args.periodMonth));
    return providerApiFetch<Submission>('/provider-portal/submissions/upload', {
      method: 'POST',
      body: fd,
    });
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    providerApiFetch<{ success: boolean }>('/provider-portal/me/password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    }),
};
