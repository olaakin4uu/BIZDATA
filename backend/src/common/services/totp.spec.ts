import { generateSecret, totp, verifyTotp, keyuri } from './totp';

describe('TOTP (RFC-6238)', () => {
  it('generates a Base32 secret', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(30);
  });

  it('produces a 6-digit code', () => {
    const code = totp(generateSecret());
    expect(code).toMatch(/^\d{6}$/);
  });

  it('is deterministic for a fixed secret + time', () => {
    const secret = 'JBSWY3DPEHPK3PXP'; // a well-known test vector secret
    const at = 1_000_000_000_000; // fixed epoch ms
    expect(totp(secret, at)).toBe(totp(secret, at));
  });

  it('changes across 30-second steps', () => {
    const secret = generateSecret();
    const t0 = 1_700_000_000_000;
    const sameStep = totp(secret, t0) === totp(secret, t0 + 5_000);
    const nextStep = totp(secret, t0) === totp(secret, t0 + 60_000);
    expect(sameStep).toBe(true); // within the same 30s window
    expect(nextStep).toBe(false); // two windows later
  });

  it('verifies a freshly generated current code', () => {
    const secret = generateSecret();
    expect(verifyTotp(totp(secret), secret)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateSecret();
    expect(verifyTotp('000000', secret)).toBe(false);
    expect(verifyTotp('', secret)).toBe(false);
    expect(verifyTotp(totp(secret), '')).toBe(false);
  });

  it('tolerates clock drift within the window', () => {
    // A code from the previous 30s step should still verify (window = 1).
    const secret = generateSecret();
    const prev = totp(secret, Date.now() - 30_000);
    expect(verifyTotp(prev, secret, 1)).toBe(true);
  });

  it('keyuri emits a scannable otpauth URI', () => {
    const uri = keyuri('user@example.com', 'BizData', 'JBSWY3DPEHPK3PXP');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=BizData');
  });
});
