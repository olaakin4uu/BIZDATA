import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Notifications / alerts. (Stub — implemented by the feature-fleet workflow.)
 * generate(year) should scan for: high-value OPEN cases, providers with missing
 * §29 periods, and cases whose §41 objection/authority deadlines are near, and
 * create Notification rows. list()/markRead() back the officer alert feed.
 */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * A user sees notifications addressed to everyone (targetRole null AND
   * targetUserId null), those scoped to their role (targetRole = their role),
   * and those addressed specifically to them (targetUserId = them).
   */
  async list(staffId?: string, role?: string) {
    return this.prisma.notification.findMany({
      where: {
        OR: [
          // Broadcast to all staff.
          { targetRole: null, targetUserId: null },
          // Scoped to the caller's role.
          ...(role ? [{ targetRole: role, targetUserId: null }] : []),
          // Addressed to the caller directly.
          ...(staffId ? [{ targetUserId: staffId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async generate(year: number): Promise<{ created: number }> {
    let created = 0;

    created += await this.generateHighValueFlags(year);
    created += await this.generateObjectionDeadlines(year);
    created += await this.generateMissedSubmissions(year);

    return { created };
  }

  private async createIfAbsent(data: {
    type: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    message: string;
    entity: string;
    entityId: string;
    targetRole?: string | null;
  }): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: { type: data.type, entityId: data.entityId, read: false },
    });
    if (existing) return false;
    await this.prisma.notification.create({
      data: {
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        entity: data.entity,
        entityId: data.entityId,
        targetRole: data.targetRole ?? null,
        read: false,
      },
    });
    return true;
  }

  /** (1) HIGH_VALUE_FLAG — OPEN cases with estimatedTaxDue >= 10m. */
  private async generateHighValueFlags(year: number): Promise<number> {
    const cases = await this.prisma.underdeclarationCase.findMany({
      where: { year, status: 'OPEN' },
    });

    let created = 0;
    for (const c of cases) {
      const taxDue = Number(c.estimatedTaxDue ?? 0);
      if (taxDue < 10_000_000) continue;

      const severity: 'CRITICAL' | 'WARNING' = taxDue >= 50_000_000 ? 'CRITICAL' : 'WARNING';
      const ref = c.demandNoticeRef ?? c.id;
      const amount = this.formatNaira(taxDue);
      const ok = await this.createIfAbsent({
        type: 'HIGH_VALUE_FLAG',
        severity,
        title: `High-value underdeclaration case ${ref}`,
        message: `Open case ${ref} (taxpayer ${c.taxpayerId}, ${year}) has an estimated tax due of ${amount}.`,
        entity: 'UnderdeclarationCase',
        entityId: c.id,
        targetRole: null, // operational alerts: visible to all staff
      });
      if (ok) created += 1;
    }
    return created;
  }

  /** (2) OBJECTION_DEADLINE — NOTICE_ISSUED/OBJECTION cases with a deadline within 7 days. */
  private async generateObjectionDeadlines(year: number): Promise<number> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const cases = await this.prisma.underdeclarationCase.findMany({
      where: { year, status: { in: ['NOTICE_ISSUED', 'OBJECTION'] } },
    });

    let created = 0;
    for (const c of cases) {
      const deadlines: { label: string; at: Date }[] = [];
      if (c.objectionDueAt) deadlines.push({ label: 'objection', at: new Date(c.objectionDueAt) });
      if (c.authorityResponseDueAt)
        deadlines.push({ label: 'authority response', at: new Date(c.authorityResponseDueAt) });

      const due = deadlines.find((d) => d.at >= now && d.at <= horizon);
      if (!due) continue;

      const ref = c.demandNoticeRef ?? c.id;
      const ok = await this.createIfAbsent({
        type: 'OBJECTION_DEADLINE',
        severity: 'WARNING',
        title: `Upcoming ${due.label} deadline for case ${ref}`,
        message: `Case ${ref} (taxpayer ${c.taxpayerId}) has a ${due.label} deadline on ${due.at
          .toISOString()
          .slice(0, 10)}, within the next 7 days.`,
        entity: 'UnderdeclarationCase',
        entityId: c.id,
        targetRole: null, // operational alerts: visible to all staff
      });
      if (ok) created += 1;
    }
    return created;
  }

  /** (3) MISSED_SUBMISSION — ACTIVE providers with zero submissions for the year. */
  private async generateMissedSubmissions(year: number): Promise<number> {
    const providers = await this.prisma.dataProvider.findMany({
      where: { status: 'ACTIVE' },
    });

    let created = 0;
    for (const p of providers) {
      const count = await this.prisma.dataSubmission.count({
        where: { providerId: p.id, periodYear: year },
      });
      if (count > 0) continue;

      const ok = await this.createIfAbsent({
        type: 'MISSED_SUBMISSION',
        severity: 'WARNING',
        title: `Missing ${year} submission from ${p.name}`,
        message: `Active provider ${p.name} has not submitted any data for ${year}.`,
        entity: 'DataProvider',
        entityId: p.id,
        targetRole: null, // operational alerts: visible to all staff
      });
      if (ok) created += 1;
    }
    return created;
  }

  private formatNaira(amount: number): string {
    return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
  }
}
