import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class DataRecordsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const where: Prisma.DataRecordWhereInput = {
      ...(query.providerId ? { providerId: query.providerId } : {}),
      ...(query.providerType ? { providerType: query.providerType } : {}),
      ...(query.periodYear ? { periodYear: parseInt(query.periodYear, 10) } : {}),
      ...(query.taxpayerId ? { taxpayerId: query.taxpayerId } : {}),
      ...(query.flagged === 'true' ? { flaggedAsUnderdeclared: true } : {}),
      ...(query.flagged === 'false' ? { flaggedAsUnderdeclared: false } : {}),
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.dataRecord.findMany({
        where,
        include: {
          provider: { select: { id: true, name: true, providerType: true } },
          taxpayer: { select: { id: true, nin: true, cacRcNumber: true, businessName: true, firstName: true, lastName: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ flaggedAsUnderdeclared: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dataRecord.count({ where }),
    ]);
    return { records, total, page, limit };
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
    return record;
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
    const [total, flagged, pendingReview, confirmed, cleared] = await Promise.all([
      this.prisma.dataRecord.count(),
      this.prisma.dataRecord.count({ where: { flaggedAsUnderdeclared: true } }),
      this.prisma.dataRecord.count({ where: { reviewStatus: 'PENDING_REVIEW' } }),
      this.prisma.dataRecord.count({ where: { reviewStatus: 'CONFIRMED' } }),
      this.prisma.dataRecord.count({ where: { reviewStatus: 'CLEARED' } }),
    ]);
    return { total, flagged, pendingReview, confirmed, cleared };
  }
}
