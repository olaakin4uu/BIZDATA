import { apiFetch } from './client';

export interface AuditLog {
  id: string;
  actorType: string;
  actorId?: string | null;
  staffId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  hashChainPrev?: string | null;
  hashChainCurr?: string | null;
  createdAt: string;
  staff?: { id: string; firstName: string; lastName: string; email?: string } | null;
}

export const auditApi = {
  list: (
    params: {
      actorType?: string;
      action?: string;
      entity?: string;
      kind?: 'views' | 'security';
      recordId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiFetch<{ logs: AuditLog[]; total: number; page: number; limit: number }>(
      `/audit${q ? `?${q}` : ''}`,
    );
  },
  get: (id: string) => apiFetch<AuditLog>(`/audit/${id}`),
  verify: () => apiFetch<{ verified: boolean; count: number; headHash?: string | null; brokenAt?: number; entryId?: string; reason?: string; action?: string }>(`/audit/verify`),
};

/** Report a client-side security event (e.g. a removed watermark) against the current staff session. */
export const reportSecurityEvent = (type: 'WATERMARK_TAMPER', reason: string, path: string) =>
  apiFetch<void>('/security-events', { method: 'POST', body: { type, reason, path } });

export type RevealTarget =
  | { entity: 'Taxpayer'; id: string; field: 'nin' | 'bvn' }
  | { entity: 'DataRecord'; id: string; field: 'account' | 'bvn' | 'nin' | 'phone' };

/** Fetch one clear PII value; the server checks the viewer's access and logs the reveal. */
export const revealPii = (t: RevealTarget) =>
  apiFetch<{ value: string | null }>('/pii/reveal', { method: 'POST', body: t });
