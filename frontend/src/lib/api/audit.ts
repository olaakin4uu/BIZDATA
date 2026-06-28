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
};
