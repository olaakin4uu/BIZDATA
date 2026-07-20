import { apiFetch } from './client';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';

export interface IrisCard {
  draftId: string;
  kind: string;
  title: string;
  summary: string;
  details?: { label: string; value: string }[];
  body?: string;
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

export interface IrisConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface IrisConversationDetail {
  conversationId: string;
  title: string | null;
  messages: { role: string; text: string }[];
}

export const irisApi = {
  chat: (message: string, conversationId?: string) =>
    apiFetch<IrisChatResponse>('/iris/chat', { method: 'POST', body: { message, conversationId } }),
  confirm: (draftId: string) =>
    apiFetch<IrisConfirmResponse>(`/iris/drafts/${draftId}/confirm`, { method: 'POST' }),
  cancel: (draftId: string) =>
    apiFetch<{ status: string }>(`/iris/drafts/${draftId}/cancel`, { method: 'POST' }),
  listConversations: () => apiFetch<IrisConversationSummary[]>('/iris/conversations'),
  getConversation: (id: string) => apiFetch<IrisConversationDetail>(`/iris/conversations/${id}`),
};

export interface IrisStreamHandlers {
  onThinking?: (text: string) => void;
  onTool?: (name: string) => void;
  onDelta: (text: string) => void;
  onDone: (r: { conversationId: string; reply: string; cards: IrisCard[] }) => void;
  onError: (message: string) => void;
  onStopped?: () => void;
}

/** Stream a reply over SSE (thinking → tool → delta → done). Reads the POST
 *  body stream directly since apiFetch parses JSON. Pass an AbortSignal to stop. */
export async function chatStream(
  message: string,
  conversationId: string | undefined,
  h: IrisStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('bizdata_staff_token') : null;
  let res: Response;
  try {
    res = await fetch(`${BASE}/iris/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, conversationId }),
      signal,
    });
  } catch {
    if (signal?.aborted) h.onStopped?.();
    else h.onError('Network error.');
    return;
  }
  if (!res.ok || !res.body) {
    h.onError(`Request failed (${res.status})`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const e = JSON.parse(line.slice(5).trim());
          if (e.type === 'thinking') h.onThinking?.(e.text);
          else if (e.type === 'tool') h.onTool?.(e.name);
          else if (e.type === 'delta') h.onDelta(e.text);
          else if (e.type === 'done') h.onDone(e);
          else if (e.type === 'error') h.onError(e.message);
        } catch {
          /* ignore partial frame */
        }
      }
    }
  } catch {
    if (signal?.aborted) h.onStopped?.();
    else h.onError('Stream interrupted.');
  }
}

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
