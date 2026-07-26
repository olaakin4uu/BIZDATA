import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';
import { ReportableService } from '../../common/services/reportable.service';

@Injectable()
export class DataRecordsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
    private reportable: ReportableService,
  ) {}

  /** Decrypt PII on a record (and its taxpayer include), masking unless allowed. */
  private decryptRecord(r: any, allowClear: boolean) {
    if (!r) return r;
    return {
      ...r,
      accountNumber: this.pii.reveal(this.crypto.decrypt(r.accountNumber), 'account', allowClear),
      bvn: this.pii.reveal(this.crypto.decrypt(r.bvn), 'bvn', allowClear),
      nin: this.pii.reveal(this.crypto.decrypt(r.nin), 'nin', allowClear),
      phoneNumber: this.crypto.decrypt(r.phoneNumber),
      taxpayer: r.taxpayer
        ? {
            ...r.taxpayer,
            nin: this.pii.reveal(this.crypto.decrypt(r.taxpayer.ninEnc), 'nin', allowClear),
            tin: this.crypto.decrypt(r.taxpayer.tinEnc),
            bvn: this.pii.reveal(this.crypto.decrypt(r.taxpayer.bvnEnc), 'bvn', allowClear),
          }
        : r.taxpayer,
    };
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    // A taxpayer-scoped query (a case's observed flows) is bounded to one
    // identity, so allow a higher cap to show the full cross-provider ledger;
    // the general listing stays capped at 200.
    const maxLimit = query.taxpayerId ? 5000 : 200;
    const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit || '50', 10)));
    // STATUTORY REPORTING THRESHOLD — records only surface for taxpayers whose
    // aggregated quarterly inflow meets their type threshold. The reportable set
    // is passed to SQL as ONE `= ANY($1::text[])` array bind (not a Prisma `in`
    // list, which expands to one parameter per id and trips Postgres' ~32k cap /
    // P2029 once the reportable population is large). Resolve just this page's
    // record ids + true count in SQL, then hydrate that page through Prisma.
    const conds: Prisma.Sql[] = [
      // ₦0 account-opening rows (identity graph only) excluded from this list.
      Prisma.sql`(r.payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'`,
    ];
    if (query.providerId) conds.push(Prisma.sql`r."providerId" = ${String(query.providerId)}`);
    if (query.providerType) conds.push(Prisma.sql`r."providerType"::text = ${String(query.providerType)}`);
    if (query.periodYear) conds.push(Prisma.sql`r."periodYear" = ${parseInt(query.periodYear, 10)}`);
    if (query.taxpayerId) {
      conds.push(Prisma.sql`r."taxpayerId" = ${String(query.taxpayerId)}`);
    } else {
      const reportableIds = [...(await this.reportable.reportableTaxpayerIds(
        query.periodYear ? { year: parseInt(query.periodYear, 10) } : {},
      ))];
      conds.push(Prisma.sql`r."taxpayerId" = ANY(${reportableIds}::text[])`);
    }
    if (query.flagged === 'true') conds.push(Prisma.sql`r."flaggedAsUnderdeclared" = true`);
    if (query.flagged === 'false') conds.push(Prisma.sql`r."flaggedAsUnderdeclared" = false`);
    if (query.reviewStatus) conds.push(Prisma.sql`r."reviewStatus"::text = ${String(query.reviewStatus)}`);
    const whereSql = Prisma.join(conds, ' AND ');

    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT r."id" FROM data_records r WHERE ${whereSql}
         ORDER BY r."flaggedAsUnderdeclared" DESC, r."createdAt" DESC
         LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM data_records r WHERE ${whereSql}`),
    ]);
    const total = Number(countRows[0]?.count ?? 0);
    const pageIds = idRows.map((r) => r.id);

    const found = pageIds.length
      ? await this.prisma.dataRecord.findMany({
          where: { id: { in: pageIds } },
          include: {
            provider: { select: { id: true, name: true, providerType: true } },
            taxpayer: { select: { id: true, ninEnc: true, tinEnc: true, cacRcNumber: true, businessName: true, firstName: true, lastName: true } },
            reviewedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : [];
    const byId = new Map(found.map((r) => [r.id, r]));
    const records = pageIds.map((id) => byId.get(id)).filter((r): r is (typeof found)[number] => !!r);
    const clear = await this.pii.canRevealPii();
    return { records: records.map((r) => this.decryptRecord(r, clear)), total, page, limit };
  }

  async findOne(id: string) {
    const record = await this.prisma.dataRecord.findUnique({
      where: { id },
      include: {
        provider: true,
        taxpayer: true,
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        submission: { select: { id: true, periodLabel: true, fileName: true, receivedAt: true } },
      },
    });
    if (!record) throw new NotFoundException('Record not found');
    return this.decryptRecord(record, await this.pii.canRevealPii());
  }

  async review(id: string, dto: { reviewStatus: 'CLEARED' | 'CONFIRMED'; reviewNotes?: string }, staffId: string) {
    if (!['CLEARED', 'CONFIRMED'].includes(dto.reviewStatus)) {
      throw new BadRequestException('Invalid reviewStatus');
    }
    const record = await this.prisma.dataRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Record not found');
    if (!record.flaggedAsUnderdeclared) throw new BadRequestException('Record is not flagged');

    const updated = await this.prisma.dataRecord.update({
      where: { id },
      data: {
        reviewStatus: dto.reviewStatus as any,
        reviewedById: staffId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
        // If confirmed, keep flagged. If cleared, unflag.
        flaggedAsUnderdeclared: dto.reviewStatus === 'CONFIRMED',
      },
    });

    if (dto.reviewStatus === 'CONFIRMED' && record.taxpayerId) {
      const tp = await this.prisma.taxpayer.findUnique({
        where: { id: record.taxpayerId },
        select: { riskScore: true },
      });
      if (tp) {
        const newScore = Math.max(0, (tp.riskScore || 100) - 15);
        const riskLevel =
          newScore >= 70 ? 'LOW' :
          newScore >= 40 ? 'MEDIUM' :
          newScore >= 20 ? 'HIGH' : 'CRITICAL';
        await this.prisma.taxpayer.update({
          where: { id: record.taxpayerId },
          data: { riskScore: newScore, riskLevel: riskLevel as any, riskComputedAt: new Date() },
        });
      }
    }

    await this.audit.log({
      actorType: 'STAFF',
      actorId: staffId,
      staffId,
      action: 'REVIEW_DATA_RECORD',
      entity: 'DataRecord',
      entityId: id,
      afterJson: { reviewStatus: dto.reviewStatus, notes: dto.reviewNotes },
    });

    return updated;
  }

  async stats() {
    // Reportable-taxpayer records only (statutory threshold). Exclude ₦0
    // account-opening records so counts reflect real transactions.
    // Reportable set as a single `= ANY($1::text[])` array bind (see findAll for
    // why Prisma `in` can't be used at scale — P2029). Counts run in SQL.
    const ids = [...(await this.reportable.reportableTaxpayerIds())];
    const base = Prisma.sql`r."taxpayerId" = ANY(${ids}::text[]) AND (r.payload->>'recordKind') IS DISTINCT FROM 'ACCOUNT_OPENED'`;
    // The review cards (pending/confirmed/cleared) count FLAGGED records only —
    // the flagged page lists {flagged:true, reviewStatus:...}, so the card must
    // match its own list. Counting every PENDING_REVIEW record (incl. unflagged
    // ingest defaults) made the "Pending review" card read ~369k against a
    // ~78k flagged list — a card contradicting the list beneath it.
    const flaggedSql = Prisma.sql`${base} AND r."flaggedAsUnderdeclared" = true`;
    const cnt = async (w: Prisma.Sql) =>
      Number((await this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM data_records r WHERE ${w}`,
      ))[0]?.count ?? 0);
    const [total, flagged, pendingReview, confirmed, cleared] = await Promise.all([
      cnt(base),
      cnt(flaggedSql),
      cnt(Prisma.sql`${flaggedSql} AND r."reviewStatus"::text = 'PENDING_REVIEW'`),
      cnt(Prisma.sql`${flaggedSql} AND r."reviewStatus"::text = 'CONFIRMED'`),
      cnt(Prisma.sql`${flaggedSql} AND r."reviewStatus"::text = 'CLEARED'`),
    ]);
    return { total, flagged, pendingReview, confirmed, cleared };
  }
}
