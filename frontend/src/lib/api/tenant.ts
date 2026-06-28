import { apiFetch } from './client';

export interface Tenant {
  id: string;
  name: string;
  shortName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  themeColor?: string | null;
  scanThreshold: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const tenantApi = {
  get: () => apiFetch<Tenant>('/tenant'),
  update: (dto: Partial<Tenant>) =>
    apiFetch<Tenant>('/tenant', { method: 'PATCH', body: dto }),
};
