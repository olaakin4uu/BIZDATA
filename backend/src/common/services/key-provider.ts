import { createHash } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * Key-provider seam for PII field encryption.
 *
 * The rest of the app never sees a raw key — it asks the provider for the ACTIVE
 * key to encrypt with, or for a specific key BY ID to decrypt historical data.
 * This is the single integration point for an HSM (PKCS#11, FIPS 140-2 L3) or a
 * cloud KMS: implement KeyProvider against the HSM/KMS and register it in place
 * of EnvKeyProvider — encrypt/decrypt, rotation, and lazy re-encryption above it
 * are unchanged.
 *
 * Rotation model (envelope-style, versioned):
 *   - Each key has a stable string id (e.g. "1", "2") and a creation time.
 *   - Exactly one key is ACTIVE; new ciphertext is tagged with its id.
 *   - Old keys stay available for DECRYPTION so a rotation needs no big-bang
 *     re-encrypt. Data re-encrypts lazily (on read) or via a migration job.
 */
export interface ManagedKey {
  id: string;
  key: Buffer; // 32 bytes (AES-256)
  createdAt: Date;
}

export interface KeyProvider {
  /** The key new ciphertext must be encrypted with. */
  activeKey(): ManagedKey;
  /** A key by id, for decrypting historical ciphertext. Null if unknown. */
  keyById(id: string): ManagedKey | null;
  /** All keys the provider knows about (active + retired), for status/rotation. */
  allKeys(): ManagedKey[];
}

/**
 * Env-backed key provider (default). Versioned keys come from env:
 *   PII_ENC_KEY            → key id "1"
 *   PII_ENC_KEY_2          → key id "2"
 *   PII_ENC_KEY_3          → key id "3"  … and so on
 *   PII_ENC_ACTIVE_KEY_ID  → which id is active (defaults to the highest present)
 *   PII_ENC_KEY_2_CREATED  → optional ISO date the key was provisioned (for the
 *                            90-day rotation clock); defaults to process start.
 *
 * A KMS/HSM provider would implement the same interface with getKey/decrypt
 * calls instead of env reads.
 */
export class EnvKeyProvider implements KeyProvider {
  private readonly logger = new Logger(EnvKeyProvider.name);
  private readonly keys = new Map<string, ManagedKey>();
  private activeId!: string;

  constructor(isProd: boolean, startedAt: Date) {
    // Discover PII_ENC_KEY (id 1) and PII_ENC_KEY_N (id N).
    const found: { id: string; env: string }[] = [];
    if (process.env.PII_ENC_KEY) found.push({ id: '1', env: 'PII_ENC_KEY' });
    for (let n = 2; n <= 20; n++) {
      if (process.env[`PII_ENC_KEY_${n}`]) found.push({ id: String(n), env: `PII_ENC_KEY_${n}` });
    }

    if (found.length === 0) {
      if (isProd) {
        throw new Error('PII_ENC_KEY is required in production — refusing to start without a PII key.');
      }
      // Dev fallback: one deterministic key derived from JWT_SECRET, id "dev".
      this.logger.warn('PII_ENC_KEY not set — deriving a DEV key from JWT_SECRET. Do NOT use this for production data.');
      const secret = process.env.JWT_SECRET || 'bizdata-dev-secret';
      const key = createHash('sha256').update(`pii-enc:${secret}`).digest();
      this.keys.set('dev', { id: 'dev', key, createdAt: startedAt });
      this.activeId = 'dev';
      return;
    }

    for (const f of found) {
      const key = Buffer.from(process.env[f.env]!, 'base64');
      if (key.length !== 32) throw new Error(`${f.env} must decode to exactly 32 bytes (AES-256).`);
      const createdRaw = process.env[`${f.env}_CREATED`];
      const createdAt = createdRaw ? new Date(createdRaw) : startedAt;
      this.keys.set(f.id, { id: f.id, key, createdAt });
    }

    // Active id: explicit env, else the highest numeric id present.
    const explicit = process.env.PII_ENC_ACTIVE_KEY_ID;
    if (explicit && this.keys.has(explicit)) {
      this.activeId = explicit;
    } else {
      this.activeId = found
        .map((f) => f.id)
        .sort((a, b) => Number(b) - Number(a))[0];
    }
  }

  activeKey(): ManagedKey {
    const k = this.keys.get(this.activeId);
    if (!k) throw new Error('No active PII encryption key configured.');
    return k;
  }

  keyById(id: string): ManagedKey | null {
    return this.keys.get(id) ?? null;
  }

  allKeys(): ManagedKey[] {
    return [...this.keys.values()];
  }
}
