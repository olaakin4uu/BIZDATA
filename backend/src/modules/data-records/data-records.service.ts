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
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    // STATUTORY REPORTING THRESHOLD — records only surface for taxpayers whose
    // aggregated quarterly inflow (summed across ALL their records, however many
    // transactions the provider submitted) meets their type threshold.
    const reportableIds = await this.reportable.reportableTaxpayerIds(
      query.periodYear ? { year: parseInt(query.periodYear, 10) } : {},
    );
    const where: Prisma.DataRecordWhereInput = {
      ...(query.providerId ? { providerId: query.providerId } : {}),
      ...(query.providerType ? { providerType: query.providerType } : {}),
      ...(query.periodYear ? { periodYear: parseInt(query.periodYear, 10) } : {}),
      ...(query.taxpayerId ? { taxpayerId: query.taxpayerId } : { taxpayerId: { in: [...reportableIds] } }),
      ...(query.flagged === 'true' ? { flaggedAsUnderdeclared: true } : {}),
      ...(query.flagged === 'false' ? { flaggedAsUnderdeclared: false } : {}),
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.dataRecord.findMany({
        where,
        include: {
          provider: { select: { id: true, name: true, providerType: true } },
          taxpayer: { select: { id: true, ninEnc: true, tinEnc: true, cacRcNumber: true, businessName: true, firstName: true, lastName: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ flaggedAsUnderdeclared: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dataRecord.count({ where }),
    ]);
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
    // Reportable-taxpayer records only (statutory threshold).
    const ids = [...(await this.reportable.reportableTaxpayerIds())];
    const tp = { taxpayerId: { in: ids } } as Prisma.DataRecordWhereInput;
    const [total, flagged, pendingReview, confirmed, cleared] = await Promise.all([
      this.prisma.dataRecord.count({ where: tp }),
      this.prisma.dataRecord.count({ where: { ...tp, flaggedAsUnderdeclared: true } }),
      this.prisma.dataRecord.count({ where: { ...tp, reviewStatus: 'PENDING_REVIEW' } }),
      this.prisma.dataRecord.count({ where: { ...tp, reviewStatus: 'CONFIRMED' } }),
      this.prisma.dataRecord.count({ where: { ...tp, reviewStatus: 'CLEARED' } }),
    ]);
    return { total, flagged, pendingReview, confirmed, cleared };
  }
}
