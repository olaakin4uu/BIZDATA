import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';
import { CryptoService } from './crypto.service';

// Keep test output clean — the service logs an init line per instantiation.
beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
afterAll(() => jest.restoreAllMocks());

/** Build a CryptoService with a given env and run its init. */
function makeService(env: Record<string, string | undefined>): CryptoService {
  // Reset the PII_* env surface, then apply the requested values.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('PII_ENC') || k === 'PII_INDEX_KEY') delete process.env[k];
  }
  process.env.NODE_ENV = 'test';
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const svc = new CryptoService();
  (svc as any).onModuleInit();
  return svc;
}

const key1 = randomBytes(32).toString('base64');
const key2 = randomBytes(32).toString('base64');
const indexKey = randomBytes(32).toString('base64');

describe('CryptoService — encryption', () => {
  const svc = makeService({ PII_ENC_KEY: key1, PII_INDEX_KEY: indexKey });

  it('round-trips a value', () => {
    const ct = svc.encrypt('12345678901');
    expect(ct).not.toBeNull();
    expect(ct).toMatch(/^v2\.1\./); // key-tagged, active key id "1"
    expect(svc.decrypt(ct)).toBe('12345678901');
  });

  it('returns null for empty/null input', () => {
    expect(svc.encrypt(null)).toBeNull();
    expect(svc.encrypt('')).toBeNull();
    expect(svc.decrypt(null)).toBeNull();
  });

  it('produces different ciphertext each call (random IV) but same plaintext', () => {
    const a = svc.encrypt('same');
    const b = svc.encrypt('same');
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe('same');
    expect(svc.decrypt(b)).toBe('same');
  });

  it('returns non-ciphertext payloads unchanged (graceful on legacy plaintext)', () => {
    expect(svc.decrypt('not-encrypted')).toBe('not-encrypted');
  });

  it('blind index is deterministic and matchable', () => {
    const a = svc.blindIndex('12345678901');
    const b = svc.blindIndex('12345678901');
    expect(a).toBe(b);
    expect(svc.blindIndex('other')).not.toBe(a);
    expect(svc.indexMatches(a, b)).toBe(true);
    expect(svc.indexMatches(a, svc.blindIndex('other'))).toBe(false);
  });

  it('decrypts a legacy v1 payload under key id 1', () => {
    // Hand-build a v1 ciphertext using key1 via the same service internals:
    // easiest is to encrypt then rewrite the version tag from v2.1 → v1.
    const v2 = svc.encrypt('legacy')!; // v2.1.<iv>.<tag>.<ct>
    const parts = v2.split('.');
    const v1 = ['v1', parts[2], parts[3], parts[4]].join('.');
    expect(svc.decrypt(v1)).toBe('legacy');
  });
});

describe('CryptoService — key rotation', () => {
  it('after rotation, new writes use the new key while old data still decrypts', () => {
    const svc1 = makeService({ PII_ENC_KEY: key1, PII_INDEX_KEY: indexKey });
    const ct1 = svc1.encrypt('secret')!;
    expect(ct1).toMatch(/^v2\.1\./);

    // Rotate: add key 2 and make it active.
    const svc2 = makeService({
      PII_ENC_KEY: key1,
      PII_ENC_KEY_2: key2,
      PII_ENC_ACTIVE_KEY_ID: '2',
      PII_INDEX_KEY: indexKey,
    });
    const ct2 = svc2.encrypt('secret')!;
    expect(ct2).toMatch(/^v2\.2\./);
    expect(svc2.decrypt(ct1)).toBe('secret'); // old data still readable
    expect(svc2.decrypt(ct2)).toBe('secret');
  });

  it('needsReencrypt flags old-key + legacy data, not active-key data', () => {
    const svc2 = makeService({
      PII_ENC_KEY: key1,
      PII_ENC_KEY_2: key2,
      PII_ENC_ACTIVE_KEY_ID: '2',
      PII_INDEX_KEY: indexKey,
    });
    const oldCt = ['v2', '1', 'aa', 'bb', 'cc'].join('.'); // tagged key 1, not active
    const newCt = svc2.encrypt('x')!; // tagged key 2 (active)
    expect(svc2.needsReencrypt(oldCt)).toBe(true);
    expect(svc2.needsReencrypt(newCt)).toBe(false);
    expect(svc2.needsReencrypt('v1.aa.bb.cc')).toBe(true); // legacy → migrate
    expect(svc2.needsReencrypt(null)).toBe(false);
  });

  it('reencrypt moves an old-key value onto the active key, still decryptable', () => {
    const svc1 = makeService({ PII_ENC_KEY: key1, PII_INDEX_KEY: indexKey });
    const ct1 = svc1.encrypt('rotate-me')!;
    const svc2 = makeService({
      PII_ENC_KEY: key1,
      PII_ENC_KEY_2: key2,
      PII_ENC_ACTIVE_KEY_ID: '2',
      PII_INDEX_KEY: indexKey,
    });
    const re = svc2.reencrypt(ct1)!;
    expect(re).toMatch(/^v2\.2\./);
    expect(svc2.decrypt(re)).toBe('rotate-me');
    expect(svc2.needsReencrypt(re)).toBe(false);
  });

  it('rotationStatus flags a key older than 90 days', () => {
    const svc = makeService({
      PII_ENC_KEY: key1,
      PII_ENC_KEY_2: key2,
      PII_ENC_KEY_2_CREATED: '2020-01-01',
      PII_ENC_ACTIVE_KEY_ID: '2',
      PII_INDEX_KEY: indexKey,
    });
    const status = svc.rotationStatus();
    expect(status.activeKeyId).toBe('2');
    expect(status.rotationDue).toBe(true);
    expect(status.activeKeyAgeDays).toBeGreaterThan(90);
  });

  it('rotationStatus reports not-due for a fresh key', () => {
    const svc = makeService({ PII_ENC_KEY: key1, PII_INDEX_KEY: indexKey });
    expect(svc.rotationStatus().rotationDue).toBe(false);
  });
});
