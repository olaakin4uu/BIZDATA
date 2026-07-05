import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CryptoService } from '../../common/services/crypto.service';

@Injectable()
export class ProvidersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private crypto: CryptoService,
  ) {}

  async create(dto: any, actorId?: string) {
    if (!dto.providerCode || !dto.name || !dto.providerType) {
      throw new BadRequestException('providerCode, name, providerType required');
    }
    const provider = await this.prisma.dataProvider.create({
      data: {
        providerCode: dto.providerCode,
        name: dto.name,
        providerType: dto.providerType,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        address: dto.address,
        reportingFrequency: dto.reportingFrequency || 'QUARTERLY',
        status: dto.status || 'PENDING_ONBOARDING',
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'CREATE_PROVIDER',
      entity: 'DataProvider',
      entityId: provider.id,
      afterJson: { code: provider.providerCode, type: provider.providerType },
    });

    return provider;
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const search = (query.search || '').trim();

    const where: Prisma.DataProviderWhereInput = {
      ...(query.providerType ? { providerType: query.providerType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as any } },
              { providerCode: { contains: search, mode: 'insensitive' as any } },
            ],
          }
        : {}),
    };

    const [providers, total] = await Promise.all([
      this.prisma.dataProvider.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dataProvider.count({ where }),
    ]);

    return { providers, total, page, limit };
  }

  async stats() {
    const [byType, byStatus, total] = await Promise.all([
      this.prisma.dataProvider.groupBy({ by: ['providerType'], _count: { _all: true } }),
      this.prisma.dataProvider.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.dataProvider.count(),
    ]);
    return {
      total,
      byType: byType.map(r => ({ providerType: r.providerType, count: r._count._all })),
      byStatus: byStatus.map(r => ({ status: r.status, count: r._count._all })),
    };
  }

  async findOne(id: string) {
    const provider = await this.prisma.dataProvider.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true } },
        submissions: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  async update(id: string, dto: any, actorId?: string) {
    const before = await this.prisma.dataProvider.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Provider not found');

    const provider = await this.prisma.dataProvider.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        contactEmail: dto.contactEmail ?? undefined,
        contactPhone: dto.contactPhone ?? undefined,
        address: dto.address ?? undefined,
        reportingFrequency: dto.reportingFrequency ?? undefined,
        status: dto.status ?? undefined,
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPDATE_PROVIDER',
      entity: 'DataProvider',
      entityId: id,
    });

    return provider;
  }

  async updateStatus(id: string, status: string, actorId?: string) {
    if (!['ACTIVE', 'SUSPENDED', 'PENDING_ONBOARDING'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    const provider = await this.prisma.dataProvider.update({
      where: { id },
      data: { status: status as any },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId,
      staffId: actorId,
      action: 'UPDATE_PROVIDER_STATUS',
      entity: 'DataProvider',
      entityId: id,
      afterJson: { status },
    });

    return provider;
  }

  /**
   * Upload envelopes (submissions) for a provider — metadata only, no PII.
   * Always visible to authorised staff; the sensitive rows sit behind step-up.
   */
  async listUploads(providerId: string) {
    const provider = await this.prisma.dataProvider.findUnique({
      where: { id: providerId },
      select: { id: true, name: true, providerType: true, providerCode: true },
    });
    if (!provider) throw new NotFoundException('Provider not found');

    const submissions = await this.prisma.dataSubmission.findMany({
      where: { providerId },
      orderBy: [{ periodYear: 'desc' }, { receivedAt: 'desc' }],
      select: {
        id: true, periodLabel: true, periodYear: true, periodQuarter: true,
        fileName: true, fileSizeBytes: true, recordCount: true,
        acceptedCount: true, rejectedCount: true, status: true,
        receiptHash: true, receivedAt: true, processedAt: true,
      },
    });
    return { provider, submissions };
  }

  /**
   * The actual uploaded records for one submission — this is the sensitive PII
   * payload. Requires a valid step-up authorisation (verified in the controller),
   * whose staffId is passed in so the reveal is audited to a real person.
   */
  async getUploadRecords(
    submissionId: string,
    staffId: string,
    opts: { page?: number; limit?: number } = {},
  ) {
    const submission = await this.prisma.dataSubmission.findUnique({
      where: { id: submissionId },
      include: { provider: { select: { id: true, name: true, providerType: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

    const [records, total] = await this.prisma.$transaction([
      this.prisma.dataRecord.findMany({
        where: { submissionId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, accountName: true, accountNumber: true,
          bvn: true, nin: true, phoneNumber: true, periodLabel: true,
          totalInflow: true, totalOutflow: true, transactionCount: true,
          matchMethod: true, flaggedAsUnderdeclared: true,
          taxpayer: { select: { id: true, ninEnc: true, bvnEnc: true, tinEnc: true } },
        },
      }),
      this.prisma.dataRecord.count({ where: { submissionId } }),
    ]);

    // Step-up already authorised the reveal — decrypt the linked taxpayer identifiers.
    const rows = records.map((r) => ({
      id: r.id,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      bvn: r.bvn ?? this.crypto.decrypt(r.taxpayer?.bvnEnc),
      nin: r.nin ?? this.crypto.decrypt(r.taxpayer?.ninEnc),
      tin: this.crypto.decrypt(r.taxpayer?.tinEnc),
      phoneNumber: r.phoneNumber,
      periodLabel: r.periodLabel,
      totalInflow: r.totalInflow,
      totalOutflow: r.totalOutflow,
      transactionCount: r.transactionCount,
      matchMethod: r.matchMethod,
      flagged: r.flaggedAsUnderdeclared,
      taxpayerId: r.taxpayer?.id ?? null,
    }));

    await this.audit.log({
      actorType: 'STAFF',
      actorId: staffId,
      staffId,
      action: 'VIEW_PROVIDER_UPLOAD_RECORDS',
      entity: 'DataSubmission',
      entityId: submissionId,
      afterJson: { providerId: submission.providerId, page, returned: rows.length },
    });

    return {
      submission: {
        id: submission.id, periodLabel: submission.periodLabel,
        fileName: submission.fileName, provider: submission.provider,
        recordCount: submission.recordCount,
      },
      records: rows,
      total, page, limit,
    };
  }

  /** CSV export of ALL records in a submission (step-up authorised; audited). */
  async exportUploadCsv(submissionId: string, staffId: string): Promise<{ filename: string; csv: string }> {
    const submission = await this.prisma.dataSubmission.findUnique({
      where: { id: submissionId },
      include: { provider: { select: { name: true } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const records = await this.prisma.dataRecord.findMany({
      where: { submissionId },
      orderBy: { createdAt: 'asc' },
      select: {
        accountName: true, accountNumber: true, bvn: true, nin: true, phoneNumber: true,
        periodLabel: true, totalInflow: true, totalOutflow: true, transactionCount: true,
        matchMethod: true, flaggedAsUnderdeclared: true,
        taxpayer: { select: { ninEnc: true, bvnEnc: true, tinEnc: true } },
      },
    });

    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Account Name', 'Account Number', 'BVN', 'NIN', 'TIN', 'Phone', 'Period', 'Inflow', 'Outflow', 'Txn Count', 'Match', 'Flagged'];
    const lines = [header.join(',')];
    for (const r of records) {
      lines.push([
        r.accountName, r.accountNumber,
        r.bvn ?? this.crypto.decrypt(r.taxpayer?.bvnEnc),
        r.nin ?? this.crypto.decrypt(r.taxpayer?.ninEnc),
        this.crypto.decrypt(r.taxpayer?.tinEnc),
        r.phoneNumber, r.periodLabel, r.totalInflow, r.totalOutflow,
        r.transactionCount, r.matchMethod, r.flaggedAsUnderdeclared ? 'YES' : '',
      ].map(esc).join(','));
    }

    await this.audit.log({
      actorType: 'STAFF',
      actorId: staffId,
      staffId,
      action: 'EXPORT_PROVIDER_UPLOAD_CSV',
      entity: 'DataSubmission',
      entityId: submissionId,
      afterJson: { providerId: submission.providerId, rows: records.length },
    });

    const safeName = (submission.provider?.name ?? 'provider').replace(/[^a-z0-9]+/gi, '_');
    return { filename: `${safeName}_${submission.periodLabel}.csv`, csv: lines.join('\n') };
  }
}
