import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import {
  DEFAULT_SCHEMAS,
  parseCsvText,
  validateRow,
  parsePeriod,
  toDecimal,
  toInt,
  extractBvn,
  SchemaTemplate,
} from './submission-parser';

@Injectable()
export class SubmissionsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /**
   * Upload + parse a submission file.
   * Used by both staff (uploadedByStaff) and provider portal.
   */
  async upload(opts: {
    providerId: string;
    fileName: string;
    fileBuffer: Buffer;
    periodLabel: string;
    periodYear?: number;
    periodQuarter?: number;
    periodMonth?: number;
    submittedByStaffId?: string;
    submittedByUserId?: string;
  }) {
    const provider = await this.prisma.dataProvider.findUnique({ where: { id: opts.providerId } });
    if (!provider) throw new NotFoundException('Provider not found');

    const periodInfo = parsePeriod(opts.periodLabel);
    if (!periodInfo) throw new BadRequestException('Invalid periodLabel — use YYYY, YYYY-Qn, or YYYY-MM');

    const submission = await this.prisma.dataSubmission.create({
      data: {
        providerId: opts.providerId,
        submittedByStaffId: opts.submittedByStaffId,
        submittedByUserId: opts.submittedByUserId,
        periodLabel: opts.periodLabel,
        periodYear: opts.periodYear ?? periodInfo.year,
        periodQuarter: opts.periodQuarter ?? periodInfo.quarter ?? null,
        periodMonth: opts.periodMonth ?? periodInfo.month ?? null,
        fileName: opts.fileName,
        fileSizeBytes: opts.fileBuffer.length,
        status: 'VALIDATING',
      },
    });

    try {
      const result = await this.processFile(submission.id, opts.fileBuffer, provider.providerType, provider.id);
      await this.audit.log({
        actorType: opts.submittedByStaffId ? 'STAFF' : 'PROVIDER_USER',
        actorId: opts.submittedByStaffId || opts.submittedByUserId,
        staffId: opts.submittedByStaffId,
        action: 'UPLOAD_SUBMISSION',
        entity: 'DataSubmission',
        entityId: submission.id,
        afterJson: { records: result.recordCount, accepted: result.acceptedCount, rejected: result.rejectedCount },
      });
      return this.findOne(submission.id);
    } catch (err: any) {
      await this.prisma.dataSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'REJECTED',
          validationErrors: { fatal: err.message },
          processedAt: new Date(),
        },
      });
      throw err;
    }
  }

  private async processFile(submissionId: string, buffer: Buffer, providerType: string, providerId: string) {
    const csvText = buffer.toString('utf8');
    const { headers, rows } = parseCsvText(csvText);
    if (rows.length === 0) {
      throw new BadRequestException('No data rows in file');
    }

    // Pick schema: stored ProviderSchema for this type if present, else default
    const stored = await this.prisma.providerSchema.findUnique({ where: { providerType: providerType as any } });
    const schema: SchemaTemplate = stored
      ? { providerType, columns: (stored.columns as any) || DEFAULT_SCHEMAS[providerType].columns }
      : DEFAULT_SCHEMAS[providerType] || DEFAULT_SCHEMAS.OTHER;

    let accepted = 0, rejected = 0;
    const errors: { row: number; messages: string[] }[] = [];
    const recordCreates: Prisma.DataRecordCreateManyInput[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { ok, errors: errs } = validateRow(row, schema);
      if (!ok) {
        rejected++;
        if (errors.length < 100) errors.push({ row: i + 2, messages: errs });
        continue;
      }

      const periodInfo = parsePeriod(row.periodLabel);
      if (!periodInfo) {
        rejected++;
        if (errors.length < 100) errors.push({ row: i + 2, messages: ['Invalid periodLabel'] });
        continue;
      }

      // Taxpayer matching
      const bvn = extractBvn(row.bvn);
      const nin = row.nin || null;
      let taxpayerId: string | null = null;

      if (bvn) {
        const byBvn = await this.prisma.dataRecord.findFirst({
          where: { bvn, taxpayerId: { not: null } },
          select: { taxpayerId: true },
        });
        if (byBvn?.taxpayerId) taxpayerId = byBvn.taxpayerId;
      }
      if (!taxpayerId && nin) {
        const t = await this.prisma.taxpayer.findUnique({ where: { nin }, select: { id: true } });
        if (t) taxpayerId = t.id;
      }
      if (!taxpayerId && row.accountName) {
        // Loose match: businessName or "firstName lastName" exact case-insensitive
        const name = row.accountName.trim();
        const t = await this.prisma.taxpayer.findFirst({
          where: {
            OR: [
              { businessName: { equals: name, mode: 'insensitive' as any } },
            ],
          },
          select: { id: true },
        });
        if (t) taxpayerId = t.id;
      }

      // payload assembly (provider-specific)
      const payload: any = {};
      if (providerType === 'TELCO') {
        if (row.airtimeSpend) payload.airtimeSpend = Number(row.airtimeSpend);
        if (row.dataSpend) payload.dataSpend = Number(row.dataSpend);
      }
      if (providerType === 'BANK') {
        if (row.bankCode) payload.bankCode = row.bankCode;
        if (row.bankName) payload.bankName = row.bankName;
      }

      recordCreates.push({
        submissionId,
        providerId,
        providerType: providerType as any,
        taxpayerId,
        accountNumber: row.accountNumber || null,
        bvn,
        nin,
        phoneNumber: row.phoneNumber || null,
        walletId: row.walletId || null,
        merchantId: row.merchantId || null,
        accountName: row.accountName || null,
        periodLabel: row.periodLabel,
        periodYear: periodInfo.year,
        totalInflow: toDecimal(row.totalInflow),
        totalOutflow: toDecimal(row.totalOutflow),
        openingBalance: toDecimal(row.openingBalance),
        closingBalance: toDecimal(row.closingBalance),
        transactionCount: toInt(row.transactionCount),
        payload: Object.keys(payload).length ? payload : Prisma.DbNull,
        reviewStatus: null,
      });
      accepted++;
    }

    if (recordCreates.length > 0) {
      // Insert in batches of 500
      const BATCH = 500;
      for (let i = 0; i < recordCreates.length; i += BATCH) {
        await this.prisma.dataRecord.createMany({ data: recordCreates.slice(i, i + BATCH) });
      }
    }

    const status =
      rejected === 0 && accepted > 0 ? 'ACCEPTED' :
      accepted > 0 ? 'PARTIALLY_ACCEPTED' : 'REJECTED';

    await this.prisma.dataSubmission.update({
      where: { id: submissionId },
      data: {
        recordCount: rows.length,
        acceptedCount: accepted,
        rejectedCount: rejected,
        validationErrors: errors.length ? (errors as any) : Prisma.DbNull,
        status: status as any,
        processedAt: new Date(),
      },
    });

    return { recordCount: rows.length, acceptedCount: accepted, rejectedCount: rejected };
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const where: Prisma.DataSubmissionWhereInput = {
      ...(query.providerId ? { providerId: query.providerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.periodYear ? { periodYear: parseInt(query.periodYear, 10) } : {}),
    };
    const [submissions, total] = await Promise.all([
      this.prisma.dataSubmission.findMany({
        where,
        include: {
          provider: { select: { id: true, name: true, providerType: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dataSubmission.count({ where }),
    ]);
    return { submissions, total, page, limit };
  }

  async findOne(id: string) {
    const submission = await this.prisma.dataSubmission.findUnique({
      where: { id },
      include: {
        provider: { select: { id: true, name: true, providerType: true } },
        submittedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        records: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: { taxpayer: { select: { id: true, nin: true, businessName: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    return submission;
  }

  async reprocess(id: string) {
    const sub = await this.prisma.dataSubmission.findUnique({ where: { id }, include: { provider: true } });
    if (!sub) throw new NotFoundException('Submission not found');
    // For MVP — just re-run taxpayer matching on existing records (no file re-read)
    const records = await this.prisma.dataRecord.findMany({ where: { submissionId: id, taxpayerId: null } });
    let matched = 0;
    for (const r of records) {
      let taxpayerId: string | null = null;
      if (r.nin) {
        const t = await this.prisma.taxpayer.findUnique({ where: { nin: r.nin }, select: { id: true } });
        if (t) taxpayerId = t.id;
      }
      if (!taxpayerId && r.accountName) {
        const t = await this.prisma.taxpayer.findFirst({
          where: { businessName: { equals: r.accountName, mode: 'insensitive' as any } },
          select: { id: true },
        });
        if (t) taxpayerId = t.id;
      }
      if (taxpayerId) {
        await this.prisma.dataRecord.update({ where: { id: r.id }, data: { taxpayerId } });
        matched++;
      }
    }
    return { reprocessed: records.length, matched };
  }
}
