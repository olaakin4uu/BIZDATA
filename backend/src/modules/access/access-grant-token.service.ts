import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { MailService } from '../../common/services/mail.service';
import { AccessAssignmentService } from './access-assignment.service';

/**
 * Four-eyes grant tokens for unlocking raw taxpayer records.
 *
 *  request()  — an ASSIGNED officer (SUPER_ADMIN/ADMIN) asks for access to a
 *               provider/case they're assigned to (reason required).
 *  approve()  — a SUPER_ADMIN approves; a one-time token is minted: the RAW token
 *               is returned to the approver (to relay) and emailed to the
 *               officer; only its SHA-256 hash is stored.
 *
 *               A SUPER_ADMIN MAY approve their own request. That is a deliberate
 *               operational decision by the system owner, not an oversight — do
 *               not "restore" the four-eyes check without asking them. ADMINs
 *               still cannot approve anything, and a self-approval is recorded as
 *               such (see SELF_APPROVAL_ALLOWED below) so the audit trail never
 *               reads as two-person review when one person did it.
 *  redeem()   — the officer submits PASSWORD + token; on success the token starts
 *               a work-session window (reusable until sessionExpiresAt).
 *  verifyActiveSession() — used by the step-up unlock to confirm a live,
 *               redeemed, non-revoked, non-expired grant for the scope.
 *  revoke()   — an admin withdraws it; takes effect immediately.
 */
const REDEEM_WINDOW_MIN = 60;      // officer has 60 min after approval to first-redeem
const SESSION_HOURS = 8;           // once redeemed, reusable for the work session

/**
 * Whether a SUPER_ADMIN may approve their own grant request.
 *
 * Set true on the owner's instruction. The trade it makes is real and worth
 * stating where the switch lives: with four-eyes enforced, unmasking a
 * taxpayer's PII takes two people, so a single compromised or curious
 * SUPER_ADMIN account cannot do it alone. With self-approval allowed, it can.
 *
 * What is NOT given up: every approval is still audited, still SUPER_ADMIN-only,
 * still requires a prior assignment with a written reason, and a self-approval is
 * flagged `selfApproved` in the audit record — so "who reviewed this?" always has
 * a truthful answer, even when the answer is "nobody else".
 *
 * Flip to false to restore two-person approval.
 */
const SELF_APPROVAL_ALLOWED = true;

@Injectable()
export class AccessGrantTokenService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private mail: MailService,
    private assignments: AccessAssignmentService,
  ) {}

  private hash(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  private scopeOf(t: { providerId: string | null; caseId: string | null }) {
    return t.providerId ? { providerId: t.providerId } : { caseId: t.caseId! };
  }

  /** Officer requests access to a provider/case they are assigned to. */
  async request(actor: { id: string; role: string }, dto: { providerId?: string; caseId?: string; reason?: string }) {
    const reason = (dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('A reason is required.');
    if (!dto.providerId === !dto.caseId) throw new BadRequestException('Provide exactly one of providerId or caseId.');

    // Must already be assigned (need-to-know) before requesting a token.
    if (dto.providerId) await this.assignments.assertProviderAccess(actor, dto.providerId);
    else await this.assignments.assertCaseAccess(actor, dto.caseId!);

    // Reuse an existing live request/grant for the same scope if present.
    const existing = await this.prisma.accessGrantToken.findFirst({
      where: {
        staffId: actor.id, providerId: dto.providerId ?? null, caseId: dto.caseId ?? null,
        status: { in: ['PENDING', 'APPROVED', 'REDEEMED'] },
        OR: [{ sessionExpiresAt: null }, { sessionExpiresAt: { gt: new Date() } }],
      },
    });
    if (existing) return { id: existing.id, status: existing.status };

    const created = await this.prisma.accessGrantToken.create({
      data: { staffId: actor.id, providerId: dto.providerId ?? null, caseId: dto.caseId ?? null, reason },
    });
    await this.audit.log({
      actorType: 'STAFF', actorId: actor.id, staffId: actor.id,
      action: 'GRANT_TOKEN_REQUEST', entity: dto.providerId ? 'DataProvider' : 'UnderdeclarationCase',
      entityId: (dto.providerId ?? dto.caseId)!, afterJson: { id: created.id, reason },
    });
    return { id: created.id, status: created.status };
  }

  /** SUPER_ADMIN approves a pending request. May be the requester — see SELF_APPROVAL_ALLOWED. */
  async approve(approver: { id: string; role: string }, id: string) {
    if (approver.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only a Super Admin may approve access grants.');
    const req = await this.prisma.accessGrantToken.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Request not found.');
    const selfApproved = req.staffId === approver.id;
    if (selfApproved && !SELF_APPROVAL_ALLOWED) {
      throw new ForbiddenException('Four-eyes: you cannot approve your own access request.');
    }
    if (req.status !== 'PENDING') throw new BadRequestException(`Request is ${req.status.toLowerCase()}, not pending.`);

    // Mint a human-relayable one-time token (10 hex chars, uppercased).
    const raw = randomBytes(5).toString('hex').toUpperCase();
    const now = new Date();
    const redeemExpiresAt = new Date(now.getTime() + REDEEM_WINDOW_MIN * 60_000);

    await this.prisma.accessGrantToken.update({
      where: { id },
      data: { status: 'APPROVED', tokenHash: this.hash(raw), approvedById: approver.id, approvedAt: now, redeemExpiresAt },
    });

    await this.audit.log({
      actorType: 'STAFF', actorId: approver.id, staffId: approver.id,
      action: 'GRANT_TOKEN_APPROVE', entity: req.providerId ? 'DataProvider' : 'UnderdeclarationCase',
      entityId: (req.providerId ?? req.caseId)!,
      // `selfApproved` is the whole point of recording this: without it the log
      // cannot distinguish a reviewed grant from an unreviewed one.
      afterJson: { id, requester: req.staffId, redeemWindowMin: REDEEM_WINDOW_MIN, selfApproved },
    });

    // Email the officer the token (no-op until SMTP is configured — the raw token
    // returned to the approver is the always-available channel).
    const officer = await this.prisma.user.findUnique({ where: { id: req.staffId }, select: { email: true } });
    if (officer?.email) {
      const subject = 'Your FinData record-access token';
      const body = `A Super Admin approved your request to view raw taxpayer records.\n\nAccess token: ${raw}\n\n` +
        `Enter your password + this token within ${REDEEM_WINDOW_MIN} minutes to unlock. Single work session (up to ${SESSION_HOURS}h). This action is audited.`;
      await this.mail.send(officer.email, subject, `<p>${body.replace(/\n/g, '<br>')}</p>`, body);
    }

    // Raw token shown to the approver to relay in person/phone.
    return { id, token: raw, redeemExpiresAt, requester: req.staffId };
  }

  /**
   * Officer redeems the token with their password. Verifies password + token,
   * marks the grant REDEEMED and opens the work-session window.
   */
  async redeem(actor: { id: string; role: string }, dto: { providerId?: string; caseId?: string; token?: string; password?: string }) {
    const token = (dto.token ?? '').trim().toUpperCase();
    const password = dto.password ?? '';
    if (!token || !password) throw new BadRequestException('Password and access token are required.');
    if (!dto.providerId === !dto.caseId) throw new BadRequestException('Provide exactly one of providerId or caseId.');

    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new ForbiddenException('Password is incorrect.');
    }

    const grant = await this.prisma.accessGrantToken.findFirst({
      where: {
        staffId: actor.id, providerId: dto.providerId ?? null, caseId: dto.caseId ?? null,
        status: { in: ['APPROVED', 'REDEEMED'] }, tokenHash: this.hash(token), revokedAt: null,
      },
    });
    if (!grant) throw new ForbiddenException('No matching approved access token — check the token or request a new one.');

    const now = new Date();
    if (grant.status === 'APPROVED') {
      if (grant.redeemExpiresAt && grant.redeemExpiresAt < now) throw new ForbiddenException('This access token has expired — request a new one.');
      const sessionExpiresAt = new Date(now.getTime() + SESSION_HOURS * 3_600_000);
      await this.prisma.accessGrantToken.update({ where: { id: grant.id }, data: { status: 'REDEEMED', redeemedAt: now, sessionExpiresAt } });
      await this.audit.log({
        actorType: 'STAFF', actorId: actor.id, staffId: actor.id,
        action: 'GRANT_TOKEN_REDEEM', entity: grant.providerId ? 'DataProvider' : 'UnderdeclarationCase',
        entityId: (grant.providerId ?? grant.caseId)!, afterJson: { id: grant.id, sessionExpiresAt },
      });
      return { ok: true, sessionExpiresAt };
    }
    // Already redeemed → still within its session window?
    if (grant.sessionExpiresAt && grant.sessionExpiresAt < now) throw new ForbiddenException('Access session has ended — request a new token.');
    return { ok: true, sessionExpiresAt: grant.sessionExpiresAt };
  }

  /**
   * The step-up unlock calls this to confirm the officer holds a LIVE grant for
   * the scope (redeemed, not revoked, within session). Throws otherwise.
   */
  async assertActiveSession(staffId: string, scope: { providerId?: string; caseId?: string }) {
    const grant = await this.prisma.accessGrantToken.findFirst({
      where: {
        staffId, providerId: scope.providerId ?? null, caseId: scope.caseId ?? null,
        status: 'REDEEMED', revokedAt: null, sessionExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!grant) {
      throw new ForbiddenException('Four-eyes access token required — request access and have a Super Admin approve it.');
    }
  }

  /** Admin revokes a grant/request. Immediate. */
  async revoke(actor: { id: string; role: string }, id: string) {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('Not permitted.');
    const g = await this.prisma.accessGrantToken.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Not found.');
    if (g.revokedAt) return g;
    const updated = await this.prisma.accessGrantToken.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date(), revokedById: actor.id, tokenHash: null } });
    await this.audit.log({
      actorType: 'STAFF', actorId: actor.id, staffId: actor.id,
      action: 'GRANT_TOKEN_REVOKE', entity: g.providerId ? 'DataProvider' : 'UnderdeclarationCase',
      entityId: (g.providerId ?? g.caseId)!, afterJson: { id, requester: g.staffId },
    });
    return updated;
  }

  /** Pending requests awaiting a Super Admin's decision. */
  async pending() {
    return this.prisma.accessGrantToken.findMany({ where: { status: 'PENDING' }, orderBy: { requestedAt: 'asc' } });
  }

  /** The current officer's own grants (to see status). */
  async mine(staffId: string) {
    return this.prisma.accessGrantToken.findMany({
      where: { staffId, status: { in: ['PENDING', 'APPROVED', 'REDEEMED'] } },
      orderBy: { requestedAt: 'desc' },
    });
  }
}
