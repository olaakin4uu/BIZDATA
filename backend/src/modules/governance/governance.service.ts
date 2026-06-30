import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Governance reporting + bank MoU onboarding. (Stub — implemented by the
 * feature-fleet workflow.) report(year) should assemble a steering/Minister
 * pack: revenue at risk & recovered, cases by status, agent-signal counts, and
 * a provider-compliance summary. MoU methods manage the §7 onboarding record.
 */
@Injectable()
export class GovernanceService {
  constructor(private prisma: PrismaService) {}

  async report(year: number): Promise<any> {
    const atRiskStatuses = [
      'OPEN',
      'UNDER_REVIEW',
      'NOTICE_ISSUED',
      'OBJECTION',
      'CONFIRMED',
      'SETTLED',
    ];
    const recoveredStatuses = ['RECOVERED', 'SETTLED'];

    const [
      revenueAtRiskAgg,
      recoveredAgg,
      groupedByStatus,
      totalCases,
      agentSignalCount,
      activeProviders,
      providersWithSubmissions,
      topCasesRaw,
    ] = await Promise.all([
      this.prisma.underdeclarationCase.aggregate({
        where: { year, status: { in: atRiskStatuses as any } },
        _sum: { estimatedTaxDue: true },
      }),
      this.prisma.underdeclarationCase.aggregate({
        where: { year, status: { in: recoveredStatuses as any } },
        _sum: { recoveredAmount: true },
      }),
      this.prisma.underdeclarationCase.groupBy({
        by: ['status'],
        where: { year },
        _count: { _all: true },
      }),
      this.prisma.underdeclarationCase.count({ where: { year } }),
      this.prisma.riskSignal.count({ where: { year } }),
      this.prisma.dataProvider.count({ where: { status: 'ACTIVE' as any } }),
      this.prisma.dataSubmission.findMany({
        where: { periodYear: year },
        select: { providerId: true },
        distinct: ['providerId'],
      }),
      this.prisma.underdeclarationCase.findMany({
        where: { year },
        orderBy: { estimatedTaxDue: 'desc' },
        take: 5,
        select: { id: true, year: true, estimatedTaxDue: true, status: true },
      }),
    ]);

    const casesByStatus = groupedByStatus.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topCases = topCasesRaw.map((c) => ({
      id: c.id,
      year: c.year,
      estimatedTaxDue: Number(c.estimatedTaxDue),
      status: c.status,
    }));

    return {
      year,
      revenueAtRisk: Number(revenueAtRiskAgg._sum.estimatedTaxDue ?? 0),
      recovered: Number(recoveredAgg._sum.recoveredAmount ?? 0),
      casesByStatus,
      totalCases,
      agentSignalCount,
      providers: {
        active: activeProviders,
        withSubmissions: providersWithSubmissions.length,
      },
      topCases,
    };
  }

  async listMou() {
    return this.prisma.bankMou.findMany({ include: { provider: { select: { name: true, providerType: true } } } });
  }

  async upsertMou(dto: any) {
    const { providerId, ...rest } = dto || {};
    return this.prisma.bankMou.upsert({
      where: { providerId },
      create: { providerId, ...rest },
      update: rest,
    });
  }
}
