import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutoryService } from '../../modules/statutory/statutory.service';

/**
 * STATUTORY REPORTING THRESHOLD — the single source of truth for "who may be
 * reported at all".
 *
 * NTAA 2025 §29 (authoritative gazette, No. 117 of 26 Jun 2025) makes a party
 * reportable once its cumulative transactions IN A MONTH reach:
 *   - individuals: reportingThresholdIndividual (default ₦50m)
 *   - corporates:  reportingThresholdCorporate  (default ₦250m)
 * Both figures live in StatutoryConfig and are configurable.
 *
 * The trigger is MONTHLY-cumulative. Records carry a `periodLabel` of YYYY-MM
 * (monthly), YYYY-Qn (quarterly) or YYYY (annual). We evaluate the threshold per
 * (taxpayer, period) using the finest period each record was submitted at:
 *   - monthly data  → exact §29 monthly trigger;
 *   - coarser data (a quarter/year total) → compared against the same monthly
 *     threshold. This is CONSERVATIVE: a coarse total ≥ the monthly threshold
 *     makes the party reportable, and a coarse total cannot be split into months
 *     without finer data, so we never under-capture. (It can slightly over-
 *     capture a party whose coarse total clears the line but no single month
 *     does — acceptable, and avoidable only by submitting monthly data.)
 *
 * A taxpayer is reportable if they cross the threshold in AT LEAST ONE period
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
   * The set of taxpayer ids that are reportable. Optionally scoped to a year;
   * otherwise every period on record is considered. Uses one grouped-SQL pass
   * over (taxpayer, period) sums — cheap and exact. The §29 trigger is monthly;
   * grouping by `periodLabel` gives the exact monthly cumulative for monthly
   * data and a conservative approximation for coarser periods (see class docs).
   */
  async reportableTaxpayerIds(opts: { year?: number } = {}): Promise<Set<string>> {
    const cfg = await this.statutory.active();
    const indiv = cfg.reportingThresholdIndividual;
    const corp = cfg.reportingThresholdCorporate;

    // Sum inflow per (taxpayer, period), keep taxpayers whose type-specific §29
    // threshold is met in any period. `periodLabel` is the finest granularity the
    // data was submitted at (YYYY-MM / YYYY-Qn / YYYY). Raw SQL so the threshold
    // comparison and the type join happen in one grouped query.
    const yearFilter = opts.year ? `AND dr."periodYear" = ${Number(opts.year)}` : '';
    const rows = await this.prisma.$queryRawUnsafe<{ taxpayerId: string }[]>(
      `SELECT q."taxpayerId"
         FROM (
           SELECT dr."taxpayerId", dr."periodLabel", t.type, SUM(dr."totalInflow") AS q_inflow
             FROM data_records dr
             JOIN taxpayers t ON t.id = dr."taxpayerId"
            WHERE dr."taxpayerId" IS NOT NULL ${yearFilter}
              -- Account-opening records (₦0, identity-only) never count toward the
              -- statutory threshold. IS DISTINCT FROM also keeps legacy rows whose
              -- payload has no recordKind key (NULL) — those remain reportable.
              AND (dr.payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'
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
