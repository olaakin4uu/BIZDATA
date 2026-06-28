import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async create(dto: { year: number; threshold?: number; providerTypes?: string[] }, staffId: string) {
    if (!dto.year) throw new Error('year required');
    const threshold = dto.threshold ?? 0.20;
    const scan = await this.prisma.underdeclarationScan.create({
      data: {
        year: dto.year,
        threshold: new Prisma.Decimal(threshold),
        providerTypes: dto.providerTypes ? (dto.providerTypes as any) : Prisma.DbNull,
        startedById: staffId,
        status: 'RUNNING',
      },
    });

    await this.audit.log({
      actorType: 'STAFF',
      actorId: staffId,
      staffId,
      action: 'CREATE_SCAN',
      entity: 'UnderdeclarationScan',
      entityId: scan.id,
      afterJson: { year: dto.year, threshold },
    });

    // Run async
    setImmediate(() => this.runScan(scan.id, dto.year, threshold, dto.providerTypes).catch(err => {
      this.logger.error(`Scan ${scan.id} failed: ${err.message}`);
    }));

    return scan;
  }

  async runScan(scanId: string, year: number, threshold: number, providerTypes?: string[]) {
    this.logger.log(`Starting scan ${scanId} for year ${year} threshold ${threshold}`);
    try {
      const whereRecord: Prisma.DataRecordWhereInput = {
        periodYear: year,
        taxpayerId: { not: null },
        ...(providerTypes?.length ? { providerType: { in: providerTypes as any[] } } : {}),
      };

      // Aggregate per taxpayer
      const aggregated = await this.prisma.dataRecord.groupBy({
        by: ['taxpayerId'],
        where: whereRecord,
        _sum: { totalInflow: true },
      });

      let totalFlagged = 0;
      const flaggedTaxpayers: string[] = [];

      for (const row of aggregated) {
        if (!row.taxpayerId) continue;
        const totalInflow = Number(row._sum.totalInflow ?? 0);

        const declared = await this.prisma.declaredIncome.findUnique({
          where: { taxpayerId_year: { taxpayerId: row.taxpayerId, year } },
          select: { assessableIncome: true },
        });
        const declaredAmount = declared ? Number(declared.assessableIncome ?? 0) : 0;
        const discrepancy = totalInflow - declaredAmount;
        const discrepancyPct = declaredAmount > 0 ? discrepancy / declaredAmount : (totalInflow > 0 ? 1 : 0);
        const shouldFlag = discrepancy > 0 && discrepancyPct > threshold;

        await this.prisma.dataRecord.updateMany({
          where: { taxpayerId: row.taxpayerId, ...whereRecord },
          data: {
            flaggedAsUnderdeclared: shouldFlag,
            declaredIncome: new Prisma.Decimal(declaredAmount),
            discrepancyAmount: new Prisma.Decimal(Math.max(0, discrepancy)),
            discrepancyPct: new Prisma.Decimal(Math.max(0, discrepancyPct).toFixed(4)),
            flaggedAt: shouldFlag ? new Date() : null,
            reviewStatus: shouldFlag ? 'PENDING_REVIEW' : null,
          },
        });

        if (shouldFlag) {
          totalFlagged++;
          flaggedTaxpayers.push(row.taxpayerId);
        }
      }

      // Bump risk on flagged taxpayers
      for (const tpId of flaggedTaxpayers) {
        const tp = await this.prisma.taxpayer.findUnique({ where: { id: tpId }, select: { riskScore: true } });
        if (!tp) continue;
        const flagCount = await this.prisma.dataRecord.count({
          where: { taxpayerId: tpId, flaggedAsUnderdeclared: true },
        });
        const drop = Math.min(60, flagCount * 10);
        const newScore = Math.max(0, 100 - drop);
        const riskLevel =
          newScore >= 70 ? 'LOW' :
          newScore >= 40 ? 'MEDIUM' :
          newScore >= 20 ? 'HIGH' : 'CRITICAL';
        await this.prisma.taxpayer.update({
          where: { id: tpId },
          data: { riskScore: newScore, riskLevel: riskLevel as any, riskComputedAt: new Date() },
        });
      }

      await this.prisma.underdeclarationScan.update({
        where: { id: scanId },
        data: {
          totalScanned: aggregated.length,
          totalFlagged,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      this.logger.log(`Scan ${scanId} complete — scanned: ${aggregated.length}, flagged: ${totalFlagged}`);
    } catch (err: any) {
      await this.prisma.underdeclarationScan.update({
        where: { id: scanId },
        data: { status: 'FAILED', errorMessage: err.message, completedAt: new Date() },
      });
      throw err;
    }
  }

  async findAll(query: any) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10)));
    const where: Prisma.UnderdeclarationScanWhereInput = {
      ...(query.year ? { year: parseInt(query.year, 10) } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [scans, total] = await Promise.all([
      this.prisma.underdeclarationScan.findMany({
        where,
        include: { startedBy: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.underdeclarationScan.count({ where }),
    ]);
    return { scans, total, page, limit };
  }

  async findOne(id: string) {
    const scan = await this.prisma.underdeclarationScan.findUnique({
      where: { id },
      include: { startedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    return scan;
  }
}
