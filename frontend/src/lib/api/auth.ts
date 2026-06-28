import { apiFetch } from './client';
import { providerApiFetch } from './provider-client';

export interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  isActive: boolean;
  mfaEnabled?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface StaffLoginResponse {
  accessToken: string;
  user: StaffUser;
}

export interface ProviderUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  providerId: string;
  providerName?: string;
  isActive?: boolean;
  lastLoginAt?: string | null;
  provider?: {
    id: string;
    name: string;
    providerCode: string;
    providerType: string;
    reportingFrequency?: string | null;
    status: string;
  };
}

export interface ProviderLoginResponse {
  accessToken: string;
  user: ProviderUser;
}

export const authApi = {
  staffLogin: (email: string, password: string) =>
    apiFetch<StaffLoginResponse>('/auth/staff/login', {
      method: 'POST',
      body: { email, password },
    }),

  staffMe: () => apiFetch<StaffUser>('/auth/staff/me'),

  changeStaffPassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>('/auth/staff/change-password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    }),
};

export const providerAuthApi = {
  providerLogin: (email: string, password: string) =>
    providerApiFetch<ProviderLoginResponse>('/auth/provider/login', {
      method: 'POST',
      body: { email, password },
    }),

  providerMe: () => providerApiFetch<ProviderUser>('/auth/provider/me'),

  changeProviderPassword: (currentPassword: string, newPassword: string) =>
    providerApiFetch<{ success: boolean }>('/auth/provider/change-password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    }),
};
