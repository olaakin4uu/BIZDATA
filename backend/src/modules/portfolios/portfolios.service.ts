import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

export type PortfolioScope = 'PROVIDER' | 'PROVIDER_TYPE' | 'SECTOR';

/**
 * Analyst portfolios. A staff member owns a book of work — specific providers,
 * provider types, or sectors. New cases auto-route to the owner of the MOST
 * SPECIFIC match: individual provider beats provider type beats sector.
 */
@Injectable()
export class PortfoliosService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(staffId?: string) {
    const rows = await this.prisma.analystPortfolio.findMany({
      where: staffId ? { staffId } : {},
      include: { staff: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // Resolve human labels for provider ids.
    const providerIds = rows.filter((r) => r.scope === 'PROVIDER').map((r) => r.targetValue);
    const providers = providerIds.length
      ? await this.prisma.dataProvider.findMany({ where: { id: { in: providerIds } }, select: { id: true, name: true } })
      : [];
    const provName = new Map(providers.map((p) => [p.id, p.name]));
    return rows.map((r) => ({
      ...r,
      label: r.scope === 'PROVIDER' ? (provName.get(r.targetValue) ?? r.targetValue) : r.targetValue,
    }));
  }

  async create(staffId: string, scope: PortfolioScope, targetValue: string, actorId?: string) {
    if (!['PROVIDER', 'PROVIDER_TYPE', 'SECTOR'].includes(scope)) throw new BadRequestException('Invalid scope');
    if (!targetValue) throw new BadRequestException('targetValue required');

    const staff = await this.prisma.user.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('Staff member not found');

    // Validate the target exists / is sane.
    if (scope === 'PROVIDER') {
      const p = await this.prisma.dataProvider.findUnique({ where: { id: targetValue } });
      if (!p) throw new BadRequestException('Provider not found');
    }

    const existing = await this.prisma.analystPortfolio.findUnique({
      where: { scope_targetValue: { scope, targetValue } },
    });
    if (existing) throw new BadRequestException('That provider/type/sector already has an owner. Reassign or remove it first.');

    const created = await this.prisma.analystPortfolio.create({
      data: { staffId, scope, targetValue },
    });

    await this.audit.log({
      actorType: 'STAFF', actorId, staffId: actorId,
      action: 'ASSIGN_PORTFOLIO', entity: 'AnalystPortfolio', entityId: created.id,
      afterJson: { staffId, scope, targetValue },
    });
    return created;
  }

  async remove(id: string, actorId?: string) {
    const p = await this.prisma.analystPortfolio.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Portfolio not found');
    await this.prisma.analystPortfolio.delete({ where: { id } });
    await this.audit.log({
      actorType: 'STAFF', actorId, staffId: actorId,
      action: 'REMOVE_PORTFOLIO', entity: 'AnalystPortfolio', entityId: id,
      afterJson: { scope: p.scope, targetValue: p.targetValue },
    });
    return { success: true };
  }

  /**
   * The routing brain. Given a taxpayer, resolve the owning analyst by the most
   * specific matching portfolio:
   *   1. a provider the taxpayer's records come from   (PROVIDER)
   *   2. that provider's type                          (PROVIDER_TYPE)
   *   3. the taxpayer's sector                         (SECTOR)
   * Returns the staffId of the owner, or null if unowned.
   */
  async resolveOwner(taxpayerId: string): Promise<string | null> {
    // Providers this taxpayer's data comes from (+ their types).
    const recs = await this.prisma.dataRecord.findMany({
      where: { taxpayerId },
      select: { providerId: true, provider: { select: { providerType: true } } },
      distinct: ['providerId'],
    });
    const providerIds = [...new Set(recs.map((r) => r.providerId))];
    const providerTypes = [...new Set(recs.map((r) => r.provider?.providerType).filter(Boolean) as string[])];

    // 1. PROVIDER — most specific.
    if (providerIds.length) {
      const hit = await this.prisma.analystPortfolio.findFirst({
        where: { scope: 'PROVIDER', targetValue: { in: providerIds } },
      });
      if (hit) return hit.staffId;
    }
    // 2. PROVIDER_TYPE.
    if (providerTypes.length) {
      const hit = await this.prisma.analystPortfolio.findFirst({
        where: { scope: 'PROVIDER_TYPE', targetValue: { in: providerTypes } },
      });
      if (hit) return hit.staffId;
    }
    // 3. SECTOR.
    const tp = await this.prisma.taxpayer.findUnique({ where: { id: taxpayerId }, select: { sector: true } });
    if (tp?.sector) {
      const hit = await this.prisma.analystPortfolio.findFirst({
        where: { scope: 'SECTOR', targetValue: tp.sector },
      });
      if (hit) return hit.staffId;
    }
    return null;
  }

  /** Per-analyst workload: open cases, recovered value, portfolio breadth. */
  async workload() {
    const staff = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });

    const [caseAgg, recoveredAgg, portfolioCounts] = await Promise.all([
      this.prisma.underdeclarationCase.groupBy({
        by: ['assignedToId', 'status'],
        where: { assignedToId: { not: null } },
        _count: { _all: true },
        _sum: { estimatedTaxDue: true },
      }),
      this.prisma.underdeclarationCase.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { not: null }, status: 'RECOVERED' },
        _sum: { recoveredAmount: true },
      }),
      this.prisma.analystPortfolio.groupBy({ by: ['staffId'], _count: { _all: true } }),
    ]);

    const openByStaff = new Map<string, { open: number; atRisk: number }>();
    for (const c of caseAgg) {
      if (!c.assignedToId) continue;
      const a = openByStaff.get(c.assignedToId) ?? { open: 0, atRisk: 0 };
      if (c.status === 'OPEN' || c.status === 'UNDER_REVIEW') {
        a.open += c._count._all;
        a.atRisk += Number(c._sum.estimatedTaxDue ?? 0);
      }
      openByStaff.set(c.assignedToId, a);
    }
    const recoveredByStaff = new Map(recoveredAgg.map((r) => [r.assignedToId!, Number(r._sum.recoveredAmount ?? 0)]));
    const portfoliosByStaff = new Map(portfolioCounts.map((p) => [p.staffId, p._count._all]));

    return staff
      .map((s) => ({
        staff: s,
        openCases: openByStaff.get(s.id)?.open ?? 0,
        revenueAtRisk: openByStaff.get(s.id)?.atRisk ?? 0,
        recovered: recoveredByStaff.get(s.id) ?? 0,
        portfolios: portfoliosByStaff.get(s.id) ?? 0,
      }))
      // Only surface staff who actually carry work or a portfolio.
      .filter((r) => r.openCases > 0 || r.portfolios > 0 || r.recovered > 0)
      .sort((a, b) => b.openCases - a.openCases);
  }
}
