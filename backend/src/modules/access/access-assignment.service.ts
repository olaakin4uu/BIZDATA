import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

/**
 * Need-to-know access assignments for viewing/downloading raw taxpayer records.
 *
 *  - Only SUPER_ADMIN / ADMIN may hold an assignment (enforced here + by @Roles).
 *  - An assignment grants access to ONE provider OR ONE case. Even SUPER_ADMIN is
 *    constrained: they must self-assign, with a reason — every grant is audited.
 *  - Assignments are checked on EVERY record fetch, so a revoke cuts access
 *    immediately (mid-session), independent of the step-up token's lifetime.
 */
const RAW_ACCESS_ROLES = ['SUPER_ADMIN', 'ADMIN'];

@Injectable()
export class AccessAssignmentService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private assertRole(role: string) {
    if (!RAW_ACCESS_ROLES.includes(role)) {
      throw new ForbiddenException('Only Super Admin or Admin roles may access raw taxpayer records.');
    }
  }

  /** True if the staff member has an ACTIVE assignment for this provider. */
  async hasProviderAccess(staffId: string, providerId: string): Promise<boolean> {
    const a = await this.prisma.accessAssignment.findFirst({
      where: { staffId, providerId, revokedAt: null },
      select: { id: true },
    });
    return !!a;
  }

  /** True if the staff member has an ACTIVE assignment for this case. */
  async hasCaseAccess(staffId: string, caseId: string): Promise<boolean> {
    const a = await this.prisma.accessAssignment.findFirst({
      where: { staffId, caseId, revokedAt: null },
      select: { id: true },
    });
    return !!a;
  }

  /**
   * Enforce need-to-know for a provider. Throws 403 with a clear message if the
   * officer isn't assigned. Called on every provider-upload record fetch/export.
   */
  async assertProviderAccess(staff: { id: string; role: string }, providerId: string) {
    this.assertRole(staff.role);
    if (!(await this.hasProviderAccess(staff.id, providerId))) {
      throw new ForbiddenException(
        'You are not assigned to this provider. Request (or self-assign, if permitted) access before viewing its records.',
      );
    }
  }

  /** Enforce need-to-know for a case. */
  async assertCaseAccess(staff: { id: string; role: string }, caseId: string) {
    this.assertRole(staff.role);
    if (!(await this.hasCaseAccess(staff.id, caseId))) {
      throw new ForbiddenException(
        'You are not assigned to this case. Request (or self-assign, if permitted) access before viewing its records.',
      );
    }
  }

  /** Grant an assignment to a staff member (admin action, or self-assign). */
  async grant(
    actor: { id: string; role: string; email?: string },
    dto: { staffId: string; providerId?: string; caseId?: string; reason?: string },
  ) {
    this.assertRole(actor.role);
    const { providerId, caseId } = dto;
    if (!providerId === !caseId) {
      throw new BadRequestException('Provide exactly one of providerId or caseId.');
    }
    const reason = (dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('A reason is required for every access grant.');

    // Target must be a real SUPER_ADMIN/ADMIN staff member.
    const target = await this.prisma.user.findUnique({ where: { id: dto.staffId }, select: { id: true, role: true, isActive: true, email: true } });
    if (!target || !target.isActive) throw new NotFoundException('Target staff member not found.');
    if (!RAW_ACCESS_ROLES.includes(target.role)) {
      throw new BadRequestException('Raw-record access can only be assigned to Super Admin or Admin roles.');
    }
    if (providerId) {
      const p = await this.prisma.dataProvider.findUnique({ where: { id: providerId }, select: { id: true } });
      if (!p) throw new NotFoundException('Provider not found.');
    }
    if (caseId) {
      const c = await this.prisma.underdeclarationCase.findUnique({ where: { id: caseId }, select: { id: true } });
      if (!c) throw new NotFoundException('Case not found.');
    }

    const selfAssigned = dto.staffId === actor.id;

    // De-dupe: if an active assignment already exists, return it.
    const existing = await this.prisma.accessAssignment.findFirst({
      where: { staffId: dto.staffId, providerId: providerId ?? null, caseId: caseId ?? null, revokedAt: null },
    });
    if (existing) return existing;

    const created = await this.prisma.accessAssignment.create({
      data: {
        staffId: dto.staffId,
        providerId: providerId ?? null,
        caseId: caseId ?? null,
        reason,
        grantedById: actor.id,
        selfAssigned,
      },
    });

    await this.audit.log({
      actorType: 'STAFF', actorId: actor.id, staffId: actor.id,
      action: selfAssigned ? 'ACCESS_SELF_ASSIGN' : 'ACCESS_ASSIGN_GRANT',
      entity: providerId ? 'DataProvider' : 'UnderdeclarationCase',
      entityId: (providerId ?? caseId)!,
      afterJson: { assignmentId: created.id, staffId: dto.staffId, providerId: providerId ?? null, caseId: caseId ?? null, reason, selfAssigned },
    });
    return created;
  }

  /** Revoke (deactivate) an assignment. Immediate — record fetches re-check. */
  async revoke(actor: { id: string; role: string }, assignmentId: string) {
    this.assertRole(actor.role);
    const a = await this.prisma.accessAssignment.findUnique({ where: { id: assignmentId } });
    if (!a) throw new NotFoundException('Assignment not found.');
    if (a.revokedAt) return a; // already revoked
    const updated = await this.prisma.accessAssignment.update({
      where: { id: assignmentId },
      data: { revokedAt: new Date(), revokedById: actor.id },
    });
    await this.audit.log({
      actorType: 'STAFF', actorId: actor.id, staffId: actor.id,
      action: 'ACCESS_ASSIGN_REVOKE',
      entity: a.providerId ? 'DataProvider' : 'UnderdeclarationCase',
      entityId: (a.providerId ?? a.caseId)!,
      afterJson: { assignmentId, revokedStaffId: a.staffId },
    });
    return updated;
  }

  /** List assignments (active by default). Admin view — optionally filter. */
  async list(filter: { staffId?: string; providerId?: string; caseId?: string; includeRevoked?: boolean } = {}) {
    return this.prisma.accessAssignment.findMany({
      where: {
        ...(filter.staffId ? { staffId: filter.staffId } : {}),
        ...(filter.providerId ? { providerId: filter.providerId } : {}),
        ...(filter.caseId ? { caseId: filter.caseId } : {}),
        ...(filter.includeRevoked ? {} : { revokedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The active assignments for the current officer (what they can access). */
  async mine(staffId: string) {
    return this.prisma.accessAssignment.findMany({
      where: { staffId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
}
