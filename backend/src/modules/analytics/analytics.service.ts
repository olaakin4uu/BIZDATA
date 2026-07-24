import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportableService } from '../../common/services/reportable.service';

/**
 * Cross-cutting analytics: comparative views of the data by provider and by
 * sector. Turns 7,000+ raw records into decision-grade aggregates — volume,
 * value, data quality, and enforcement yield.
 *
 * Scoped to REPORTABLE taxpayers (§29 threshold) so "underdeclaration
 * concentration / gap" means the same thing here as in cases / tax-net —
 * below-threshold parties are never framed as an underdeclaration signal.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private reportable: ReportableService,
  ) {}

  /**
   * By-provider comparative. For each active provider: how much data it
   * contributes, its quality, and the enforcement yield attributable to it.
   */
  async byProvider(year?: number) {
    const providers = await this.prisma.dataProvider.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, providerType: true, providerCode: true },
    });

    // Reportable-taxpayer gate (§29). Analytics only concerns parties over the
    // threshold, so below-threshold volume isn't framed as underdeclaration.
    const reportableIds = [...(await this.reportable.reportableTaxpayerIds(year ? { year } : {}))];
    if (reportableIds.length === 0) {
      return { totals: { providers: 0, records: 0, observedInflow: 0, flagged: 0 }, rows: [] };
    }

    // Everything per-provider is aggregated in ONE raw query: record count,
    // observed inflow, distinct taxpayers, identity completeness and flagged
    // count. The reportable set is passed as a single `= ANY($1::text[])` array
    // bind — NOT a Prisma `in` list, which expands to one parameter per id and
    // trips Postgres' ~32k bind-parameter cap (P2029) once the reportable
    // population is large (e.g. after a bulk provider upload). ₦0 account-opening
    // rows are excluded so counts reflect real transactions; aggregating in SQL
    // (not findMany + JS Sets) also keeps the ~1M-row table out of heap.
    const yearClause = year ? `AND "periodYear" = ${Number(year)}` : '';
    const [provAggRaw, submissionAgg] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        { providerId: string; distinctTps: bigint; total: bigint; withId: bigint; observedInflow: string | null; flagged: bigint }[]
      >(
        `SELECT "providerId",
                COUNT(DISTINCT "taxpayerId")                                   AS "distinctTps",
                COUNT(*)                                                       AS "total",
                COUNT(*) FILTER (WHERE "bvn" IS NOT NULL OR "nin" IS NOT NULL)  AS "withId",
                COALESCE(SUM("totalInflow"), 0)                                AS "observedInflow",
                COUNT(*) FILTER (WHERE "flaggedAsUnderdeclared" = true)         AS "flagged"
         FROM data_records
         WHERE "taxpayerId" = ANY($1::text[])
           AND (payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'
           ${yearClause}
         GROUP BY "providerId"`,
        reportableIds,
      ),
      // submission quality per provider
      this.prisma.dataSubmission.groupBy({
        by: ['providerId'],
        where: year ? { periodYear: year } : {},
        _sum: { recordCount: true, acceptedCount: true, rejectedCount: true },
      }),
    ]);

    const provByProv = new Map(provAggRaw.map((r) => [r.providerId, r]));
    const subByProv = new Map(submissionAgg.map((r) => [r.providerId, r]));

    const rows = providers.map((p) => {
      const agg = provByProv.get(p.id);
      const sub = subByProv.get(p.id);
      const records = Number(agg?.total ?? 0);
      const withId = Number(agg?.withId ?? 0);
      const flaggedRecords = Number(agg?.flagged ?? 0);
      const totalRecords = sub?._sum.recordCount ?? 0;
      const rejected = sub?._sum.rejectedCount ?? 0;
      return {
        provider: { id: p.id, name: p.name, providerType: p.providerType, providerCode: p.providerCode },
        records,
        taxpayers: Number(agg?.distinctTps ?? 0),
        observedInflow: Number(agg?.observedInflow ?? 0),
        flaggedRecords,
        rejectionRate: totalRecords > 0 ? Math.round((rejected / totalRecords) * 100) : 0,
        // identity completeness = share of rows with a resolvable BVN/NIN
        identityCompleteness: records > 0 ? Math.round((withId / records) * 100) : 0,
        // yield = flagged records per 1,000 rows (how much intelligence per volume)
        yieldPer1k: records > 0 ? Number(((flaggedRecords / records) * 1000).toFixed(1)) : 0,
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
    // Reportable-taxpayer gate (§29) — sector comparatives count only parties
    // over the threshold, matching cases/tax-net/by-provider.
    const reportableIds = [...(await this.reportable.reportableTaxpayerIds(year ? { year } : {}))];
    if (reportableIds.length === 0) {
      return { totals: { sectors: 0, classified: 0, unclassified: 0 }, rows: [] };
    }

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
       WHERE t.id = ANY($1::text[])
       GROUP BY COALESCE(t.sector, 'UNCLASSIFIED')`,
      reportableIds,
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
