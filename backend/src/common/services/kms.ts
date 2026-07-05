import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Kms } from './key-provider';

/**
 * KMS adapters for envelope encryption of PII data-encryption keys (DEKs).
 *
 * A DEK is wrapped (encrypted) by a key-encryption-key (KEK) held in the
 * KMS/HSM. `unwrap()` decrypts a wrapped-DEK blob back to raw 32-byte key
 * material at boot. The concrete adapter is a thin call into the vendor client;
 * the rest of the app (CryptoService / KmsKeyProvider) is vendor-neutral.
 *
 * `resolveKms(name)` returns the adapter for PII_KMS_PROVIDER. Add a real vendor
 * by implementing `Kms` and registering it here — one file, no other changes.
 */
export function resolveKms(provider: string): Kms {
  switch (provider.toLowerCase()) {
    case 'local':
      return new LocalKms();
    case 'aws':
      return new AwsKms();
    case 'gcp':
      return new GcpKms();
    case 'azure':
      return new AzureKms();
    case 'pkcs11':
    case 'hsm':
      return new Pkcs11Kms();
    default:
      throw new Error(`Unknown PII_KMS_PROVIDER "${provider}". Expected one of: local, aws, gcp, azure, pkcs11.`);
  }
}

/**
 * Reference KMS: unwraps a DEK with a KEK supplied via PII_KMS_LOCAL_KEK (base64
 * 32 bytes). The wrapped-DEK format is the same AES-256-GCM envelope the app
 * uses elsewhere: v1.<iv>.<tag>.<ct>. This proves the envelope path end-to-end
 * WITHOUT a cloud account (dev / CI / on-prem) and shows exactly what a vendor
 * adapter must return. It is NOT an HSM — the KEK is still on the host — but it
 * validates the wiring so swapping in AWS/GCP/Azure/PKCS#11 is a drop-in.
 *
 * Wrap a DEK for local mode with the same scheme (see scripts/wrap-dek or the
 * unit tests). In production use a real adapter below.
 */
export class LocalKms implements Kms {
  private kek(): Buffer {
    const raw = process.env.PII_KMS_LOCAL_KEK;
    if (!raw) throw new Error('PII_KMS_LOCAL_KEK is required for the "local" KMS adapter (base64 32 bytes).');
    const kek = Buffer.from(raw, 'base64');
    if (kek.length !== 32) throw new Error('PII_KMS_LOCAL_KEK must decode to exactly 32 bytes.');
    return kek;
  }

  unwrap(wrappedB64: string): Buffer {
    // wrappedB64 is the base64 of "v1.<iv>.<tag>.<ct>" (utf8).
    const env = Buffer.from(wrappedB64, 'base64').toString('utf8');
    const parts = env.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('LocalKms: malformed wrapped DEK (expected v1.<iv>.<tag>.<ct> base64-encoded).');
    }
    const [, ivB64, tagB64, ctB64] = parts;
    const decipher = createDecipheriv('aes-256-gcm', this.kek(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  }
}

// ─── Vendor adapters (stubs — implement when the hosting/KMS is chosen) ───────
// Each throws a clear message until its SDK is installed and wired. Keeping them
// here documents the exact call each vendor needs and keeps `resolveKms`
// exhaustive, so turning one on is a one-file change.

function notWired(vendor: string, hint: string): never {
  throw new Error(
    `PII_KMS_PROVIDER="${vendor}" is not wired yet. Implement ${vendor}Kms.unwrap() in common/services/kms.ts: ${hint}`,
  );
}

/** AWS KMS: `new KMSClient().send(new DecryptCommand({ CiphertextBlob })).Plaintext`. */
export class AwsKms implements Kms {
  unwrap(_wrappedB64: string): Buffer {
    return notWired('aws', 'npm i @aws-sdk/client-kms; Decrypt the CiphertextBlob and return the Plaintext buffer.');
  }
}

/** GCP KMS: `kmsClient.decrypt({ name: keyName, ciphertext }).plaintext`. */
export class GcpKms implements Kms {
  unwrap(_wrappedB64: string): Buffer {
    return notWired('gcp', 'npm i @google-cloud/kms; call decrypt({name, ciphertext}) and return response.plaintext.');
  }
}

/** Azure Key Vault: `new CryptographyClient(keyId, cred).unwrapKey("A256KW", wrapped)`. */
export class AzureKms implements Kms {
  unwrap(_wrappedB64: string): Buffer {
    return notWired('azure', 'npm i @azure/keyvault-keys @azure/identity; unwrapKey("A256KW", wrapped).key.');
  }
}

/** PKCS#11 HSM (FIPS 140-2 L3): C_UnwrapKey / C_Decrypt on the HSM session. */
export class Pkcs11Kms implements Kms {
  unwrap(_wrappedB64: string): Buffer {
    return notWired('pkcs11', 'npm i graphene-pk11; open a session and C_Decrypt/C_UnwrapKey with the KEK handle.');
  }
}

/**
 * Wrap a raw DEK under a local KEK, producing the base64 blob LocalKms expects.
 * Exported for tooling/tests; not used at runtime. Mirrors the app's v1 envelope.
 */
export function localWrapDek(dek: Buffer, kek: Buffer): string {
  // Reuse the same AES-256-GCM envelope shape as the app.
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  const env = `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
  return Buffer.from(env, 'utf8').toString('base64');
}
