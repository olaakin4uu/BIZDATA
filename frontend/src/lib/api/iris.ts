import { apiFetch } from './client';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';

export interface IrisCard {
  draftId: string;
  kind: string;
  title: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface IrisChatResponse {
  conversationId: string;
  reply: string;
  cards: IrisCard[];
}

export interface IrisConfirmResponse {
  status: string;
  message?: string;
  resultRef?: string;
  download?: { exportId: string; fileName: string };
}

export const irisApi = {
  chat: (message: string, conversationId?: string) =>
    apiFetch<IrisChatResponse>('/iris/chat', { method: 'POST', body: { message, conversationId } }),
  confirm: (draftId: string) =>
    apiFetch<IrisConfirmResponse>(`/iris/drafts/${draftId}/confirm`, { method: 'POST' }),
  cancel: (draftId: string) =>
    apiFetch<{ status: string }>(`/iris/drafts/${draftId}/cancel`, { method: 'POST' }),
};

/**
 * Encrypted export download. apiFetch parses JSON, so we fetch the binary
 * directly with the staff bearer token and stream it to a file. The server
 * decrypts for the owner and audits the download.
 */
export async function downloadIrisExport(exportId: string, fileName: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('bizdata_staff_token') : null;
  const res = await fetch(`${BASE}/iris/exports/${exportId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
