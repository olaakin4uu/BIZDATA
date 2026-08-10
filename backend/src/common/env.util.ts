/**
 * FRONTEND_URL is comma-separated (it doubles as the CORS allow-list in
 * main.ts) — e.g. "https://findata.kirs.gov.ng,https://findata.digitalaura.app".
 * Anything building a single link (password reset, provider invite) must use
 * only the first entry, or it ends up with the raw comma-joined string glued
 * onto the URL.
 */
export function primaryFrontendUrl(): string {
  return (process.env.FRONTEND_URL || '').split(',')[0].trim();
}
