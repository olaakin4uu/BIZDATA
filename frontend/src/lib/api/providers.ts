import { apiFetch } from './client';

export interface Provider {
  id: string;
  providerCode: string;
  name: string;
  providerType: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  status: string;
  reportingFrequency?: string | null;
  createdAt: string;
  updatedAt: string;
  users?: ProviderUserRecord[];
  submissions?: Array<{
    id: string;
    periodLabel: string;
    fileName?: string | null;
    status: string;
    createdAt: string;
    recordCount: number;
    acceptedCount: number;
    rejectedCount: number;
  }>;
}

export interface ProviderUserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  phone?: string | null;
  lastLoginAt?: string | null;
}

export interface ProviderStats {
  total: number;
  byType: Array<{ providerType: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

export interface ProviderUpload {
  id: string;
  periodLabel: string;
  periodYear: number;
  periodQuarter?: number | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  recordCount: number;
  acceptedCount: number;
  rejectedCount: number;
  status: string;
  receiptHash?: string | null;
  receivedAt: string;
  processedAt?: string | null;
}

export interface UploadsResponse {
  provider: { id: string; name: string; providerType: string; providerCode: string };
  submissions: ProviderUpload[];
}

export interface StepUpResponse {
  stepUpToken: string;
  scope: string;
  providerId: string | null;
  expiresInSeconds: number;
}

export interface UploadRecord {
  id: string;
  accountName?: string | null;
  accountNumber?: string | null;
  bvn?: string | null;
  nin?: string | null;
  tin?: string | null;
  phoneNumber?: string | null;
  periodLabel: string;
  totalInflow?: string | null;
  totalOutflow?: string | null;
  transactionCount?: number | null;
  matchMethod?: string | null;
  flagged: boolean;
  taxpayerId: string | null;
}

export interface UploadRecordsResponse {
  submission: { id: string; periodLabel: string; fileName?: string | null; recordCount: number; provider: { id: string; name: string; providerType: string } };
  records: UploadRecord[];
  total: number;
  page: number;
  limit: number;
}

export const providersApi = {
  list: (params: { search?: string; providerType?: string; status?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ providers: Provider[]; total: number; page: number; limit: number }>(
      `/providers${q ? `?${q}` : ''}`,
    );
  },
  stats: () => apiFetch<ProviderStats>('/providers/stats'),
  get: (id: string) => apiFetch<Provider>(`/providers/${id}`),
  create: (dto: Partial<Provider>) =>
    apiFetch<Provider>('/providers', { method: 'POST', body: dto }),
  update: (id: string, dto: Partial<Provider>) =>
    apiFetch<Provider>(`/providers/${id}`, { method: 'PATCH', body: dto }),
  updateStatus: (id: string, status: string) =>
    apiFetch<Provider>(`/providers/${id}/status`, { method: 'PATCH', body: { status } }),

  // provider users
  listUsers: (providerId: string) =>
    apiFetch<ProviderUserRecord[]>(`/providers/${providerId}/users`),
  createUser: (
    providerId: string,
    dto: { email: string; password: string; firstName: string; lastName: string; role?: string; phone?: string },
  ) => apiFetch<ProviderUserRecord>(`/providers/${providerId}/users`, { method: 'POST', body: dto }),
  getUser: (id: string) => apiFetch<ProviderUserRecord>(`/provider-users/${id}`),
  updateUser: (id: string, dto: Partial<ProviderUserRecord>) =>
    apiFetch<ProviderUserRecord>(`/provider-users/${id}`, { method: 'PATCH', body: dto }),
  resetUserPassword: (id: string, newPassword: string) =>
    apiFetch<{ success: boolean }>(`/provider-users/${id}/reset-password`, {
      method: 'POST',
      body: { newPassword },
    }),

  // uploads (submission envelopes — metadata only, no step-up needed)
  listUploads: (providerId: string) =>
    apiFetch<UploadsResponse>(`/providers/${providerId}/uploads`),

  // step-up re-auth to unlock a provider's sensitive upload records
  stepUp: (password: string, providerId: string, totp?: string) =>
    apiFetch<StepUpResponse>('/auth/staff/step-up', {
      method: 'POST',
      body: { password, scope: 'PROVIDER_UPLOADS', providerId, ...(totp ? { totp } : {}) },
    }),

  // gated upload records — requires the step-up token in the x-step-up header
  uploadRecords: (submissionId: string, stepUpToken: string, page = 1, limit = 50) =>
    apiFetch<UploadRecordsResponse>(
      `/providers/uploads/${submissionId}/records?page=${page}&limit=${limit}`,
      { headers: { 'x-step-up': stepUpToken } },
    ),

  // gated CSV export — returns a Blob so the browser can download it
  exportUploadCsv: async (submissionId: string, stepUpToken: string): Promise<{ blob: Blob; filename: string }> => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';
    const token = typeof window !== 'undefined' ? localStorage.getItem('bizdata_staff_token') : null;
    const res = await fetch(`${base}/providers/uploads/${submissionId}/export`, {
      headers: { Authorization: `Bearer ${token}`, 'x-step-up': stepUpToken },
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const disp = res.headers.get('content-disposition') || '';
    const m = disp.match(/filename="([^"]+)"/);
    return { blob: await res.blob(), filename: m?.[1] || 'export.csv' };
  },
};
