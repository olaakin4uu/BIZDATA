import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutoryService } from '../../modules/statutory/statutory.service';

/**
 * STATUTORY REPORTING THRESHOLD — the single source of truth for "who may be
 * reported at all".
 *
 * By law a party only becomes reportable once its cumulative inflow within a
 * reporting period (a quarter, matching how providers submit) reaches:
 *   - individuals: reportingThresholdIndividual (default ₦50m)
 *   - corporates:  reportingThresholdCorporate  (default ₦250m)
 * Both figures live in StatutoryConfig and are configurable.
 *
 * A taxpayer is reportable if they cross the threshold in AT LEAST ONE quarter
 * (once reportable, all of their data is in scope). Every reporting surface —
 * scan, cases, flagged, tax-net, analytics, agents, taxpayer/record lists —
 * filters through `reportableTaxpayerIds()` so below-threshold parties never
 * appear anywhere, no matter how much raw provider data was uploaded.
 */
@Injectable()
export class ReportableService {
  constructor(
    private prisma: PrismaService,
    private statutory: StatutoryService,
  ) {}

  /**
   * The set of taxpayer ids that are reportable. Optionally scoped to a year
   * (quarters within that year); otherwise every quarter on record is considered.
   * Uses one grouped-SQL pass over (taxpayer, quarter) sums — cheap and exact.
   */
  async reportableTaxpayerIds(opts: { year?: number } = {}): Promise<Set<string>> {
    const cfg = await this.statutory.active();
    const indiv = cfg.reportingThresholdIndividual;
    const corp = cfg.reportingThresholdCorporate;

    // Sum inflow per (taxpayer, quarter), keep taxpayers whose type-specific
    // threshold is met in any quarter. Raw SQL so the threshold comparison and
    // the type join happen in one grouped query.
    const yearFilter = opts.year ? `AND dr."periodYear" = ${Number(opts.year)}` : '';
    const rows = await this.prisma.$queryRawUnsafe<{ taxpayerId: string }[]>(
      `SELECT q."taxpayerId"
         FROM (
           SELECT dr."taxpayerId", dr."periodLabel", t.type, SUM(dr."totalInflow") AS q_inflow
             FROM data_records dr
             JOIN taxpayers t ON t.id = dr."taxpayerId"
            WHERE dr."taxpayerId" IS NOT NULL ${yearFilter}
            GROUP BY dr."taxpayerId", dr."periodLabel", t.type
         ) q
        WHERE (q.type = 'INDIVIDUAL' AND q.q_inflow >= ${indiv})
           OR (q.type = 'CORPORATE'  AND q.q_inflow >= ${corp})
        GROUP BY q."taxpayerId"`,
    );
    return new Set(rows.map((r) => r.taxpayerId));
  }

  /** Convenience: is this one taxpayer reportable? */
  async isReportable(taxpayerId: string, opts: { year?: number } = {}): Promise<boolean> {
    const ids = await this.reportableTaxpayerIds(opts);
    return ids.has(taxpayerId);
  }

  /** The active thresholds, for display/UI. */
  async thresholds(): Promise<{ individual: number; corporate: number }> {
    const cfg = await this.statutory.active();
    return { individual: cfg.reportingThresholdIndividual, corporate: cfg.reportingThresholdCorporate };
  }
}
