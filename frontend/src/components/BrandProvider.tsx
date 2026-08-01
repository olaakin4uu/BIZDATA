'use client';
import { useEffect } from 'react';
import { loadBranding } from '@/lib/branding';
import { applyBrandColor } from '@/lib/brand';

/** Loads the tenant's theme colour once and re-skins the app. Renders nothing. */
export default function BrandProvider() {
  useEffect(() => {
    loadBranding().then((b) => applyBrandColor(b.themeColor)).catch(() => {});
  }, []);
  return null;
}
