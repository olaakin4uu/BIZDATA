import { apiFetch } from './client';
import { providerApiFetch } from './provider-client';

export interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role: string;
  isActive: boolean;
  mfaEnabled?: boolean;
  recoveryCodesRemaining?: number;
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
  avatarUrl?: string | null;
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
  staffLogin: (email: string, password: string, totp?: string) =>
    apiFetch<StaffLoginResponse>('/auth/staff/login', {
      method: 'POST',
      body: { email, password, ...(totp ? { totp } : {}) },
    }),

  staffMe: () => apiFetch<StaffUser>('/auth/staff/me'),

  changeStaffPassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>('/auth/staff/change-password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    }),

  uploadStaffAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiFetch<StaffUser>('/auth/staff/avatar', { method: 'POST', body: fd });
  },

  // ── Two-factor (TOTP) ──
  mfaSetup: () =>
    apiFetch<{ secret: string; otpauth: string }>('/auth/staff/mfa/setup', { method: 'POST' }),
  mfaEnable: (token: string) =>
    apiFetch<{ mfaEnabled: boolean; recoveryCodes: string[] }>('/auth/staff/mfa/enable', { method: 'POST', body: { token } }),
  mfaDisable: (token: string) =>
    apiFetch<{ mfaEnabled: boolean }>('/auth/staff/mfa/disable', { method: 'POST', body: { token } }),
  mfaRegenerateRecovery: (token: string) =>
    apiFetch<{ recoveryCodes: string[] }>('/auth/staff/mfa/recovery/regenerate', { method: 'POST', body: { token } }),
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

  uploadProviderAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return providerApiFetch<ProviderUser>('/auth/provider/avatar', { method: 'POST', body: fd });
  },
};
