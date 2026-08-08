import {
  generateInviteToken,
  hashInviteToken,
  generateUnusablePassword,
  buildInviteNote,
  INVITE_TTL_MS,
} from './credential.util';

/**
 * Provider access is handed over as a one-time LINK, never a password.
 *
 * A password sent by email or WhatsApp outlives the account it belonged to, gets
 * forwarded, and means a staff member knows a provider's secret. A link expires,
 * works once, and lets the provider pick something nobody else has seen.
 */
describe('invite tokens', () => {
  const many = Array.from({ length: 300 }, () => generateInviteToken());

  it('is 256 bits of randomness, hex-encoded', () => {
    expect(many.every((t) => /^[0-9a-f]{64}$/.test(t))).toBe(true);
  });

  it('never repeats', () => {
    expect(new Set(many).size).toBe(many.length);
  });

  it('is stored only as a SHA-256 hash, matching the auth service', () => {
    const raw = 'a'.repeat(64);
    // Same digest AuthService.hashToken produces, so a link minted here is
    // redeemable by the existing /auth/provider/reset-password endpoint.
    expect(hashInviteToken(raw)).toBe(
      require('crypto').createHash('sha256').update(raw).digest('hex'),
    );
    expect(hashInviteToken(raw)).not.toBe(raw);
  });
});

describe('the parked password', () => {
  it('is long, random, and never the same twice', () => {
    const pws = Array.from({ length: 200 }, () => generateUnusablePassword());
    expect(new Set(pws).size).toBe(pws.length);
    expect(pws.every((p) => p.length >= 24)).toBe(true);
  });

  it('satisfies the minimum length the service enforces', () => {
    expect(generateUnusablePassword().length).toBeGreaterThanOrEqual(8);
  });
});

describe('buildInviteNote', () => {
  const expiresAt = new Date('2026-08-15T00:00:00Z');
  const note = buildInviteNote({
    providerName: 'ACCESS BANK LTD',
    firstName: 'Amina',
    email: 'compliance@accessbank.ng',
    inviteUrl: 'https://findata.kirs.gov.ng/provider/reset-password?token=abc123',
    expiresAt,
    isReset: false,
  });

  it('carries the username and the link', () => {
    expect(note).toContain('compliance@accessbank.ng');
    expect(note).toContain('https://findata.kirs.gov.ng/provider/reset-password?token=abc123');
  });

  it('contains NO password value — that is the whole point', () => {
    // The word "password" appears as a LABEL for the link ("Set your password:
    // https://…"), which is fine. What must never appear is a bare credential
    // field carrying a secret. So: every "password:" must be followed by a URL.
    const labels = note.split('\n').filter((l) => /password:/i.test(l));
    expect(labels.length).toBeGreaterThan(0);
    for (const line of labels) {
      expect(line).toMatch(/password:\s*https?:\/\//i);
    }
    // And no field-style "Password: <secret>" line, as the old flow produced.
    expect(note).not.toMatch(/^\s*Password:\s*(?!https?:\/\/)\S/im);
    expect(note).toMatch(/never send passwords/i);
  });

  it('states when the link expires, so a stale one is explicable', () => {
    expect(note).toContain('2026-08-15');
    expect(note).toMatch(/used once/i);
  });

  it('reads as a reset when it is one', () => {
    const reset = buildInviteNote({
      providerName: 'ACCESS BANK LTD', firstName: 'Amina',
      email: 'compliance@accessbank.ng', inviteUrl: 'https://x/y?token=t',
      expiresAt, isReset: true,
    });
    expect(reset).toMatch(/password reset/i);
    expect(reset).toMatch(/Reset your password/);
  });

  it('is plain text that survives paste into chat or email', () => {
    expect(note).not.toMatch(/<[a-z]/i);
    expect(note.split('\n').length).toBeGreaterThan(5);
  });
});

describe('INVITE_TTL_MS', () => {
  it('is a week — long enough for human hand-off, short enough to matter', () => {
    // Deliberately longer than the 1-hour self-service reset: this link is
    // pasted into an email or read out by a person, and the recipient may not
    // act the same hour.
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
