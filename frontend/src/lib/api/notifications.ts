import { apiFetch } from './client';

export interface Notification {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  entity?: string | null;
  entityId?: string | null;
  read: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: () => apiFetch<Notification[]>('/notifications'),
  markRead: (id: string) => apiFetch<Notification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  generate: (year: number) => apiFetch<{ created: number }>('/notifications/generate', { method: 'POST', body: { year } }),
};
