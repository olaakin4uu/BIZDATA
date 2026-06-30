import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'crypto';

/**
 * Field-level encryption for sensitive PII at rest (NTAA §139 / NDPA §§25-28).
 *
 * Two primitives:
 *  - encrypt()/decrypt(): AES-256-GCM authenticated encryption. The IV is random
 *    per call, so ciphertext is non-deterministic — secure, but NOT searchable.
 *  - blindIndex(): keyed HMAC-SHA256. Deterministic, so it CAN back a unique
 *    constraint and equality lookup without ever storing the plaintext. This is
 *    how we keep BVN/NIN/TIN unique and matchable while encrypting the value.
 *
 * Storage format for encrypt(): "v1.<iv_b64>.<tag_b64>.<ciphertext_b64>".
 * The version prefix allows key rotation / format changes later.
 *
 * Keys come from env (base64). In production they are REQUIRED; in development
 * a deterministic key is derived from JWT_SECRET so the app still runs, with a
 * loud warning — never rely on that for real data.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private encKey!: Buffer; // 32 bytes for AES-256
  private indexKey!: Buffer;
  private static readonly VERSION = 'v1';

  onModuleInit() {
    const isProd = process.env.NODE_ENV === 'production';

    this.encKey = this.loadKey('PII_ENC_KEY', isProd, 'pii-enc');
    this.indexKey = this.loadKey('PII_INDEX_KEY', isProd, 'pii-index');

    if (this.encKey.length !== 32) {
      throw new Error('PII_ENC_KEY must decode to exactly 32 bytes (AES-256).');
    }
  }

  /**
   * Key-provider seam. Today keys load from env (base64). This single method is
   * the integration point for an HSM/KMS in production: replace the env read
   * with a PKCS#11 call (FIPS 140-2 L3 HSM) or a cloud-KMS `decrypt`/`getKey`,
   * keeping the rest of the service unchanged. 90-day rotation + dual control
   * are then enforced at the HSM/KMS layer.
   */
  private loadKey(envName: string, isProd: boolean, devSalt: string): Buffer {
    const raw = process.env[envName];
    if (raw) {
      try {
        return Buffer.from(raw, 'base64');
      } catch {
        throw new Error(`${envName} is not valid base64.`);
      }
    }
    if (isProd) {
      throw new Error(`${envName} is required in production — refusing to start without a PII key.`);
    }
    // Dev fallback: deterministic 32-byte key derived from JWT_SECRET.
    this.logger.warn(
      `${envName} not set — deriving a DEV key from JWT_SECRET. Do NOT use this for production data.`,
    );
    const secret = process.env.JWT_SECRET || 'bizdata-dev-secret';
    return createHash('sha256').update(`${devSalt}:${secret}`).digest();
  }

  /** AES-256-GCM encrypt a string. Returns null for null/empty input. */
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext == null || plaintext === '') return null;
    const iv = randomBytes(12); // 96-bit nonce, recommended for GCM
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${CryptoService.VERSION}.${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
  }

  /** Decrypt a value produced by encrypt(). Returns null for null input. */
  decrypt(payload: string | null | undefined): string | null {
    if (payload == null || payload === '') return null;
    const parts = payload.split('.');
    if (parts.length !== 4 || parts[0] !== CryptoService.VERSION) {
      // Not an encrypted payload (e.g. legacy plaintext) — return as-is so the
      // app degrades gracefully on un-migrated rows.
      return payload;
    }
    try {
      const [, ivB64, tagB64, ctB64] = parts;
      const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
      return pt.toString('utf8');
    } catch (err) {
      this.logger.error('PII decryption failed (key mismatch or tampered ciphertext).');
      return null;
    }
  }

  /** Deterministic keyed HMAC for equality lookup / uniqueness. */
  blindIndex(value: string | null | undefined): string | null {
    if (value == null || value === '') return null;
    return createHmac('sha256', this.indexKey).update(value.trim()).digest('hex');
  }

  /** Constant-time comparison of two blind indexes. */
  indexMatches(a: string | null, b: string | null): boolean {
    if (!a || !b || a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
