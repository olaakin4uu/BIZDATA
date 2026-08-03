import { assertEnvironmentLoaded, EnvKeyProvider } from './key-provider';

/**
 * The dev PII-key fallback must never engage when no environment was loaded.
 *
 * This fired twice for real: a maintenance script run under ts-node does not
 * read .env, so CryptoService derived its keys from the literal
 * 'bizdata-dev-secret' — a value committed to this repository. 16,107 PII values
 * were encrypted under it before verification caught it, and the running app
 * could not decrypt any of them. A warning was logged both times and read past
 * both times, so the fallback now refuses instead of warning.
 */
describe('assertEnvironmentLoaded', () => {
  const saved = process.env.JWT_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = saved;
  });

  it('throws when JWT_SECRET is absent — the signature of an unloaded .env', () => {
    delete process.env.JWT_SECRET;
    expect(() => assertEnvironmentLoaded('PII_ENC_KEY')).toThrow(/environment was never loaded/i);
  });

  it('names the fix in the message, so the author does not have to guess', () => {
    delete process.env.JWT_SECRET;
    expect(() => assertEnvironmentLoaded('PII_ENC_KEY')).toThrow(/dotenv\/config/);
  });

  it('reports which key was missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => assertEnvironmentLoaded('PII_INDEX_KEY')).toThrow(/PII_INDEX_KEY/);
  });

  it('permits the dev fallback when a real environment IS loaded', () => {
    process.env.JWT_SECRET = 'a-real-secret-from-dotenv';
    expect(() => assertEnvironmentLoaded('PII_ENC_KEY')).not.toThrow();
  });
});

describe('EnvKeyProvider — dev fallback', () => {
  const savedSecret = process.env.JWT_SECRET;
  const savedKey = process.env.PII_ENC_KEY;
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = savedSecret;
    if (savedKey === undefined) delete process.env.PII_ENC_KEY; else process.env.PII_ENC_KEY = savedKey;
  });

  it('refuses to construct with no key and no environment', () => {
    delete process.env.PII_ENC_KEY;
    delete process.env.JWT_SECRET;
    expect(() => new EnvKeyProvider(false, new Date())).toThrow(/environment was never loaded/i);
  });

  it('still derives a dev key when JWT_SECRET is present', () => {
    delete process.env.PII_ENC_KEY;
    process.env.JWT_SECRET = 'dev-secret-present';
    const p = new EnvKeyProvider(false, new Date());
    expect(p.activeKey().id).toBe('dev');
    expect(p.activeKey().key).toHaveLength(32);
  });

  it('production refuses the fallback regardless of JWT_SECRET', () => {
    delete process.env.PII_ENC_KEY;
    process.env.JWT_SECRET = 'present-but-irrelevant';
    expect(() => new EnvKeyProvider(true, new Date())).toThrow(/required in production/i);
  });
});
