import { apiFetch } from './client';

export interface IdentityStatus {
  resolvable: number;
  verified: number;
  total: number;
  provider: string;
  isMock: boolean;
  unconfigured: boolean;
}

export const identityApi = {
  status: () => apiFetch<IdentityStatus>('/identity/status'),
  resolveOne: (id: string) =>
    apiFetch<{ taxpayerId: string; resolved: boolean; source?: string; confidence?: number; reason?: string }>(
      `/identity/resolve/${id}`, { method: 'POST' },
    ),
  resolveBulk: (opts: { ids?: string[]; limit?: number } = {}) =>
    apiFetch<{ candidates: number; resolved: number; notFound: number; skipped: number; provider: string }>(
      '/identity/resolve-bulk', { method: 'POST', body: opts },
    ),
};
