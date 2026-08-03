import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'crypto';
import { EnvKeyProvider, KmsKeyProvider, KeyProvider, assertEnvironmentLoaded } from './key-provider';
import { resolveKms } from './kms';

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
 * Storage format (versioned, key-tagged):
 *   v2.<keyId>.<iv_b64>.<tag_b64>.<ciphertext_b64>   ← current, carries key id
 *   v1.<iv_b64>.<tag_b64>.<ciphertext_b64>           ← legacy, single key (id "1")
 * Tagging the key id lets a rotation add a new active key WITHOUT re-encrypting
 * everything at once: old data still decrypts under its original key.
 *
 * Keys come from a KeyProvider (see key-provider.ts) — env-backed by default,
 * swappable for an HSM/KMS. The blind-index key stays single/stable because
 * rotating it would invalidate every stored index; it is not part of rotation.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private keys!: KeyProvider;
  private indexKey!: Buffer;
  private static readonly V2 = 'v2';
  private static readonly V1 = 'v1';

  async onModuleInit() {
    const isProd = process.env.NODE_ENV === 'production';
    this.keys = await this.selectKeyProvider(isProd);
    this.indexKey = this.loadIndexKey(isProd);

    const active = this.keys.activeKey();
    this.logger.log(`PII encryption ready — provider ${this.keys.constructor.name}, active key id "${active.id}", ${this.keys.allKeys().length} key(s) available.`);
  }

  /**
   * Choose the key provider. When PII_KMS_PROVIDER is set, keys are envelope-
   * encrypted: wrapped DEKs are unwrapped once at boot via the KMS/HSM
   * (KmsKeyProvider) and never stored in the clear. Otherwise keys load directly
   * from env (EnvKeyProvider) — fine for dev, acceptable for prod only when the
   * host itself is the trust boundary. This one method is the HSM/KMS seam.
   */
  private async selectKeyProvider(isProd: boolean): Promise<KeyProvider> {
    const kmsProvider = process.env.PII_KMS_PROVIDER;
    if (kmsProvider) {
      const kms = resolveKms(kmsProvider);
      const deks = KmsKeyProvider.deksFromEnv();
      if (!deks.length) throw new Error('PII_KMS_PROVIDER is set but no wrapped DEK (PII_WRAPPED_DEK[_N]) is configured.');
      this.logger.log(`Using KMS key provider "${kmsProvider}" (envelope encryption).`);
      return KmsKeyProvider.create(kms, deks, process.env.PII_ENC_ACTIVE_KEY_ID);
    }
    return new EnvKeyProvider(isProd, new Date());
  }

  /** The blind-index key is single and stable (rotating it breaks all indexes). */
  private loadIndexKey(isProd: boolean): Buffer {
    const raw = process.env.PII_INDEX_KEY;
    if (raw) {
      const b = Buffer.from(raw, 'base64');
      if (b.length !== 32) throw new Error('PII_INDEX_KEY must decode to exactly 32 bytes.');
      return b;
    }
    if (isProd) throw new Error('PII_INDEX_KEY is required in production.');
    // Same guard as the encryption key: no PII_INDEX_KEY *and* no JWT_SECRET
    // means no environment was loaded, and a blind index written under a
    // repository-published secret is worse than none — it silently fails to
    // match everything the app computes.
    assertEnvironmentLoaded('PII_INDEX_KEY');
    this.logger.warn('PII_INDEX_KEY not set — deriving a DEV index key from JWT_SECRET.');
    return createHash('sha256').update(`pii-index:${process.env.JWT_SECRET}`).digest();
  }

  /** AES-256-GCM encrypt a string with the ACTIVE key. Returns null for empty. */
  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext == null || plaintext === '') return null;
    const active = this.keys.activeKey();
    const iv = randomBytes(12); // 96-bit nonce, recommended for GCM
    const cipher = createCipheriv('aes-256-gcm', active.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${CryptoService.V2}.${active.id}.${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
  }

  /** Decrypt a value produced by encrypt() (v2 key-tagged or legacy v1). */
  decrypt(payload: string | null | undefined): string | null {
    if (payload == null || payload === '') return null;
    const parts = payload.split('.');

    // v2.<keyId>.<iv>.<tag>.<ct> — select the key by id.
    if (parts.length === 5 && parts[0] === CryptoService.V2) {
      const [, keyId, ivB64, tagB64, ctB64] = parts;
      const mk = this.keys.keyById(keyId);
      if (!mk) {
        this.logger.error(`PII decryption failed — unknown key id "${keyId}".`);
        return null;
      }
      return this.gcmDecrypt(mk.key, ivB64, tagB64, ctB64);
    }

    // v1.<iv>.<tag>.<ct> — legacy single key (id "1", or the dev key).
    if (parts.length === 4 && parts[0] === CryptoService.V1) {
      const [, ivB64, tagB64, ctB64] = parts;
      const mk = this.keys.keyById('1') ?? this.keys.keyById('dev') ?? this.keys.activeKey();
      return this.gcmDecrypt(mk.key, ivB64, tagB64, ctB64);
    }

    // Not an encrypted payload (e.g. legacy plaintext) — return as-is.
    return payload;
  }

  private gcmDecrypt(key: Buffer, ivB64: string, tagB64: string, ctB64: string): string | null {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
      return pt.toString('utf8');
    } catch {
      this.logger.error('PII decryption failed (key mismatch or tampered ciphertext).');
      return null;
    }
  }

  /** True if a stored ciphertext was written under a non-active key (or legacy
   *  format) and should be re-encrypted under the active key. */
  needsReencrypt(payload: string | null | undefined): boolean {
    if (!payload) return false;
    const parts = payload.split('.');
    if (parts.length === 5 && parts[0] === CryptoService.V2) return parts[1] !== this.keys.activeKey().id;
    if (parts.length === 4 && parts[0] === CryptoService.V1) return true; // legacy → migrate
    return false; // plaintext / not ours
  }

  /** Re-encrypt a ciphertext under the active key (decrypt-then-encrypt). No-op
   *  when already active. Returns the (possibly unchanged) payload. */
  reencrypt(payload: string | null | undefined): string | null {
    if (!payload || !this.needsReencrypt(payload)) return payload ?? null;
    return this.encrypt(this.decrypt(payload));
  }

  /**
   * Key-rotation status for the governance/DPO view. Flags any key older than
   * `maxAgeDays` (default 90) so an operator knows a rotation is due. In an HSM
   * deployment the HSM enforces rotation; this surfaces it in the app too.
   */
  rotationStatus(maxAgeDays = 90): {
    activeKeyId: string;
    keyCount: number;
    activeKeyAgeDays: number;
    rotationDue: boolean;
    keys: { id: string; ageDays: number; active: boolean }[];
  } {
    const now = Date.now();
    const active = this.keys.activeKey();
    const ageDays = (d: Date) => Math.floor((now - d.getTime()) / 86_400_000);
    const keys = this.keys.allKeys().map((k) => ({ id: k.id, ageDays: ageDays(k.createdAt), active: k.id === active.id }));
    const activeAge = ageDays(active.createdAt);
    return {
      activeKeyId: active.id,
      keyCount: keys.length,
      activeKeyAgeDays: activeAge,
      rotationDue: activeAge >= maxAgeDays,
      keys,
    };
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
