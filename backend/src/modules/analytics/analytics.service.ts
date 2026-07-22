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
    // NOTE: distinct-taxpayer + identity-completeness per provider is computed in
    // SQL (COUNT(DISTINCT ...)) rather than by loading every matching row into
    // Node and building JS Sets — the old findMany materialised ~1M rows in heap
    // and OOM-crashed the backend when the /analytics page loaded (year='').
    const yearClause = year ? `AND "periodYear" = ${Number(year)}` : '';
    const [recAgg, tpAggRaw, flaggedAgg, submissionAgg] = await Promise.all([
      this.prisma.dataRecord.groupBy({
        by: ['providerId'],
        where: recWhere,
        _count: { _all: true },
        _sum: { totalInflow: true },
      }),
      // distinct taxpayers + identity completeness per provider — aggregated in DB
      this.prisma.$queryRawUnsafe<
        { providerId: string; distinctTps: bigint; total: bigint; withId: bigint }[]
      >(
        `SELECT "providerId",
                COUNT(DISTINCT "taxpayerId") AS "distinctTps",
                COUNT(*)                     AS "total",
                COUNT(*) FILTER (WHERE "bvn" IS NOT NULL OR "nin" IS NOT NULL) AS "withId"
         FROM data_records
         WHERE "taxpayerId" IS NOT NULL
           AND (payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'
           ${yearClause}
         GROUP BY "providerId"`,
      ),
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

    // Distinct taxpayers + identity completeness per provider (from the SQL agg).
    const tpByProv = new Map<string, { distinctTps: number; withId: number; total: number }>(
      tpAggRaw.map((r) => [
        r.providerId,
        { distinctTps: Number(r.distinctTps), withId: Number(r.withId), total: Number(r.total) },
      ]),
    );

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
        taxpayers: tp?.distinctTps ?? 0,
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
    // Aggregate entirely in SQL, grouped by sector. The old version loaded ALL
    // ~1.6M taxpayers into Node (plus per-taxpayer maps) to bucket them in JS —
    // that OOM-crashed the backend on the /analytics page. Per-taxpayer inflow,
    // flagged status and estimated-tax are joined as CTEs so nothing but the
    // per-sector result rows (a handful) crosses the wire.
    const recFilter = `"taxpayerId" IS NOT NULL AND (payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'`;
    const recYear = year ? `AND "periodYear" = ${Number(year)}` : '';
    const caseYear = year ? `WHERE "year" = ${Number(year)}` : '';

    const rowsRaw = await this.prisma.$queryRawUnsafe<
      {
        sector: string; taxpayers: bigint; captured: bigint; flagged: bigint;
        observedInflow: number | string | null; estimatedTax: number | string | null;
      }[]
    >(
      `WITH inflow AS (
         SELECT "taxpayerId", SUM("totalInflow") AS inflow
         FROM data_records WHERE ${recFilter} ${recYear}
         GROUP BY "taxpayerId"),
       flagged AS (
         SELECT DISTINCT "taxpayerId" FROM data_records
         WHERE "flaggedAsUnderdeclared" = true AND ${recFilter} ${recYear}),
       taxdue AS (
         SELECT "taxpayerId", SUM("estimatedTaxDue") AS tax
         FROM underdeclaration_cases ${caseYear} GROUP BY "taxpayerId")
       SELECT COALESCE(t.sector, 'UNCLASSIFIED') AS sector,
              COUNT(*) AS taxpayers,
              COUNT(*) FILTER (WHERE CASE WHEN t.type = 'CORPORATE' THEN t."cacRcNumber" IS NOT NULL ELSE t."tinIndex" IS NOT NULL END) AS captured,
              COUNT(*) FILTER (WHERE f."taxpayerId" IS NOT NULL) AS flagged,
              COALESCE(SUM(i.inflow), 0) AS "observedInflow",
              COALESCE(SUM(td.tax), 0)   AS "estimatedTax"
       FROM taxpayers t
       LEFT JOIN inflow i  ON i."taxpayerId"  = t.id
       LEFT JOIN flagged f ON f."taxpayerId"  = t.id
       LEFT JOIN taxdue td ON td."taxpayerId" = t.id
       GROUP BY COALESCE(t.sector, 'UNCLASSIFIED')`,
    );

    const rows = rowsRaw.map((r) => {
      const taxpayers = Number(r.taxpayers);
      const captured = Number(r.captured);
      const flagged = Number(r.flagged);
      return {
        sector: r.sector,
        taxpayers,
        flaggedTaxpayers: flagged,
        observedInflow: Number(r.observedInflow ?? 0),
        estimatedTax: Number(r.estimatedTax ?? 0),
        coveragePct: taxpayers > 0 ? Math.round((captured / taxpayers) * 100) : 0,
        flaggedPct: taxpayers > 0 ? Math.round((flagged / taxpayers) * 100) : 0,
      };
    });

    rows.sort((a, b) => b.estimatedTax - a.estimatedTax || b.observedInflow - a.observedInflow);
    const classified = rows.filter((r) => r.sector !== 'UNCLASSIFIED').reduce((s, r) => s + r.taxpayers, 0);
    const unclassified = rows.find((r) => r.sector === 'UNCLASSIFIED')?.taxpayers ?? 0;
    return {
      totals: {
        sectors: rows.filter((r) => r.sector !== 'UNCLASSIFIED').length,
        classified,
        unclassified,
      },
      rows,
    };
  }
}
