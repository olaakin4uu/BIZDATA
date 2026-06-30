import { apiFetch } from './client';

export type ElevationStatus = 'PENDING' | 'ACTIVE' | 'DENIED' | 'EXPIRED';

export interface AccessElevation {
  id: string;
  staffId: string;
  scope: string;
  reason: string;
  status: ElevationStatus;
  requestedAt: string;
  decidedById?: string | null;
  decidedAt?: string | null;
  expiresAt?: string | null;
  staff?: { id: string; firstName: string; lastName: string; role: string };
}

export const accessApi = {
  request: (reason: string) =>
    apiFetch<AccessElevation>('/access/elevations', { method: 'POST', body: { reason } }),
  mine: () => apiFetch<{ grant: AccessElevation | null; active: boolean }>('/access/elevations/me'),
  pending: () => apiFetch<AccessElevation[]>('/access/elevations/pending'),
  approve: (id: string) => apiFetch<AccessElevation>(`/access/elevations/${id}/approve`, { method: 'POST' }),
  deny: (id: string) => apiFetch<AccessElevation>(`/access/elevations/${id}/deny`, { method: 'POST' }),
  revoke: (id: string) => apiFetch<AccessElevation>(`/access/elevations/${id}/revoke`, { method: 'POST' }),
};
