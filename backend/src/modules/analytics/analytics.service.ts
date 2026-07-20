import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Cross-cutting analytics: comparative views of the data by provider and by
 * sector. Turns 7,000+ raw records into decision-grade aggregates — volume,
 * value, data quality, and enforcement yield.
 */
@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * By-provider comparative. For each active provider: how much data it
   * contributes, its quality, and the enforcement yield attributable to it.
   */
  async byProvider(year?: number) {
    const providers = await this.prisma.dataProvider.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, providerType: true, providerCode: true },
    });

    // Exclude ₦0 account-opening records so per-provider record counts are real.
    const recWhere: any = {
      ...(year ? { periodYear: year } : {}),
      NOT: { payload: { path: ['recordKind'], equals: 'ACCOUNT_OPENED' } },
    };

    // Records + observed inflow + identity completeness per provider.
    const [recAgg, taxpayerAgg, flaggedAgg, submissionAgg] = await Promise.all([
      this.prisma.dataRecord.groupBy({
        by: ['providerId'],
        where: recWhere,
        _count: { _all: true },
        _sum: { totalInflow: true },
      }),
      // distinct taxpayers per provider
      this.prisma.dataRecord.findMany({
        where: { ...recWhere, taxpayerId: { not: null } },
        select: { providerId: true, taxpayerId: true, bvn: true, nin: true },
      }),
      // flagged records per provider (enforcement yield)
      this.prisma.dataRecord.groupBy({
        by: ['providerId'],
        where: { ...recWhere, flaggedAsUnderdeclared: true },
        _count: { _all: true },
      }),
      // submission quality per provider
      this.prisma.dataSubmission.groupBy({
        by: ['providerId'],
        where: year ? { periodYear: year } : {},
        _sum: { recordCount: true, acceptedCount: true, rejectedCount: true },
      }),
    ]);

    const recByProv = new Map(recAgg.map((r) => [r.providerId, r]));
    const flaggedByProv = new Map(flaggedAgg.map((r) => [r.providerId, r._count._all]));
    const subByProv = new Map(submissionAgg.map((r) => [r.providerId, r]));

    // Distinct taxpayers + identity completeness per provider.
    const tpByProv = new Map<string, { tps: Set<string>; withId: number; total: number }>();
    for (const r of taxpayerAgg) {
      const a = tpByProv.get(r.providerId) ?? { tps: new Set<string>(), withId: 0, total: 0 };
      if (r.taxpayerId) a.tps.add(r.taxpayerId);
      a.total += 1;
      if (r.bvn || r.nin) a.withId += 1;
      tpByProv.set(r.providerId, a);
    }

    const rows = providers.map((p) => {
      const rec = recByProv.get(p.id);
      const tp = tpByProv.get(p.id);
      const sub = subByProv.get(p.id);
      const records = rec?._count._all ?? 0;
      const observedInflow = Number(rec?._sum.totalInflow ?? 0);
      const totalRecords = sub?._sum.recordCount ?? 0;
      const rejected = sub?._sum.rejectedCount ?? 0;
      return {
        provider: { id: p.id, name: p.name, providerType: p.providerType, providerCode: p.providerCode },
        records,
        taxpayers: tp?.tps.size ?? 0,
        observedInflow,
        flaggedRecords: flaggedByProv.get(p.id) ?? 0,
        rejectionRate: totalRecords > 0 ? Math.round((rejected / totalRecords) * 100) : 0,
        // identity completeness = share of rows with a resolvable BVN/NIN
        identityCompleteness: tp && tp.total > 0 ? Math.round((tp.withId / tp.total) * 100) : 0,
        // yield = flagged records per 1,000 rows (how much intelligence per volume)
        yieldPer1k: records > 0 ? Number((((flaggedByProv.get(p.id) ?? 0) / records) * 1000).toFixed(1)) : 0,
      };
    });

    rows.sort((a, b) => b.observedInflow - a.observedInflow);
    return {
      totals: {
        providers: rows.length,
        records: rows.reduce((s, r) => s + r.records, 0),
        observedInflow: rows.reduce((s, r) => s + r.observedInflow, 0),
        flagged: rows.reduce((s, r) => s + r.flaggedRecords, 0),
      },
      rows,
    };
  }

  /**
   * By-sector comparative. Underdeclaration concentration, tax-net coverage, and
   * observed value per economic sector.
   */
  async bySector(year?: number) {
    const taxpayers = await this.prisma.taxpayer.findMany({
      select: { id: true, sector: true, type: true, tinIndex: true, cacRcNumber: true },
    });

    // Exclude ₦0 account-opening records so per-provider record counts are real.
    const recWhere: any = {
      ...(year ? { periodYear: year } : {}),
      NOT: { payload: { path: ['recordKind'], equals: 'ACCOUNT_OPENED' } },
    };
    const [inflowAgg, flaggedTps, cases] = await Promise.all([
      this.prisma.dataRecord.groupBy({
        by: ['taxpayerId'],
        where: { ...recWhere, taxpayerId: { not: null } },
        _sum: { totalInflow: true },
      }),
      this.prisma.dataRecord.findMany({
        where: { ...recWhere, flaggedAsUnderdeclared: true, taxpayerId: { not: null } },
        select: { taxpayerId: true },
        distinct: ['taxpayerId'],
      }),
      this.prisma.underdeclarationCase.groupBy({
        by: ['taxpayerId'],
        where: year ? { year } : {},
        _sum: { estimatedTaxDue: true },
      }),
    ]);

    const inflowByTp = new Map(inflowAgg.map((r) => [r.taxpayerId!, Number(r._sum.totalInflow ?? 0)]));
    const flaggedSet = new Set(flaggedTps.map((r) => r.taxpayerId!));
    const taxByTp = new Map(cases.map((r) => [r.taxpayerId, Number(r._sum.estimatedTaxDue ?? 0)]));

    type Agg = {
      taxpayers: number; captured: number; flagged: number;
      observedInflow: number; estimatedTax: number;
    };
    const bySector = new Map<string, Agg>();
    for (const t of taxpayers) {
      const key = t.sector ?? 'UNCLASSIFIED';
      const a = bySector.get(key) ?? { taxpayers: 0, captured: 0, flagged: 0, observedInflow: 0, estimatedTax: 0 };
      a.taxpayers += 1;
      const inNet = t.type === 'CORPORATE' ? !!t.cacRcNumber : !!t.tinIndex;
      if (inNet) a.captured += 1;
      if (flaggedSet.has(t.id)) a.flagged += 1;
      a.observedInflow += inflowByTp.get(t.id) ?? 0;
      a.estimatedTax += taxByTp.get(t.id) ?? 0;
      bySector.set(key, a);
    }

    const rows = [...bySector.entries()].map(([sector, a]) => ({
      sector,
      taxpayers: a.taxpayers,
      flaggedTaxpayers: a.flagged,
      observedInflow: a.observedInflow,
      estimatedTax: a.estimatedTax,
      coveragePct: a.taxpayers > 0 ? Math.round((a.captured / a.taxpayers) * 100) : 0,
      flaggedPct: a.taxpayers > 0 ? Math.round((a.flagged / a.taxpayers) * 100) : 0,
    }));

    rows.sort((a, b) => b.estimatedTax - a.estimatedTax || b.observedInflow - a.observedInflow);
    return {
      totals: {
        sectors: rows.filter((r) => r.sector !== 'UNCLASSIFIED').length,
        classified: taxpayers.filter((t) => t.sector).length,
        unclassified: taxpayers.filter((t) => !t.sector).length,
      },
      rows,
    };
  }
}
