const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200/api';

function getStaffToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('bizdata_staff_token');
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | object | null;
  skipJsonContentType?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = getStaffToken();
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
    // Expired / invalid / MISSING session on an authenticated request → clear and
    // bounce to login. This fires whether or not a token was attached: an absent
    // token still 401s, and without this the page would sit showing empty data
    // (each dashboard fetch silently catches the error) instead of prompting a
    // sign-in. Guard with a session flag so parallel 401s don't each navigate.
    if (res.status === 401 && typeof window !== 'undefined') {
      // Clear BOTH the raw token key AND the zustand-persisted store snapshot
      // (bizdata-staff-auth holds {user, token}). Clearing only the raw key left
      // the store still "authenticated", so the login page's guard bounced back
      // to /dashboard → 401 → /login … an infinite redirect (the app "blinking").
      localStorage.removeItem('bizdata_staff_token');
      localStorage.removeItem('bizdata-staff-auth');
      if (!window.location.pathname.startsWith('/login') && !sessionStorage.getItem('bizdata_redirecting')) {
        sessionStorage.setItem('bizdata_redirecting', '1');
        const from = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?expired=1&from=${from}`;
      }
    }
    const err = new Error(message || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  // Healthy response → session is good; clear any stale redirect guard.
  if (typeof window !== 'undefined') sessionStorage.removeItem('bizdata_redirecting');

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Pull the server's own explanation out of a failed response.
 *
 * A couple of viewers (the case evidence bundle / AI tax report, the compliance
 * demand notice) deliberately bypass `apiFetch` because they want raw HTML back
 * rather than JSON. In doing so they threw the response body away and reported
 * the status alone — so a 403 whose body said exactly what to do next,
 *
 *   "You are not assigned to this case. Request (or self-assign, if permitted)
 *    access before viewing its records."
 *
 * reached the user as "Failed to load (403)". The access controls those screens
 * sit behind are self-service by design; hiding the reason turned every denial
 * into a support call.
 *
 * Falls back to the status when the body carries nothing useful — an HTML error
 * page from a proxy is not worth showing raw.
 */
export async function readErrorMessage(res: Response, fallback?: string): Promise<string> {
  try {
    const text = await res.text();
    if (text) {
      try {
        const data = JSON.parse(text) as { message?: unknown; error?: unknown };
        let m = data.message ?? data.error;
        if (Array.isArray(m)) m = m.join('; ');
        if (typeof m === 'string' && m.trim()) return m;
      } catch {
        // Not JSON — a proxy error page or plain text. Ignore it.
      }
    }
  } catch {
    // Body already consumed or unreadable.
  }
  return fallback ?? `Failed to load (${res.status})`;
}
