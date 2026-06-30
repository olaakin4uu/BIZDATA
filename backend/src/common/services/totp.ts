import { createHmac, randomBytes } from 'crypto';

/**
 * Minimal RFC-6238 TOTP (SHA-1, 6 digits, 30-second step) — compatible with
 * Google Authenticator / Authy / FreeOTP. Self-contained (Node crypto only) to
 * avoid third-party API churn. Secrets are RFC-4648 Base32 strings.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return (bin % 1_000_000).toString().padStart(6, '0');
}

/** Generate a new Base32 TOTP secret (160-bit). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Current TOTP code for a Base32 secret. */
export function totp(secret: string, time = Date.now()): string {
  return hotp(base32Decode(secret), Math.floor(time / 1000 / 30));
}

/** Verify a token, tolerating ±`window` 30s steps for clock drift. */
export function verifyTotp(token: string, secret: string, window = 1): boolean {
  if (!token || !secret) return false;
  const buf = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (hotp(buf, counter + w) === token.trim()) return true;
  }
  return false;
}

/** otpauth:// provisioning URI for authenticator-app enrolment. */
export function keyuri(label: string, issuer: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
