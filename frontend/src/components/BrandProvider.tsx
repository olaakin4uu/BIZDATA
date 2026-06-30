'use client';
import { useEffect } from 'react';
import { tenantApi } from '@/lib/api/tenant';
import { applyBrandColor } from '@/lib/brand';

/** Loads the tenant's theme colour once and re-skins the app. Renders nothing. */
export default function BrandProvider() {
  useEffect(() => {
    tenantApi.branding().then((b) => applyBrandColor(b.themeColor)).catch(() => {});
  }, []);
  return null;
}
