import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

// JIT elevation window (§5.3: "valid for 30 minutes only").
const ELEVATION_MINUTES = 30;
const APPROVER_ROLES = new Set(['SUPERVISOR', 'ADMIN', 'SUPER_ADMIN']);

@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** An officer requests temporary PII access, stating a business justification. */
  async request(staffId: string, reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A business justification (min 5 chars) is required');
    }
    // Reuse an existing pending request rather than stacking duplicates.
    const existing = await this.prisma.accessElevation.findFirst({
      where: { staffId, scope: 'PII', status: 'PENDING' },
    });
    if (existing) return existing;

    const grant = await this.prisma.accessElevation.create({
      data: { staffId, scope: 'PII', reason: reason.trim(), status: 'PENDING' },
    });
    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'ELEVATION_REQUEST', entity: 'AccessElevation', entityId: grant.id,
      afterJson: { reason: grant.reason },
    });
    return grant;
  }

  /** Supervisor approves → grant becomes ACTIVE for the next 30 minutes. */
  async approve(id: string, approver: { id: string; role: string }) {
    if (!APPROVER_ROLES.has(approver.role)) throw new ForbiddenException('Not permitted to approve elevations');
    const grant = await this.prisma.accessElevation.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException('Elevation not found');
    if (grant.status !== 'PENDING') throw new BadRequestException(`Elevation is already ${grant.status}`);
    if (grant.staffId === approver.id) throw new ForbiddenException('Cannot approve your own elevation request');

    const expiresAt = new Date(Date.now() + ELEVATION_MINUTES * 60_000);
    const updated = await this.prisma.accessElevation.update({
      where: { id },
      data: { status: 'ACTIVE', decidedById: approver.id, decidedAt: new Date(), expiresAt },
    });
    await this.audit.log({
      actorType: 'STAFF', actorId: approver.id, staffId: approver.id,
      action: 'ELEVATION_APPROVE', entity: 'AccessElevation', entityId: id,
      beforeJson: { staffId: grant.staffId }, afterJson: { expiresAt },
    });
    return updated;
  }

  async deny(id: string, approver: { id: string; role: string }) {
    if (!APPROVER_ROLES.has(approver.role)) throw new ForbiddenException('Not permitted to decide elevations');
    const grant = await this.prisma.accessElevation.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException('Elevation not found');
    if (grant.status !== 'PENDING') throw new BadRequestException(`Elevation is already ${grant.status}`);
    const updated = await this.prisma.accessElevation.update({
      where: { id },
      data: { status: 'DENIED', decidedById: approver.id, decidedAt: new Date() },
    });
    await this.audit.log({
      actorType: 'STAFF', actorId: approver.id, staffId: approver.id,
      action: 'ELEVATION_DENY', entity: 'AccessElevation', entityId: id,
    });
    return updated;
  }

  /** Officer revokes / ends their own active grant early. */
  async revoke(id: string, staffId: string) {
    const grant = await this.prisma.accessElevation.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException('Elevation not found');
    const updated = await this.prisma.accessElevation.update({ where: { id }, data: { status: 'EXPIRED' } });
    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'ELEVATION_REVOKE', entity: 'AccessElevation', entityId: id,
    });
    return updated;
  }

  /** Pending queue for supervisors. */
  pending() {
    return this.prisma.accessElevation.findMany({
      where: { status: 'PENDING' },
      include: { staff: { select: { id: true, firstName: true, lastName: true, role: true } } },
      orderBy: { requestedAt: 'asc' },
    });
  }

  /** The caller's current elevation status (and whether it's live). */
  async mine(staffId: string) {
    const grant = await this.prisma.accessElevation.findFirst({
      where: { staffId, scope: 'PII', status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: { requestedAt: 'desc' },
    });
    const active = !!grant && grant.status === 'ACTIVE' && !!grant.expiresAt && grant.expiresAt > new Date();
    return { grant, active };
  }
}
