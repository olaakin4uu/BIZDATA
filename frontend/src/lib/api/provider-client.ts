const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';

function getProviderToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('bizdata_provider_token');
}

export interface ProviderApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | object | null;
  skipJsonContentType?: boolean;
}

export async function providerApiFetch<T>(path: string, options: ProviderApiFetchOptions = {}): Promise<T> {
  const token = getProviderToken();
  const { skipJsonContentType, body, headers: optHeaders, ...rest } = options;

  let finalBody: BodyInit | null | undefined;
  const baseHeaders: Record<string, string> = {};
  if (body instanceof FormData) {
    finalBody = body;
  } else if (body != null && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
    finalBody = JSON.stringify(body);
    baseHeaders['Content-Type'] = 'application/json';
  } else if (typeof body === 'string') {
    finalBody = body;
    if (!skipJsonContentType) baseHeaders['Content-Type'] = 'application/json';
  } else {
    finalBody = body as BodyInit | null | undefined;
  }

  if (token) baseHeaders['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    body: finalBody,
    headers: { ...baseHeaders, ...(optHeaders as Record<string, string> | undefined) },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.message || data.error || message;
      if (Array.isArray(message)) message = message.join('; ');
    } catch {
      // ignore
    }
    throw new Error(message || `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
