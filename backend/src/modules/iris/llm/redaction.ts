/**
 * Redact-before-send (the "redact-then-Claude" privacy layer).
 *
 * Any text that leaves the box for the model is passed through here first. Tool
 * results are already masked per the caller's role by PiiAccessService; this is
 * the belt-and-braces pass for FREE-TEXT — e.g. an officer pasting a raw BVN
 * into the chat box. We mask the hard financial identifiers (BVN/NIN, NUBAN
 * account numbers, Nigerian phone numbers), keeping only a short suffix so the
 * model can still refer to "the taxpayer whose NIN ends 123".
 *
 * Names are deliberately NOT regex-redactable (that needs NER) and are governed
 * by role-based masking inside the tools. Financial identifiers are the sensitive
 * bits under NTAA §139 / NDPA §26; names are not secret the way a BVN is.
 */

function mask(digits: string, keep: number): string {
  if (digits.length <= keep) return '•'.repeat(digits.length);
  return '•'.repeat(digits.length - keep) + digits.slice(-keep);
}

export function redactPii(input: string): string {
  if (!input) return input;
  return input
    // Nigerian phone: +234XXXXXXXXXX or 0XXXXXXXXXX (do this first — it overlaps 11-digit)
    .replace(/\b(?:\+?234\d{10}|0\d{10})\b/g, (m) => mask(m, 4))
    // NIN / BVN — exactly 11 digits
    .replace(/\b\d{11}\b/g, (m) => mask(m, 3))
    // NUBAN account — exactly 10 digits
    .replace(/\b\d{10}\b/g, (m) => mask(m, 3));
}
