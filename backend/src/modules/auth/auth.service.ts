import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { generateSecret, verifyTotp, keyuri } from '../../common/services/totp';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  async staffLogin(email: string, password: string, ip?: string, userAgent?: string, totp?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    // Second factor when the account has MFA enabled: a TOTP code, or — if the
    // authenticator is lost — one of the one-time recovery codes.
    if (user.mfaEnabled) {
      if (!totp) throw new UnauthorizedException('MFA code required');
      const code = totp.trim();
      const totpOk = user.mfaSecret ? verifyTotp(code, user.mfaSecret) : false;
      if (!totpOk) {
        const consumed = await this.consumeRecoveryCode(user.id, user.mfaRecoveryCodes, code);
        if (!consumed) throw new UnauthorizedException('Invalid MFA code');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // `pwdIat` binds this token to the current password epoch (epoch-ms of the
    // last password change). Changing the password (self-service or admin reset)
    // bumps passwordChangedAt, and the guard rejects any token whose pwdIat
    // predates it — evicting old sessions, even on a sub-second change.
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      kind: 'STAFF',
      role: user.role,
      pwdIat: user.passwordChangedAt?.getTime() ?? 0,
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId: user.id,
      staffId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ip,
      userAgent,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async providerLogin(email: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { email: email.toLowerCase() },
      include: { provider: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.dataProviderUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      kind: 'PROVIDER_USER',
      role: user.role,
      providerId: user.providerId,
    });

    await this.audit.log({
      actorType: 'PROVIDER_USER',
      actorId: user.id,
      action: 'LOGIN',
      entity: 'DataProviderUser',
      entityId: user.id,
      ip,
      userAgent,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        providerId: user.providerId,
        providerName: user.provider?.name,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async getStaffMe(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    // Never leak secrets over the wire — strip the password hash, the TOTP
    // secret, and the recovery-code hashes; surface only a safe count.
    const { passwordHash: _ph, mfaSecret: _ms, mfaRecoveryCodes, ...rest } = user;
    return { ...rest, recoveryCodesRemaining: mfaRecoveryCodes.length };
  }

  async getProviderMe(id: string) {
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id },
      include: { provider: true },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash: _ph, ...rest } = user;
    return rest;
  }

  /** Validate an uploaded image and return a base64 data URL (<= ~2MB). */
  private toAvatarDataUrl(file: { mimetype?: string; size?: number; buffer?: Buffer }): string {
    if (!file || !file.buffer) throw new BadRequestException('No file uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!file.mimetype || !allowed.includes(file.mimetype)) {
      throw new BadRequestException('Photo must be a JPEG, PNG, WebP or GIF image');
    }
    if ((file.size ?? file.buffer.length) > 2 * 1024 * 1024) {
      throw new BadRequestException('Photo must be 2MB or smaller');
    }
    return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  }

  async updateStaffAvatar(id: string, file: any) {
    const avatarUrl = this.toAvatarDataUrl(file);
    const user = await this.prisma.user.update({ where: { id }, data: { avatarUrl } });
    const { passwordHash: _ph, mfaSecret: _ms, ...rest } = user;
    return rest;
  }

  async updateProviderAvatar(id: string, file: any) {
    const avatarUrl = this.toAvatarDataUrl(file);
    const user = await this.prisma.dataProviderUser.update({
      where: { id },
      data: { avatarUrl },
      include: { provider: true },
    });
    const { passwordHash: _ph, ...rest } = user;
    return rest;
  }

  async changeStaffPassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const hash = await bcrypt.hash(newPassword, 10);
    // Stamp the password epoch and clear any admin-forced-change flag. Existing
    // tokens carry the old pwdIat and are rejected by the guard from here on —
    // including this caller's, so the client must re-login after changing.
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: hash, passwordChangedAt: new Date(), mustChangePassword: false },
    });
    return { success: true };
  }

  /**
   * Step-up re-authentication. To view a provider's raw uploaded records (PII),
   * the officer must re-confirm their own password (+ TOTP if MFA is on). On
   * success we issue a short-lived (10 min) scoped token bound to this staff
   * member, scope and — optionally — a specific provider. The event is audited.
   */
  async stepUp(
    id: string,
    password: string,
    scope: string,
    providerId: string | undefined,
    totp: string | undefined,
    ip?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Password is incorrect');
    if (user.mfaEnabled) {
      if (!totp) throw new UnauthorizedException('MFA code required');
      if (!user.mfaSecret || !verifyTotp(totp, user.mfaSecret)) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    const TTL_SECONDS = 600; // 10 minutes
    const stepUpToken = await this.jwt.signAsync(
      { sub: user.id, kind: 'STEP_UP', scope, providerId: providerId ?? null },
      { expiresIn: TTL_SECONDS },
    );

    await this.audit.log({
      actorType: 'STAFF',
      actorId: user.id,
      staffId: user.id,
      action: 'STEP_UP_GRANT',
      entity: providerId ? 'DataProvider' : 'AccessScope',
      entityId: providerId ?? scope,
      ip,
      userAgent,
      afterJson: { scope, providerId: providerId ?? null, ttlSeconds: TTL_SECONDS },
    });

    return { stepUpToken, scope, providerId: providerId ?? null, expiresInSeconds: TTL_SECONDS };
  }

  /** Verify a step-up token for a given scope/provider. Throws if invalid/expired/mismatched. */
  async verifyStepUp(token: string, scope: string, providerId?: string): Promise<{ staffId: string }> {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Step-up authorisation expired — please re-authenticate.');
    }
    if (payload.kind !== 'STEP_UP' || payload.scope !== scope) {
      throw new UnauthorizedException('Invalid step-up authorisation for this action.');
    }
    if (payload.providerId && providerId && payload.providerId !== providerId) {
      throw new UnauthorizedException('Step-up authorisation is for a different provider.');
    }
    return { staffId: payload.sub };
  }

  async changeProviderPassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.dataProviderUser.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.dataProviderUser.update({ where: { id }, data: { passwordHash: hash } });
    return { success: true };
  }

  // ─── Staff MFA (TOTP) ──────────────────────────────────────────────────────

  /** Begin enrolment: generate a secret (not yet enabled) + an otpauth URI for
   *  the authenticator app. MFA only becomes active after a verified enable. */
  async mfaSetup(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id }, data: { mfaSecret: secret, mfaEnabled: false } });
    // Compact otpauth URI: authenticator apps assume SHA1/6-digit/30s defaults,
    // so omitting them keeps the QR payload small (fits a low QR version that
    // renders crisply and scans reliably).
    const otpauth = `otpauth://totp/${encodeURIComponent('BizData')}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=BizData`;
    return { secret, otpauth };
  }

  /** Confirm enrolment by verifying a code against the pending secret. Returns
   *  a fresh set of one-time recovery codes (shown once, stored only as hashes). */
  async mfaEnable(id: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user?.mfaSecret) throw new BadRequestException('Run MFA setup first');
    if (!verifyTotp(token, user.mfaSecret)) {
      throw new BadRequestException('Invalid MFA code');
    }
    const { plain, hashed } = await this.makeRecoveryCodes();
    await this.prisma.user.update({
      where: { id },
      data: { mfaEnabled: true, mfaRecoveryCodes: hashed },
    });
    await this.audit.log({ actorType: 'STAFF', actorId: id, staffId: id, action: 'MFA_ENABLE', entity: 'User', entityId: id });
    return { mfaEnabled: true, recoveryCodes: plain };
  }

  /** Disable MFA (requires a valid current code). Clears secret + recovery codes. */
  async mfaDisable(id: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user?.mfaEnabled || !user.mfaSecret) throw new BadRequestException('MFA is not enabled');
    const ok = verifyTotp(token.trim(), user.mfaSecret)
      || (await this.consumeRecoveryCode(id, user.mfaRecoveryCodes, token.trim()));
    if (!ok) throw new BadRequestException('Invalid MFA code');
    await this.prisma.user.update({
      where: { id },
      data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [] },
    });
    await this.audit.log({ actorType: 'STAFF', actorId: id, staffId: id, action: 'MFA_DISABLE', entity: 'User', entityId: id });
    return { mfaEnabled: false };
  }

  /** Regenerate recovery codes (invalidates the old set). Requires a valid TOTP. */
  async mfaRegenerateRecovery(id: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user?.mfaEnabled || !user.mfaSecret) throw new BadRequestException('MFA is not enabled');
    if (!verifyTotp(token.trim(), user.mfaSecret)) throw new BadRequestException('Invalid MFA code');
    const { plain, hashed } = await this.makeRecoveryCodes();
    await this.prisma.user.update({ where: { id }, data: { mfaRecoveryCodes: hashed } });
    await this.audit.log({ actorType: 'STAFF', actorId: id, staffId: id, action: 'MFA_REGEN_RECOVERY', entity: 'User', entityId: id });
    return { recoveryCodes: plain };
  }

  /** Ten human-typable one-time codes (e.g. "a1b2-c3d4"); return plaintext + hashes.
   *  Hashes are over the canonical form (lowercase, alphanumerics only) so a user
   *  can type the code with or without the dash. */
  private async makeRecoveryCodes(): Promise<{ plain: string[]; hashed: string[] }> {
    const plain = Array.from({ length: 10 }, () => {
      const raw = randomBytes(4).toString('hex'); // 8 hex chars
      return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    });
    const hashed = await Promise.all(plain.map((c) => bcrypt.hash(canonicalCode(c), 10)));
    return { plain, hashed };
  }

  /** If `code` matches an unused recovery code, consume it (remove its hash) and
   *  return true. Recovery codes are single-use. */
  private async consumeRecoveryCode(userId: string, hashes: string[], code: string): Promise<boolean> {
    const normalized = canonicalCode(code);
    if (normalized.length < 6) return false; // ignore short/empty (e.g. a 6-digit TOTP miss)
    for (const hash of hashes) {
      if (await bcrypt.compare(normalized, hash)) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { mfaRecoveryCodes: hashes.filter((h) => h !== hash) },
        });
        await this.audit.log({ actorType: 'STAFF', actorId: userId, staffId: userId, action: 'MFA_RECOVERY_USED', entity: 'User', entityId: userId });
        return true;
      }
    }
    return false;
  }
}

/** Canonicalise a recovery code: lowercase, alphanumerics only (drops dashes/spaces). */
function canonicalCode(code: string): string {
  return (code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
