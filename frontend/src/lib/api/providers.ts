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
};
