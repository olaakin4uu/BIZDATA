import { randomBytes, createHash } from 'crypto';

/**
 * How long an invite / reset link stays usable.
 *
 * Longer than the 1-hour self-service forgot-password window on purpose: this
 * link is handed over by a person — pasted into an email, WhatsApp, or read out
 * — and the recipient is an institution's compliance officer who may not act the
 * same hour. Seven days is short enough to be a meaningful control and long
 * enough that hand-off does not routinely fail.
 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** SHA-256, matching AuthService.hashToken — only the hash is ever stored. */
export function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** A single-use invite token. 32 random bytes = 256 bits; the raw value leaves in the link only. */
export function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * The password the account is parked on until the invite link is used.
 *
 * NOBODY is told this value — not the provider, not the staff member who created
 * the account. It exists only so the row satisfies the non-blank password-hash
 * constraint and so the account cannot be signed into by any route except the
 * link. It is deliberately not returned anywhere.
 */
export function generateUnusablePassword(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * The hand-off note a staff member copies and sends.
 *
 * Carries a LINK, never a password. A password sent by email or chat lives in
 * that mailbox forever, gets forwarded, and survives the account it belonged to;
 * a link expires, works once, and lets the provider choose a secret nobody else
 * has ever seen — so no BizData staff member ever knows a provider's password.
 *
 * Plain text on purpose: it has to survive WhatsApp, SMS and a pasted email body
 * without formatting mangling the URL.
 */
export function buildInviteNote(opts: {
  providerName: string;
  firstName: string;
  email: string;
  inviteUrl: string;
  expiresAt: Date;
  isReset: boolean;
}): string {
  const expires = opts.expiresAt.toISOString().slice(0, 10);
  return [
    `${opts.providerName} — FinData provider portal ${opts.isReset ? 'password reset' : 'access'}`,
    ``,
    `Dear ${opts.firstName},`,
    ``,
    opts.isReset
      ? `A password reset has been requested for your FinData account.`
      : `An account has been created for you to file your institution's returns to the Kano State Internal Revenue Service.`,
    ``,
    `  Username: ${opts.email}`,
    `  ${opts.isReset ? 'Reset your password' : 'Set your password'}: ${opts.inviteUrl}`,
    ``,
    `Open the link and choose your own password. It can be used once and expires on ${expires}.`,
    `If it expires before you use it, ask the Revenue Service to send a new one.`,
    ``,
    `We never send passwords, and no one at the Revenue Service can see yours.`,
    `Please do not forward this link to anyone.`,
  ].join('\n');
}
