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
 * The minimal contract a KMS / HSM must satisfy for envelope encryption.
 *
 * BizData's PII data-encryption keys (DEKs) are never stored in the clear. Each
 * is generated once, then WRAPPED by a key-encryption-key (KEK) that lives
 * inside the KMS/HSM and never leaves it. Config holds only the wrapped DEK
 * ciphertext; at boot the app calls `unwrap()` to recover the DEK into memory.
 *
 * A concrete implementation is a thin adapter over a vendor client:
 *   - AWS KMS:      client.decrypt({ CiphertextBlob }) → Plaintext
 *   - GCP KMS:      client.decrypt({ name, ciphertext }) → plaintext
 *   - Azure Key Vault: cryptoClient.unwrapKey('A256KW', wrapped) → key
 *   - PKCS#11 HSM:  C_Decrypt / C_UnwrapKey on the HSM session
 * The vendor SDK is added when the hosting/KMS decision is made — this seam and
 * the provider below are vendor-neutral, so it is a config swap, not a rewrite.
 */
export interface Kms {
  /** Unwrap (decrypt) a base64 wrapped-DEK blob into raw 32-byte key material. */
  unwrap(wrappedB64: string): Promise<Buffer> | Buffer;
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

/** A wrapped data-encryption key as stored in config: id + KMS-wrapped blob. */
export interface WrappedDek {
  id: string;
  wrappedB64: string;
  createdAt?: Date;
}

/**
 * KMS/HSM-backed key provider (envelope encryption).
 *
 * DEKs are stored wrapped and unwrapped ONCE at boot via the injected `Kms`,
 * then held in memory and served synchronously — so per-operation encrypt/
 * decrypt stay hot (no KMS round-trip per field). Raw key bytes never touch
 * disk or config. Construct with the async `create()` factory since unwrapping
 * is async.
 *
 * Config (env, when using this provider):
 *   PII_KMS_PROVIDER=aws|gcp|azure|pkcs11   → selects the concrete Kms adapter
 *   PII_WRAPPED_DEK       → wrapped DEK id "1"      (base64)
 *   PII_WRAPPED_DEK_2     → wrapped DEK id "2" … etc.
 *   PII_ENC_ACTIVE_KEY_ID → active id (defaults to the highest present)
 *   PII_WRAPPED_DEK_2_CREATED → optional ISO provisioning date (rotation clock)
 */
export class KmsKeyProvider implements KeyProvider {
  private readonly keys = new Map<string, ManagedKey>();
  private activeId!: string;

  private constructor() {}

  /** Unwrap every configured DEK via the KMS and build the provider. */
  static async create(kms: Kms, deks: WrappedDek[], activeId?: string, startedAt = new Date()): Promise<KmsKeyProvider> {
    if (!deks.length) throw new Error('KmsKeyProvider requires at least one wrapped DEK.');
    const p = new KmsKeyProvider();
    for (const d of deks) {
      const key = await kms.unwrap(d.wrappedB64);
      if (key.length !== 32) throw new Error(`Unwrapped DEK "${d.id}" must be exactly 32 bytes (AES-256), got ${key.length}.`);
      p.keys.set(d.id, { id: d.id, key, createdAt: d.createdAt ?? startedAt });
    }
    // Active id: explicit, else the highest numeric id present.
    if (activeId && p.keys.has(activeId)) {
      p.activeId = activeId;
    } else {
      p.activeId = deks.map((d) => d.id).sort((a, b) => Number(b) - Number(a))[0];
    }
    return p;
  }

  /** Discover wrapped DEKs from env (PII_WRAPPED_DEK / PII_WRAPPED_DEK_N). */
  static deksFromEnv(startedAt = new Date()): WrappedDek[] {
    const out: WrappedDek[] = [];
    const push = (id: string, env: string) => {
      const wrappedB64 = process.env[env];
      if (!wrappedB64) return;
      const createdRaw = process.env[`${env}_CREATED`];
      out.push({ id, wrappedB64, createdAt: createdRaw ? new Date(createdRaw) : startedAt });
    };
    push('1', 'PII_WRAPPED_DEK');
    for (let n = 2; n <= 20; n++) push(String(n), `PII_WRAPPED_DEK_${n}`);
    return out;
  }

  activeKey(): ManagedKey {
    const k = this.keys.get(this.activeId);
    if (!k) throw new Error('No active PII encryption key (KMS).');
    return k;
  }

  keyById(id: string): ManagedKey | null {
    return this.keys.get(id) ?? null;
  }

  allKeys(): ManagedKey[] {
    return [...this.keys.values()];
  }
}
