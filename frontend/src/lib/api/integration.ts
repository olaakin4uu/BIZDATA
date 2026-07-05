import { apiFetch } from './client';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}
export interface NewApiKey {
  id: string;
  name: string;
  apiKey: string; // shown once
  keyPrefix: string;
  createdAt: string;
}

export const integrationApi = {
  listKeys: () => apiFetch<ApiKeyRecord[]>('/integration/keys'),
  createKey: (name: string) => apiFetch<NewApiKey>('/integration/keys', { method: 'POST', body: { name } }),
  revokeKey: (id: string) => apiFetch<{ success: boolean }>(`/integration/keys/${id}`, { method: 'DELETE' }),
};
