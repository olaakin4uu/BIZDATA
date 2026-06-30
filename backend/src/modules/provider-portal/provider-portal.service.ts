import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';

@Injectable()
export class ProviderPortalService {
  constructor(private prisma: PrismaService, private crypto: CryptoService) {}

  async me(id: string) {
    const user = await this.prisma.dataProviderUser.findUnique({
      where: { id },
      include: { provider: true },
    });
    if (!user) throw new NotFoundException();
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async dashboard(providerId: string) {
    const [submissions, records, accepted, flagged] = await Promise.all([
      this.prisma.dataSubmission.count({ where: { providerId } }),
      this.prisma.dataRecord.count({ where: { providerId } }),
      this.prisma.dataSubmission.count({ where: { providerId, status: 'ACCEPTED' } }),
      this.prisma.dataRecord.count({ where: { providerId, flaggedAsUnderdeclared: true } }),
    ]);

    const recentSubmissions = await this.prisma.dataSubmission.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      stats: { submissions, records, accepted, flagged },
      recentSubmissions,
    };
  }

  async listSubmissions(providerId: string, query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const where = { providerId, ...(query.status ? { status: query.status } : {}) };
    const [submissions, total] = await Promise.all([
      this.prisma.dataSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dataSubmission.count({ where }),
    ]);
    return { submissions, total, page, limit };
  }

  async getSubmission(providerId: string, id: string) {
    const submission = await this.prisma.dataSubmission.findFirst({
      where: { id, providerId },
      include: {
        records: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, accountNumber: true, bvn: true, accountName: true,
            periodLabel: true, totalInflow: true, flaggedAsUnderdeclared: true,
          },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    return {
      ...submission,
      records: submission.records.map((r) => ({
        ...r,
        accountNumber: this.crypto.decrypt(r.accountNumber),
        bvn: this.crypto.decrypt(r.bvn),
      })),
    };
  }
}
