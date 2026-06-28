import { apiFetch } from './client';

export interface SchemaColumn {
  name: string;
  type: 'STRING' | 'NUMBER' | 'INTEGER' | 'DATE' | 'BOOLEAN' | string;
  required?: boolean;
  validation?: string | null;
  description?: string | null;
}

export interface ProviderSchema {
  id: string;
  providerType: string;
  name: string;
  description?: string | null;
  columns: SchemaColumn[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const schemasApi = {
  list: () => apiFetch<ProviderSchema[]>('/schemas'),
  get: (providerType: string) => apiFetch<ProviderSchema>(`/schemas/${providerType}`),
  upsert: (providerType: string, dto: { name?: string; description?: string | null; columns: SchemaColumn[]; isActive?: boolean }) =>
    apiFetch<ProviderSchema>(`/schemas/${providerType}`, { method: 'PATCH', body: dto }),
};
