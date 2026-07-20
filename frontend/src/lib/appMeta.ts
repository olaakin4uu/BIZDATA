// Build/version metadata surfaced in the footer and user menu so support and
// incident triage can identify exactly what is deployed. Values come from
// NEXT_PUBLIC_* env at build time; sensible fallbacks keep local dev working.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0';
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD || null; // short commit sha, optional
export const APP_ENV =
  process.env.NEXT_PUBLIC_APP_ENV ||
  (process.env.NODE_ENV === 'production' ? 'production' : 'development');

/** True only in the real production environment (not staging). */
export const IS_PROD = APP_ENV === 'production';

/** Support contact surfaced in the footer — configurable per deployment. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@findata.local';
