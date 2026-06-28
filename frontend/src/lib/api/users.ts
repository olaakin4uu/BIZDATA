import { apiFetch } from './client';

export interface StaffUserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export const usersApi = {
  list: (params: { search?: string; role?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ users: StaffUserRecord[]; total: number; page: number; limit: number }>(
      `/users${q ? `?${q}` : ''}`,
    );
  },
  get: (id: string) => apiFetch<StaffUserRecord>(`/users/${id}`),
  create: (dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role?: string;
    isActive?: boolean;
  }) => apiFetch<StaffUserRecord>('/users', { method: 'POST', body: dto }),
  update: (id: string, dto: Partial<StaffUserRecord>) =>
    apiFetch<StaffUserRecord>(`/users/${id}`, { method: 'PATCH', body: dto }),
  resetPassword: (id: string, newPassword: string) =>
    apiFetch<{ success: boolean }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: { newPassword },
    }),
};
