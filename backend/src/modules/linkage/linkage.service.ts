import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';
import { ReportableService } from '../../common/services/reportable.service';

/**
 * ACCOUNT LINKAGE — one customer, many accounts.
 *
 * Two views of the same question, deliberately kept apart because they carry
 * very different evidential weight:
 *
 *  byIdentifier() — groups on the BLIND INDEX of the NIN/BVN the provider
 *    reported. A shared identifier is strong evidence of one person, so this is
 *    the authoritative view. It groups on bvnIndex/ninIndex rather than the
 *    bvn/nin columns because those are AES-GCM ciphertext with a random IV —
 *    equal values do NOT produce equal ciphertext, so grouping on them would
 *    silently return one group per row.
 *
 *  byName() — groups on a NORMALISED account name. Names are a weak key: two
 *    unrelated people share one readily, and the same person is written a dozen
 *    ways. So every cluster carries an `idAgreement` verdict computed from the
 *    identifiers underneath it, and the caller is expected to treat the output
 *    as leads to review, never as fact. See NAME_SQL for the normalisation.
 *
 * Both are gated by the §29 reportable set, like every other reporting surface
 * (scan, cases, analytics, tax-net) — a party below the statutory threshold must
 * not surface here either.
 */
export type IdAgreement = 'SAME_ID' | 'CONFLICTING' | 'NO_ID';

/**
 * What the identifiers say about a name cluster — the single judgement call in
 * the name report, so it is a pure function and unit-tested.
 *
 *  SAME_ID     — one identifier, present on every record. The name match merely
 *                confirms what the identifier already establishes.
 *  CONFLICTING — more than one identifier under the same name. Usually
 *                namesakes; occasionally one person operating under two
 *                identities. Either way a human decides, not this report.
 *  NO_ID       — no identifier at all, or only some records carry one, so
 *                nothing corroborates the name. Weakest possible lead.
 *
 * A partially-identified cluster (one id, but some records with none) is NOT
 * SAME_ID: the unidentified rows are exactly the ones that could belong to
 * someone else, which is the case the reviewer must not have hidden from them.
 */
export function classifyIdAgreement(distinctIds: number, noIdRecords: number): IdAgreement {
  if (distinctIds > 1) return 'CONFLICTING';
  if (distinctIds === 1 && noIdRecords === 0) return 'SAME_ID';
  return 'NO_ID';
}

@Injectable()
export class LinkageService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
    private reportable: ReportableService,
  ) {}

  /**
   * Normalise an account name for comparison, in SQL so the grouping happens in
   * the database:
   *   - upper-case, strip anything that is not a letter/digit/space
   *   - drop honorifics and company-form noise that vary between providers
   *   - collapse whitespace, then SORT THE WORDS
   *
   * Sorting the tokens is what makes "IBRAHIM MUSA SANI" and "SANI IBRAHIM
   * MUSA" the same key — Nigerian providers order given/family names
   * inconsistently, and without it the report misses the very duplicates it
   * exists to find.
   */
  private static readonly NAME_KEY_SQL = `
    (SELECT string_agg(w, ' ' ORDER BY w)
       FROM unnest(string_to_array(
              regexp_replace(upper(coalesce(r."accountName", '')), '[^A-Z0-9]+', ' ', 'g'),
              ' ')) AS w
      WHERE w <> ''
        AND w NOT IN ('MR','MRS','MS','MISS','DR','PROF','ALHAJI','ALHAJA','HAJIYA','MALLAM','CHIEF','ENGR','BARR',
                      'LTD','LIMITED','PLC','GTE','NIG','NIGERIA','AND','THE','ENTERPRISES','ENTERPRISE','VENTURES'))
  `;

  /** Customers holding more than one account, keyed on a reported identifier. */
  async byIdentifier(query: { year?: string; minAccounts?: string; multiProviderOnly?: string; limit?: string } = {}) {
    const year = query.year ? parseInt(query.year, 10) : undefined;
    const minAccounts = Math.max(2, parseInt(query.minAccounts ?? '2', 10));
    const limit = Math.min(500, Math.max(1, parseInt(query.limit ?? '100', 10)));
    const ids = [...(await this.reportable.reportableTaxpayerIds(year ? { year } : {}))];
    if (!ids.length) return { rows: [], total: 0, identifiersConsidered: 0 };

    // One row per (identifier type, identifier). A customer who presents a NIN
    // to one bank and only a BVN to another appears once per identifier — the
    // honest result, since nothing in the data ties the two together.
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH ids AS (
         SELECT 'NIN' AS id_type, r."ninIndex" AS id_index, r.* FROM data_records r
          WHERE r."ninIndex" IS NOT NULL
         UNION ALL
         SELECT 'BVN' AS id_type, r."bvnIndex" AS id_index, r.* FROM data_records r
          WHERE r."bvnIndex" IS NOT NULL
       )
       SELECT id_type                                            AS "idType",
              id_index                                           AS "idIndex",
              COUNT(DISTINCT "accountIndex")                     AS accounts,
              COUNT(DISTINCT "providerId")                       AS providers,
              COUNT(*)                                           AS records,
              COALESCE(SUM("totalInflow"), 0)::text              AS inflow,
              COALESCE(SUM("totalOutflow"), 0)::text             AS outflow,
              COUNT(DISTINCT "taxpayerId")                       AS taxpayers,
              COUNT(*) FILTER (WHERE "flaggedAsUnderdeclared")   AS flagged,
              (array_agg(DISTINCT "accountName") FILTER (WHERE "accountName" IS NOT NULL))[1:5] AS names,
              array_agg(DISTINCT "providerId")                   AS "providerIds",
              MIN("periodYear")                                  AS "firstYear",
              MAX("periodYear")                                  AS "lastYear"
         FROM ids
        WHERE "taxpayerId" = ANY($1::text[])
          AND (payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'
          ${year ? `AND "periodYear" = ${Number(year)}` : ''}
        GROUP BY id_type, id_index
       HAVING COUNT(DISTINCT "accountIndex") >= ${minAccounts}
          ${query.multiProviderOnly === 'true' ? 'AND COUNT(DISTINCT "providerId") > 1' : ''}
        ORDER BY COUNT(DISTINCT "providerId") DESC, COUNT(DISTINCT "accountIndex") DESC, SUM("totalInflow") DESC NULLS LAST
        LIMIT ${limit}`,
      ids,
    );

    const providerNames = await this.providerNameMap();
    return {
      rows: rows.map((r) => ({
        idType: r.idType,
        // The blind index is a keyed HMAC and is never reversible, but it is
        // still a stable per-person pseudonym — return only a short prefix so it
        // can key a UI row without becoming a tracking handle of its own.
        idRef: String(r.idIndex).slice(0, 12),
        accounts: Number(r.accounts),
        providers: Number(r.providers),
        providerNames: (r.providerIds ?? []).map((id: string) => providerNames.get(id) ?? 'Unknown'),
        records: Number(r.records),
        inflow: Number(r.inflow),
        outflow: Number(r.outflow),
        flagged: Number(r.flagged),
        // >1 taxpayer under ONE identifier means entity resolution split the same
        // person; the reviewer needs to see that rather than have it hidden.
        taxpayers: Number(r.taxpayers),
        names: r.names ?? [],
        firstYear: r.firstYear,
        lastYear: r.lastYear,
      })),
      total: rows.length,
      truncated: rows.length === limit,
    };
  }

  /** Name clusters spanning several accounts or providers — leads, not findings. */
  async byName(query: { year?: string; minAccounts?: string; multiProviderOnly?: string; limit?: string } = {}) {
    const year = query.year ? parseInt(query.year, 10) : undefined;
    const minAccounts = Math.max(2, parseInt(query.minAccounts ?? '2', 10));
    const limit = Math.min(500, Math.max(1, parseInt(query.limit ?? '100', 10)));
    const ids = [...(await this.reportable.reportableTaxpayerIds(year ? { year } : {}))];
    if (!ids.length) return { rows: [], total: 0 };

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `WITH keyed AS (
         SELECT ${LinkageService.NAME_KEY_SQL} AS name_key, r.*
           FROM data_records r
          WHERE r."taxpayerId" = ANY($1::text[])
            AND r."accountName" IS NOT NULL
            AND (r.payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'
            ${year ? `AND r."periodYear" = ${Number(year)}` : ''}
       )
       SELECT name_key                                           AS "nameKey",
              COUNT(DISTINCT "accountIndex")                     AS accounts,
              COUNT(DISTINCT "providerId")                       AS providers,
              COUNT(*)                                           AS records,
              COALESCE(SUM("totalInflow"), 0)::text              AS inflow,
              COUNT(DISTINCT COALESCE("ninIndex", "bvnIndex"))   AS "distinctIds",
              COUNT(*) FILTER (WHERE "ninIndex" IS NULL AND "bvnIndex" IS NULL) AS "noIdRecords",
              COUNT(DISTINCT "taxpayerId")                       AS taxpayers,
              (array_agg(DISTINCT "accountName"))[1:6]           AS "nameVariants",
              array_agg(DISTINCT "providerId")                   AS "providerIds"
         FROM keyed
        WHERE name_key IS NOT NULL AND name_key <> ''
        GROUP BY name_key
       HAVING COUNT(DISTINCT "accountIndex") >= ${minAccounts}
          ${query.multiProviderOnly === 'true' ? 'AND COUNT(DISTINCT "providerId") > 1' : ''}
        ORDER BY COUNT(DISTINCT "providerId") DESC, COUNT(DISTINCT "accountIndex") DESC, SUM("totalInflow") DESC NULLS LAST
        LIMIT ${limit}`,
      ids,
    );

    const providerNames = await this.providerNameMap();
    return {
      rows: rows.map((r) => {
        const distinctIds = Number(r.distinctIds);
        const noIdRecords = Number(r.noIdRecords);
        return {
          nameKey: r.nameKey,
          nameVariants: r.nameVariants ?? [],
          accounts: Number(r.accounts),
          providers: Number(r.providers),
          providerNames: (r.providerIds ?? []).map((id: string) => providerNames.get(id) ?? 'Unknown'),
          records: Number(r.records),
          inflow: Number(r.inflow),
          taxpayers: Number(r.taxpayers),
          distinctIds,
          idAgreement: classifyIdAgreement(distinctIds, noIdRecords),
        };
      }),
      total: rows.length,
      truncated: rows.length === limit,
    };
  }

  private async providerNameMap(): Promise<Map<string, string>> {
    const providers = await this.prisma.dataProvider.findMany({ select: { id: true, name: true } });
    return new Map(providers.map((p) => [p.id, p.name]));
  }
}
