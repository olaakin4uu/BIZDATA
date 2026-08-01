'use client';
import { useEffect, useState } from 'react';
import { tenantApi, type TenantBranding } from './api/tenant';

/**
 * The organisation's branding — name, uploaded logo, theme colour — as set on
 * the staff Settings page.
 *
 * It only changes when an admin edits Settings, so the response is fetched once
 * per page load and shared. Without this, the theme-colour applier, the nav, and
 * the login screens would each hit /tenant/branding separately on the same view.
 * A failed request is not cached, so the next mount retries.
 */
let inflight: Promise<TenantBranding> | null = null;

export function loadBranding(): Promise<TenantBranding> {
  if (!inflight) {
    inflight = tenantApi.branding().catch((err) => {
      inflight = null;
      throw err;
    });
  }
  return inflight;
}

/**
 * Tenant branding, or null while it loads — and null for good if the request
 * fails, so every caller must render a sensible unbranded fallback.
 */
export function useBranding(): TenantBranding | null {
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  useEffect(() => {
    let alive = true;
    loadBranding()
      .then((b) => { if (alive) setBranding(b); })
      .catch(() => { /* caller falls back to the generic mark */ });
    return () => { alive = false; };
  }, []);
  return branding;
}
