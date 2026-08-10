import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { MailService } from '../../common/services/mail.service';
import { primaryFrontendUrl } from '../../common/env.util';
import {
  generateInviteToken, hashInviteToken, generateUnusablePassword,
  buildInviteNote, INVITE_TTL_MS,
} from './credential.util';

const escapeHtml = (t: string) =>
  t.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

@Injectable()
export class ProviderUsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private mail: MailService,
  ) {}

  /**
   * Create a portal login for a provider.
   *
   * The password is GENERATED here, not chosen by the staff member creating the
   * account. A human-chosen password for someone else is predictable across a
   * cohort ("Provider@2026" for all 48), and it tempts the creator to reuse one
   * they know. The generated value is returned exactly ONCE, in this response —
   * only the bcrypt hash is stored, so it can never be read back afterwards. If
   * it is lost before hand-off, reset the account rather than hunting for it.
   *
   * `dto.password` is still honoured when supplied, for restoring a specific
   * account during a migration; otherwise omit it.
   */
  async create(providerId: string, dto: any, actorId?: string) {
    if (!dto.email || !dto.firstName || !dto.lastName) {
      throw new BadRequestException('email, firstName, lastName required');
    }
    // No password is chosen for the provider — not by us, not by the staff
    // member. The account is parked on an unusable random secret and can only be
    // opened via the one-time invite link issued below.
    const password: string = dto.password || generateUnusablePassword();
    if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters');

    const provider = await this.prisma.dataProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    const existing = await this.prisma.dataProviderUser.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.dataProviderUser.create({
      data: {
        providerId,
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role || 'COMPLIANCE_OFFICER',
        isActive: dto.isActive !== false,
        // New provider accounts are created with an admin-set password, so force
        // the provider to set their own on first login (mirrors the tightening
        // applied to imported provider logins). Cannot be disabled.
        mustChangePassword: true,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'CREATE_PROVIDER_USER',
      entity: 'DataProviderUser',
      entityId: user.id,
      afterJson: { email: user.email, providerId },
    });

    const credentials = await this.handOff({
      userId: user.id,
      providerName: provider.name,
      firstName: user.firstName,
      email: user.email,
      isReset: false,
    });

    const { passwordHash: _, ...rest } = user;
    return { ...rest, credentials };
  }

  async listByProvider(providerId: string) {
    const users = await this.prisma.dataProviderUser.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return users;
  }

  async findOne(id: string) {
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id },
      include: { provider: { select: { id: true, name: true, providerType: true } } },
    });
    if (!user) throw new NotFoundException('Provider user not found');
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: any, actorId?: string) {
    const before = await this.prisma.dataProviderUser.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Provider user not found');
    const user = await this.prisma.dataProviderUser.update({
      where: { id },
      data: {
        firstName: dto.firstName ?? undefined,
        lastName: dto.lastName ?? undefined,
        phone: dto.phone ?? undefined,
        role: dto.role ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPDATE_PROVIDER_USER',
      entity: 'DataProviderUser',
      entityId: id,
    });
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  /**
   * Reset a provider login, handing back the same credential note as creation.
   *
   * Same reasoning as create(): the replacement password is GENERATED unless one
   * is explicitly supplied, returned exactly once, and forces a change on next
   * sign-in. A reset is precisely when a provider has lost access and someone
   * must send them something — so it needs the copyable hand-off just as much as
   * a new account does, and for the same reason it must never be readable again
   * afterwards.
   *
   * Resetting also evicts the account's live sessions: passwordChangedAt moves
   * forward and the provider guard rejects any token issued before it.
   */
  async resetPassword(id: string, newPassword: string | undefined, actorId?: string) {
    // Same as creation: no password is handed to anyone. The old one is
    // invalidated immediately by parking the row on an unusable secret, and the
    // provider regains access only through the one-time link.
    const password = newPassword || generateUnusablePassword();
    if (password.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id },
      include: { provider: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException('Provider user not found');

    const passwordHash = await bcrypt.hash(password, 10);
    // An admin-set password is temporary — force the provider to set their own
    // on next login (consistent with new-user creation + imported-login policy).
    await this.prisma.dataProviderUser.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
    });
    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'RESET_PROVIDER_USER_PASSWORD',
      entity: 'DataProviderUser',
      entityId: id,
    });

    const credentials = await this.handOff({
      userId: id,
      providerName: user.provider?.name ?? 'Your institution',
      firstName: user.firstName,
      email: user.email,
      isReset: true,
    });
    return { success: true, credentials };
  }

  /**
   * Deliver a credential set: email it when SMTP is configured, and ALWAYS
   * return it so the caller can hand it over manually. Shared by create() and
   * resetPassword() so the two can never drift into saying different things.
   *
   * A mail failure is swallowed deliberately — the account change has already
   * been committed, and losing the password because the relay was down would be
   * worse than an undelivered email the staff member can send themselves.
   */
  private async handOff(opts: {
    userId: string;
    providerName: string;
    firstName: string;
    email: string;
    isReset: boolean;
  }) {
    // Mint a single-use invite token. Only its SHA-256 is stored, exactly as the
    // self-service forgot-password flow does — the raw value exists solely
    // inside the link we hand over, so a database reader cannot use it.
    const raw = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.passwordResetToken.create({
      data: { tokenHash: hashInviteToken(raw), userType: 'PROVIDER', userId: opts.userId, expiresAt },
    });

    const base = primaryFrontendUrl() || 'http://localhost:3000';
    const inviteUrl = `${base}/provider/reset-password?token=${raw}`;
    const portalUrl = `${base}/provider/login`;
    const note = buildInviteNote({
      providerName: opts.providerName,
      firstName: opts.firstName,
      email: opts.email,
      inviteUrl,
      expiresAt,
      isReset: opts.isReset,
    });

    let emailed = false;
    if (this.mail.isConfigured()) {
      try {
        await this.mail.send(
          opts.email,
          `${opts.providerName} — FinData provider portal ${opts.isReset ? 'password reset' : 'access'}`,
          `<pre style="font:14px/1.5 ui-monospace,monospace">${escapeHtml(note)}</pre>`,
          note,
        );
        emailed = true;
      } catch {
        // A mail failure must not lose the invite: the link is still returned
        // for the staff member to send by hand.
        emailed = false;
      }
    }

    return {
      portalUrl,
      username: opts.email,
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
      mustChangePassword: true,
      emailed,
      note,
    };
  }
}
