import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * SUBMISSION DATA QUALITY — how complete is what the institutions actually send?
 *
 * Identifier coverage is the single biggest determinant of whether this system
 * works: a return with no NIN/BVN cannot be tied to a taxpayer, so its money
 * never reaches an assessment. This report measures that, per field and per
 * provider, and pairs it with what the coverage BOUGHT — the match-method mix
 * and average match confidence.
 *
 * Two levels, deliberately reported apart because they are not the same thing:
 *
 *  recordFields — what providers put on each row of a return. NIN, BVN, account
 *    number, phone, account name. This is the provider's compliance surface.
 *
 *  register — what the resolved taxpayer records hold. CAC RC lives only here.
 *    TIN now appears in BOTH places and they answer different questions: the
 *    record fill rate is how often providers supply a TIN on a return, while the
 *    register figure is how much of the taxpayer population we hold one for. The
 *    second is fed by the first — a supplied TIN is written onto a matched
 *    taxpayer that has none (SubmissionsService.enrichTaxpayerTin) — so the
 *    register number should climb as provider coverage does.
 *
 * NOT gated by the §29 reportable set, unlike the enforcement surfaces. This
 * measures PROVIDER compliance with the return format, not taxpayer liability,
 * and emits only aggregates — no party is identified. Gating it would silently
 * exclude below-threshold rows and misstate every fill rate.
 *
 * Counts use the blind indexes for distinctness: nin/bvn/accountNumber are
 * AES-GCM ciphertext with a random IV, so COUNT(DISTINCT nin) would count rows,
 * not people.
 */
@Injectable()
export class DataQualityService {
  constructor(private prisma: PrismaService) {}

  async identifiers(query: { year?: string; providerId?: string } = {}) {
    const year = query.year ? parseInt(query.year, 10) : undefined;
    const conds: string[] = ['1=1'];
    if (year) conds.push(`r."periodYear" = ${Number(year)}`);
    if (query.providerId) conds.push(`r."providerId" = '${String(query.providerId).replace(/'/g, "''")}'`);
    const where = conds.join(' AND ');

    const COVERAGE_SELECT = `
      COUNT(*)::bigint                                   AS records,
      COUNT(r."nin")::bigint                             AS nin_present,
      COUNT(DISTINCT r."ninIndex")::bigint               AS nin_distinct,
      COUNT(r."bvn")::bigint                             AS bvn_present,
      COUNT(DISTINCT r."bvnIndex")::bigint               AS bvn_distinct,
      COUNT(r."tin")::bigint                             AS tin_present,
      COUNT(DISTINCT r."tinIndex")::bigint               AS tin_distinct,
      COUNT(r."accountNumber")::bigint                   AS acct_present,
      COUNT(DISTINCT r."accountIndex")::bigint           AS acct_distinct,
      COUNT(r."phoneNumber")::bigint                     AS phone_present,
      COUNT(r."accountName")::bigint                     AS name_present,
      COUNT(r."taxpayerId")::bigint                      AS matched,
      COUNT(*) FILTER (WHERE r."nin" IS NULL AND r."bvn" IS NULL)::bigint AS no_identifier,
      AVG(r."matchConfidence")                           AS avg_conf`;

    const [totals, byProviderRows, byMethodRows, byYearRows, register] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`SELECT ${COVERAGE_SELECT} FROM data_records r WHERE ${where}`),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT r."providerId" AS "providerId", p."name" AS "providerName", p."providerType"::text AS "providerType",
                ${COVERAGE_SELECT}
           FROM data_records r JOIN data_providers p ON p.id = r."providerId"
          WHERE ${where}
          GROUP BY r."providerId", p."name", p."providerType"
          ORDER BY COUNT(*) DESC`,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COALESCE(r."matchMethod", 'UNMATCHED') AS method, COUNT(*)::bigint AS c, AVG(r."matchConfidence") AS avg_conf
           FROM data_records r WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT r."periodYear" AS year, ${COVERAGE_SELECT}
           FROM data_records r WHERE ${where} GROUP BY r."periodYear" ORDER BY r."periodYear" DESC`,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::bigint                             AS taxpayers,
                COUNT("tinIndex")::bigint                    AS with_tin,
                COUNT("ninIndex")::bigint                    AS with_nin,
                COUNT("bvnIndex")::bigint                    AS with_bvn,
                COUNT("cacRcNumber")::bigint                 AS with_rc,
                COUNT("identityVerifiedAt")::bigint          AS id_verified,
                COUNT(*) FILTER (WHERE "type" = 'CORPORATE')::bigint AS corporates,
                COUNT(*) FILTER (WHERE "type" = 'CORPORATE' AND "cacRcNumber" IS NOT NULL)::bigint AS corporates_with_rc
           FROM taxpayers`,
      ),
    ]);

    const t = totals[0] ?? {};
    const records = Number(t.records ?? 0);
    const reg = register[0] ?? {};
    const taxpayers = Number(reg.taxpayers ?? 0);
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    return {
      scope: { year: year ?? null, providerId: query.providerId ?? null, records, providers: byProviderRows.length },

      // What providers put on the rows they submitted.
      recordFields: [
        this.field('nin', 'NIN', t.nin_present, t.nin_distinct, records,
          'Compulsory on every return, and the strongest match key the current template collects.'),
        this.field('bvn', 'BVN', t.bvn_present, t.bvn_distinct, records,
          'Compulsory on every return.'),
        this.field('accountNumber', 'Account number', t.acct_present, t.acct_distinct, records,
          'Compulsory. Distinct count is the number of accounts on file.'),
        this.field('tin', 'TIN', t.tin_present, t.tin_distinct, records,
          'Optional — the strongest match key (0.97, above BVN). Now retained per return and used to enrich the register.'),
        this.field('accountName', 'Account name', t.name_present, null, records,
          'Compulsory. Used for name-based linkage when identifiers are absent.'),
        this.field('phoneNumber', 'Phone', t.phone_present, null, records,
          'Not part of the current seven-column return — historic rows only.'),
      ],

      // The consequence of that coverage.
      matchQuality: {
        matched: Number(t.matched ?? 0),
        matchedPct: pct(Number(t.matched ?? 0), records),
        unmatched: records - Number(t.matched ?? 0),
        noIdentifier: Number(t.no_identifier ?? 0),
        noIdentifierPct: pct(Number(t.no_identifier ?? 0), records),
        avgConfidence: t.avg_conf == null ? null : Math.round(Number(t.avg_conf) * 100) / 100,
        byMethod: byMethodRows.map((m) => ({
          method: m.method,
          records: Number(m.c),
          share: pct(Number(m.c), records),
          avgConfidence: m.avg_conf == null ? null : Math.round(Number(m.avg_conf) * 100) / 100,
        })),
      },

      // The resolved register. TIN and RC exist ONLY at this level.
      register: {
        taxpayers,
        withTin: Number(reg.with_tin ?? 0), withTinPct: pct(Number(reg.with_tin ?? 0), taxpayers),
        withNin: Number(reg.with_nin ?? 0), withNinPct: pct(Number(reg.with_nin ?? 0), taxpayers),
        withBvn: Number(reg.with_bvn ?? 0), withBvnPct: pct(Number(reg.with_bvn ?? 0), taxpayers),
        withRc: Number(reg.with_rc ?? 0), withRcPct: pct(Number(reg.with_rc ?? 0), taxpayers),
        identityVerified: Number(reg.id_verified ?? 0),
        identityVerifiedPct: pct(Number(reg.id_verified ?? 0), taxpayers),
        corporates: Number(reg.corporates ?? 0),
        corporatesWithRc: Number(reg.corporates_with_rc ?? 0),
        corporatesWithRcPct: pct(Number(reg.corporates_with_rc ?? 0), Number(reg.corporates ?? 0)),
      },

      byProvider: byProviderRows.map((p) => this.coverageRow(p, {
        providerId: p.providerId, providerName: p.providerName, providerType: p.providerType,
      })),
      byYear: byYearRows.map((y) => this.coverageRow(y, { year: Number(y.year) })),
    };
  }

  /** One field's fill rate. `distinct` is null where no blind index backs the column. */
  private field(key: string, label: string, present: any, distinct: any, records: number, note: string) {
    const p = Number(present ?? 0);
    return {
      field: key,
      label,
      present: p,
      missing: records - p,
      coverage: records > 0 ? Math.round((p / records) * 1000) / 10 : 0,
      distinct: distinct == null ? null : Number(distinct),
      note,
    };
  }

  /** Shared shape for the per-provider and per-year coverage rows. */
  private coverageRow(r: any, extra: Record<string, unknown>) {
    const records = Number(r.records ?? 0);
    const pct = (n: any) => (records > 0 ? Math.round((Number(n ?? 0) / records) * 1000) / 10 : 0);
    return {
      ...extra,
      records,
      ninCoverage: pct(r.nin_present),
      bvnCoverage: pct(r.bvn_present),
      accountCoverage: pct(r.acct_present),
      nameCoverage: pct(r.name_present),
      matchedPct: pct(r.matched),
      noIdentifier: Number(r.no_identifier ?? 0),
      distinctCustomers: Number(r.bvn_distinct ?? 0) || Number(r.nin_distinct ?? 0),
      avgConfidence: r.avg_conf == null ? null : Math.round(Number(r.avg_conf) * 100) / 100,
    };
  }
}
