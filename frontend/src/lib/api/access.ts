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

// ── Need-to-know access assignments (raw taxpayer records). SUPER_ADMIN/ADMIN only. ──
export interface AccessAssignment {
  id: string;
  staffId: string;
  providerId: string | null;
  caseId: string | null;
  reason: string;
  grantedById: string;
  selfAssigned: boolean;
  createdAt: string;
  revokedAt: string | null;
  revokedById: string | null;
}

export const accessAssignmentsApi = {
  /** The current officer's active assignments. */
  mine: () => apiFetch<AccessAssignment[]>('/access/assignments/me'),
  /** Admin list, optionally filtered. */
  list: (params: { staffId?: string; providerId?: string; caseId?: string; includeRevoked?: boolean } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)); });
    const q = qs.toString();
    return apiFetch<AccessAssignment[]>(`/access/assignments${q ? `?${q}` : ''}`);
  },
  /** Grant to a staff member (provider- or case-scoped). Reason required. */
  grant: (dto: { staffId: string; providerId?: string; caseId?: string; reason: string }) =>
    apiFetch<AccessAssignment>('/access/assignments', { method: 'POST', body: dto }),
  /** Self-assign the current officer to a provider or case. Reason required. */
  self: (dto: { providerId?: string; caseId?: string; reason: string }) =>
    apiFetch<AccessAssignment>('/access/assignments/self', { method: 'POST', body: dto }),
  /** Revoke an assignment (immediate). */
  revoke: (id: string) =>
    apiFetch<AccessAssignment>(`/access/assignments/${id}/revoke`, { method: 'POST', body: {} }),
};

// Sliding-session keepalive for the step-up (record-access) token.
export const stepUpApi = {
  renew: (stepUpToken: string) =>
    apiFetch<{ stepUpToken: string; expiresInSeconds: number }>('/auth/staff/step-up/renew', {
      method: 'POST', body: { stepUpToken },
    }),
};
