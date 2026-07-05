import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';
import { resolveKms, LocalKms, localWrapDek, AwsKms } from './kms';
import { KmsKeyProvider } from './key-provider';

const KEK = randomBytes(32);

// Keep test output clean — CryptoService/providers log an init line.
beforeAll(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
afterAll(() => jest.restoreAllMocks());

describe('resolveKms', () => {
  it('returns the local adapter and rejects unknown providers', () => {
    expect(resolveKms('local')).toBeInstanceOf(LocalKms);
    expect(() => resolveKms('nope')).toThrow(/Unknown PII_KMS_PROVIDER/);
  });

  it('vendor stubs throw a clear "not wired" message', () => {
    expect(() => new AwsKms().unwrap('x')).toThrow(/not wired/i);
  });
});

describe('LocalKms envelope', () => {
  beforeAll(() => { process.env.PII_KMS_LOCAL_KEK = KEK.toString('base64'); });
  afterAll(() => { delete process.env.PII_KMS_LOCAL_KEK; });

  it('unwraps a DEK that was wrapped under the same KEK', () => {
    const dek = randomBytes(32);
    const wrapped = localWrapDek(dek, KEK);
    const unwrapped = new LocalKms().unwrap(wrapped);
    expect(unwrapped.equals(dek)).toBe(true);
  });

  it('rejects a tampered / malformed wrapped blob', () => {
    expect(() => new LocalKms().unwrap('not-base64-envelope')).toThrow();
  });

  it('fails without a KEK configured', () => {
    delete process.env.PII_KMS_LOCAL_KEK;
    expect(() => new LocalKms().unwrap(localWrapDek(randomBytes(32), KEK))).toThrow(/PII_KMS_LOCAL_KEK/);
    process.env.PII_KMS_LOCAL_KEK = KEK.toString('base64');
  });
});

describe('KmsKeyProvider (envelope, via LocalKms)', () => {
  const kms = new LocalKms();
  beforeAll(() => { process.env.PII_KMS_LOCAL_KEK = KEK.toString('base64'); });
  afterAll(() => { delete process.env.PII_KMS_LOCAL_KEK; });

  it('unwraps DEKs at create() and serves the active key', async () => {
    const dek1 = randomBytes(32);
    const provider = await KmsKeyProvider.create(kms, [
      { id: '1', wrappedB64: localWrapDek(dek1, KEK) },
    ]);
    expect(provider.activeKey().id).toBe('1');
    expect(provider.activeKey().key.equals(dek1)).toBe(true);
    expect(provider.keyById('1')!.key.equals(dek1)).toBe(true);
    expect(provider.keyById('nope')).toBeNull();
  });

  it('supports rotation across multiple wrapped DEKs', async () => {
    const dek1 = randomBytes(32);
    const dek2 = randomBytes(32);
    const provider = await KmsKeyProvider.create(
      kms,
      [
        { id: '1', wrappedB64: localWrapDek(dek1, KEK) },
        { id: '2', wrappedB64: localWrapDek(dek2, KEK) },
      ],
      '2', // active
    );
    expect(provider.activeKey().id).toBe('2');
    expect(provider.activeKey().key.equals(dek2)).toBe(true);
    expect(provider.keyById('1')!.key.equals(dek1)).toBe(true); // old still available
    expect(provider.allKeys().map((k) => k.id).sort()).toEqual(['1', '2']);
  });

  it('defaults the active id to the highest numeric id', async () => {
    const provider = await KmsKeyProvider.create(kms, [
      { id: '1', wrappedB64: localWrapDek(randomBytes(32), KEK) },
      { id: '3', wrappedB64: localWrapDek(randomBytes(32), KEK) },
    ]);
    expect(provider.activeKey().id).toBe('3');
  });

  it('rejects an unwrapped key that is not 32 bytes', async () => {
    await expect(
      KmsKeyProvider.create(kms, [{ id: '1', wrappedB64: localWrapDek(randomBytes(16), KEK) }]),
    ).rejects.toThrow(/32 bytes/);
  });

  it('requires at least one DEK', async () => {
    await expect(KmsKeyProvider.create(kms, [])).rejects.toThrow(/at least one/);
  });

  it('deksFromEnv discovers PII_WRAPPED_DEK and _N', () => {
    process.env.PII_WRAPPED_DEK = localWrapDek(randomBytes(32), KEK);
    process.env.PII_WRAPPED_DEK_2 = localWrapDek(randomBytes(32), KEK);
    const deks = KmsKeyProvider.deksFromEnv();
    expect(deks.map((d) => d.id).sort()).toEqual(['1', '2']);
    delete process.env.PII_WRAPPED_DEK;
    delete process.env.PII_WRAPPED_DEK_2;
  });
});

describe('end-to-end: envelope DEK drives real PII encryption', () => {
  // Clear the whole PII_* surface after this test so it cannot bleed into other
  // suites (env is process-global across Jest files in the same worker).
  afterEach(() => { for (const k of Object.keys(process.env)) if (k.startsWith('PII_')) delete process.env[k]; });

  it('a KMS-unwrapped DEK round-trips a value through CryptoService', async () => {
    const dek = randomBytes(32);
    process.env.PII_KMS_LOCAL_KEK = KEK.toString('base64');
    process.env.PII_KMS_PROVIDER = 'local';
    process.env.PII_WRAPPED_DEK = localWrapDek(dek, KEK);
    process.env.PII_INDEX_KEY = randomBytes(32).toString('base64');
    delete process.env.PII_ENC_KEY;
    process.env.NODE_ENV = 'test';

    // Import here so env is set before the service reads it.
    const { CryptoService } = await import('./crypto.service');
    const svc = new CryptoService();
    await (svc as any).onModuleInit();

    const ct = svc.encrypt('12345678901');
    expect(ct).toMatch(/^v2\.1\./); // tagged with the unwrapped DEK's id
    expect(svc.decrypt(ct)).toBe('12345678901');
  });
});
