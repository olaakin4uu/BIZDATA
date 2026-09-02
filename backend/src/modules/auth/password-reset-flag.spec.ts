/**
 * Who is forced to change their password, and who is not.
 *
 * `mustChangePassword` exists for ONE situation: somebody other than the account
 * holder generated the secret, so it must be replaced before the account is
 * used. Account creation and an admin-initiated reset both do that — they park
 * the row on a secret the provider never chose.
 *
 * Completing a reset LINK is the opposite situation. The holder proved control
 * of the account with a single-use, expiring, hashed token and typed the
 * password themselves; nobody else ever saw it. Setting the flag there made an
 * invited user set a password, sign in, and be held on the profile screen being
 * asked to set one again, with the rest of the portal locked behind it.
 *
 * These tests pin the distinction so it cannot quietly regress.
 */
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Minimal Prisma double: enough of the surface resetPassword touches. */
function makePrisma(tokenRecord: any) {
  const updates: Record<string, any[]> = { user: [], dataProviderUser: [] };
  const tx = {
    user: { update: jest.fn(async (a: any) => { updates.user.push(a.data); return {}; }) },
    dataProviderUser: { update: jest.fn(async (a: any) => { updates.dataProviderUser.push(a.data); return {}; }) },
    passwordResetToken: { update: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({})) },
  };
  return {
    updates,
    prisma: {
      passwordResetToken: { findUnique: jest.fn(async () => tokenRecord) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    } as any,
  };
}

function makeService(prisma: any) {
  return new AuthService(prisma, { sign: jest.fn() } as any, { log: jest.fn() } as any, {} as any);
}

/** A token row that is valid right now for the given user type. */
function validToken(userType: 'STAFF' | 'PROVIDER') {
  return {
    id: 'tok-1',
    userId: 'user-1',
    userType,
    usedAt: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

describe('completing a reset link does NOT force another password change', () => {
  it.each([
    ['PROVIDER', 'dataProviderUser'],
    ['STAFF', 'user'],
  ] as const)('clears mustChangePassword for a %s who set their own password', async (userType, table) => {
    const { prisma, updates } = makePrisma(validToken(userType));
    await makeService(prisma).resetPassword(userType, 'raw-token', 'a-good-passphrase');

    expect(updates[table]).toHaveLength(1);
    // The whole point: false, not true. A user who just chose this password
    // must land on the dashboard, not on a screen demanding they choose again.
    expect(updates[table][0].mustChangePassword).toBe(false);
    // Still evicts live sessions and stores a new hash.
    expect(updates[table][0].passwordChangedAt).toBeInstanceOf(Date);
    expect(typeof updates[table][0].passwordHash).toBe('string');
  });

  it('burns the token so the link cannot be reused', async () => {
    const { prisma } = makePrisma(validToken('PROVIDER'));
    await makeService(prisma).resetPassword('PROVIDER', 'raw-token', 'a-good-passphrase');
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('a reset link that should not work', () => {
  const cases: Array<[string, any]> = [
    ['an unknown token', null],
    ['a token already used', { ...validToken('PROVIDER'), usedAt: new Date() }],
    ['an expired token', { ...validToken('PROVIDER'), expiresAt: new Date(Date.now() - 1000) }],
    ['a staff token presented on the provider endpoint', validToken('STAFF')],
  ];

  it.each(cases)('rejects %s', async (_label, record) => {
    const { prisma, updates } = makePrisma(record);
    await expect(
      makeService(prisma).resetPassword('PROVIDER', 'raw-token', 'a-good-passphrase'),
    ).rejects.toThrow(BadRequestException);
    // Nothing may be written on a refused reset.
    expect(updates.dataProviderUser).toHaveLength(0);
  });

  it('rejects a password under the 8-character floor before touching the token', async () => {
    const { prisma } = makePrisma(validToken('PROVIDER'));
    await expect(
      makeService(prisma).resetPassword('PROVIDER', 'raw-token', 'short'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an empty token', async () => {
    const { prisma } = makePrisma(validToken('PROVIDER'));
    await expect(
      makeService(prisma).resetPassword('PROVIDER', '', 'a-good-passphrase'),
    ).rejects.toThrow(BadRequestException);
  });
});
