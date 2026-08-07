import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutoryService } from '../../modules/statutory/statutory.service';

/**
 * STATUTORY REPORTING THRESHOLD — the single source of truth for "who may be
 * reported at all".
 *
 * NTAA 2025 §29 (authoritative gazette, No. 117 of 26 Jun 2025) makes a party
 * reportable once its cumulative transactions in a reporting period reach:
 *   - individuals: reportingThresholdIndividual (default ₦50m)
 *   - corporates:  reportingThresholdCorporate  (default ₦250m)
 * Both figures live in StatutoryConfig and are configurable.
 *
 * GRAIN = PER-QUARTER (operator decision). Data is submitted per quarter
 * (periodLabel like 2026-Q2), so the threshold is evaluated per (taxpayer,
 * quarter). A monthly label (YYYY-MM) is folded into its quarter before the
 * test, and a bare-year label buckets on itself — so a provider that reports
 * monthly faces the same quarterly bar as one reporting quarterly, rather than a
 * stricter per-month one, for the same inflow. A taxpayer is reportable if they
 * cross the threshold in AT LEAST ONE quarter (once reportable, all of their
 * data is in scope).
 *
 * Every reporting surface — scan, cases, flagged, tax-net, analytics, agents,
 * IRIS, taxpayer/record lists — filters through `reportableTaxpayerIds()` so
 * below-threshold parties never appear anywhere, no matter how much raw provider
 * data was uploaded.
 */
@Injectable()
export class ReportableService {
  constructor(
    private prisma: PrismaService,
    private statutory: StatutoryService,
  ) {}

  // Short-TTL memo of the reportable set per year-scope. The grouped SQL scans
  // ~2.16M records; a single page render can ask for it several times (analytics
  // by-provider + by-sector + a case list), so caching turns N heavy GROUP BYs
  // into one. The set only shifts when new data lands or a threshold is edited —
  // both rare relative to reads — so a 60s TTL is safely fresh. Keyed by year
  // ('all' for the unscoped call).
  private static readonly TTL_MS = 60_000;
  private cache = new Map<string, { at: number; ids: Set<string> }>();

  /**
   * The set of taxpayer ids that are reportable. Optionally scoped to a year;
   * otherwise every period on record is considered. Uses one grouped-SQL pass
   * over (taxpayer, quarter) sums — cheap and exact. The §29 grain is per-quarter;
   * `periodLabel` is normalised to a quarter key before the threshold test (see
   * class docs). Memoised for TTL_MS to collapse repeated calls in one request.
   */
  async reportableTaxpayerIds(opts: { year?: number } = {}): Promise<Set<string>> {
    const cacheKey = opts.year ? `y:${opts.year}` : 'all';
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < ReportableService.TTL_MS) {
      // Return a copy so callers that spread/mutate can't corrupt the cached set.
      return new Set(hit.ids);
    }

    const cfg = await this.statutory.active();
    const indiv = cfg.reportingThresholdIndividual;
    const corp = cfg.reportingThresholdCorporate;

    // Sum inflow per (taxpayer, QUARTER), keep taxpayers whose type-specific §29
    // threshold is met in any quarter. The statutory grain is per-quarter (user
    // decision), so a monthly label (YYYY-MM) is folded into its quarter before
    // the threshold test — otherwise a provider that reports monthly would face a
    // stricter per-month bar than one reporting quarterly for the same annual
    // inflow. Current prod data is ~all YYYY-Qn already; this keeps the grain
    // stable if monthly submissions ever arrive. Raw SQL so the quarter
    // normalisation, threshold comparison and type join run in one grouped query.
    const yearFilter = opts.year ? `AND dr."periodYear" = ${Number(opts.year)}` : '';
    // This GROUP BY runs over the full data_records table (millions of rows) on
    // every cache-miss call — confirmed at 3.3s on prod with default work_mem
    // (4MB), the same disk-based-sort issue found in the /data-quality endpoint
    // (see bizdata-data-quality-slow-query memory). SET LOCAL scopes a larger
    // work_mem to just this transaction/query so it can't starve other
    // concurrent queries on the memory-constrained host. This is the single
    // heaviest call behind /dashboard, /cases and /analytics, all of which
    // gate through here.
    const rows = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL work_mem = '64MB'`);
        return tx.$queryRawUnsafe<{ taxpayerId: string }[]>(
          `SELECT q."taxpayerId"
             FROM (
               SELECT dr."taxpayerId",
                      -- Normalise period → quarter key. YYYY-Qn passes through; YYYY-MM
                      -- maps to its quarter; anything else (e.g. bare YYYY) keys on the
                      -- label as-is so it still buckets consistently with itself.
                      CASE
                        WHEN dr."periodLabel" ~ '^[0-9]{4}-Q[1-4]$' THEN dr."periodLabel"
                        WHEN dr."periodLabel" ~ '^[0-9]{4}-[0-9]{2}$'
                          THEN left(dr."periodLabel", 4) || '-Q'
                               || ((cast(substr(dr."periodLabel", 6, 2) AS int) - 1) / 3 + 1)::text
                        ELSE dr."periodLabel"
                      END AS quarter_key,
                      t.type, SUM(dr."totalInflow") AS q_inflow
                 FROM data_records dr
                 JOIN taxpayers t ON t.id = dr."taxpayerId"
                WHERE dr."taxpayerId" IS NOT NULL ${yearFilter}
                  -- Account-opening records (₦0, identity-only) never count toward the
                  -- statutory threshold. IS DISTINCT FROM also keeps legacy rows whose
                  -- payload has no recordKind key (NULL) — those remain reportable.
                  AND (dr.payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'
                GROUP BY dr."taxpayerId", quarter_key, t.type
             ) q
            WHERE (q.type = 'INDIVIDUAL' AND q.q_inflow >= ${indiv})
               OR (q.type = 'CORPORATE'  AND q.q_inflow >= ${corp})
            GROUP BY q."taxpayerId"`,
        );
      },
      { timeout: 15000 },
    );
    const ids = new Set(rows.map((r) => r.taxpayerId));
    this.cache.set(cacheKey, { at: Date.now(), ids });
    // Hand back a copy so a caller spreading/mutating the result never touches
    // the stored set.
    return new Set(ids);
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
