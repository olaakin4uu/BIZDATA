import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import {
  ENGINE_VERSION,
  normalizeInflow,
  estimateAdditionalTax,
  scoreCase,
  confidenceToRisk,
} from './detection-engine';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private portfolios: PortfoliosService,
  ) {}

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
    this.logger.log(`Starting scan ${scanId} (engine ${ENGINE_VERSION}) for year ${year} threshold ${threshold}`);
    try {
      const whereRecord: Prisma.DataRecordWhereInput = {
        periodYear: year,
        taxpayerId: { not: null },
        ...(providerTypes?.length ? { providerType: { in: providerTypes as any[] } } : {}),
      };

      // Pull the matching records once and aggregate per taxpayer in-memory.
      // NOTE: for very large datasets this should be streamed/batched; demo-scale
      // volumes make a single read acceptable and keep the scoring logic readable.
      const records = await this.prisma.dataRecord.findMany({
        where: whereRecord,
        select: {
          taxpayerId: true,
          providerId: true,
          totalInflow: true,
          totalOutflow: true,
          matchConfidence: true,
        },
      });

      type Agg = {
        inflow: number;
        outflow: number;
        providers: Set<string>;
        matchConfs: number[];
      };
      const byTaxpayer = new Map<string, Agg>();
      for (const r of records) {
        if (!r.taxpayerId) continue;
        const a =
          byTaxpayer.get(r.taxpayerId) ??
          { inflow: 0, outflow: 0, providers: new Set<string>(), matchConfs: [] };
        a.inflow += Number(r.totalInflow ?? 0);
        a.outflow += Number(r.totalOutflow ?? 0);
        a.providers.add(r.providerId);
        if (r.matchConfidence != null) a.matchConfs.push(Number(r.matchConfidence));
        byTaxpayer.set(r.taxpayerId, a);
      }

      let totalFlagged = 0;
      let totalEstimatedTax = 0;

      for (const [taxpayerId, agg] of byTaxpayer) {
        const taxpayer = await this.prisma.taxpayer.findUnique({
          where: { id: taxpayerId },
          select: { type: true },
        });
        if (!taxpayer) continue;

        const declaredRow = await this.prisma.declaredIncome.findUnique({
          where: { taxpayerId_year: { taxpayerId, year } },
          select: { assessableIncome: true },
        });
        const declaredAmount = declaredRow ? Number(declaredRow.assessableIncome ?? 0) : 0;
        const hasDeclaration = declaredRow != null;

        // 1. Normalize gross inflow → income proxy (conservative)
        const { observedIncome, passThroughDiscount } = normalizeInflow(agg.inflow, agg.outflow);

        const discrepancy = observedIncome - declaredAmount;
        const discrepancyPct =
          declaredAmount > 0 ? discrepancy / declaredAmount : observedIncome > 0 ? 1 : 0;
        const shouldFlag = discrepancy > 0 && discrepancyPct > threshold;

        // 2. Stamp per-record flag fields (drives the records / flagged views).
        //    Spread whereRecord FIRST so the specific taxpayerId below wins — otherwise
        //    whereRecord's `taxpayerId: { not: null }` clobbers it and the update hits
        //    every taxpayer's records, stamping one aggregate onto all of them.
        await this.prisma.dataRecord.updateMany({
          where: { ...whereRecord, taxpayerId },
          data: {
            flaggedAsUnderdeclared: shouldFlag,
            declaredIncome: new Prisma.Decimal(declaredAmount),
            discrepancyAmount: new Prisma.Decimal(Math.max(0, discrepancy)),
            discrepancyPct: new Prisma.Decimal(Math.max(0, discrepancyPct).toFixed(4)),
            flaggedAt: shouldFlag ? new Date() : null,
            reviewStatus: shouldFlag ? 'PENDING_REVIEW' : null,
          },
        });

        if (!shouldFlag) continue;

        // 3. Score + explain + estimate recoverable tax
        const avgMatchConfidence =
          agg.matchConfs.length > 0
            ? agg.matchConfs.reduce((s, v) => s + v, 0) / agg.matchConfs.length
            : 0.5;
        const { confidence, reasons } = scoreCase({
          discrepancyPct,
          providerCount: agg.providers.size,
          avgMatchConfidence,
          passThroughDiscount,
          hasDeclaration,
        });
        const estimatedTaxDue = estimateAdditionalTax({
          taxpayerType: taxpayer.type as any,
          declaredIncome: declaredAmount,
          observedIncome,
        });

        totalFlagged++;
        totalEstimatedTax += estimatedTaxDue;

        // 4. Upsert the case (preserve a human-progressed lifecycle status)
        const existing = await this.prisma.underdeclarationCase.findUnique({
          where: { taxpayerId_year: { taxpayerId, year } },
          select: { status: true },
        });
        const caseData = {
          scanId,
          observedIncome: new Prisma.Decimal(observedIncome.toFixed(2)),
          declaredIncome: new Prisma.Decimal(declaredAmount.toFixed(2)),
          discrepancyAmount: new Prisma.Decimal(Math.max(0, discrepancy).toFixed(2)),
          discrepancyPct: new Prisma.Decimal(Math.max(0, discrepancyPct).toFixed(4)),
          estimatedTaxDue: new Prisma.Decimal(estimatedTaxDue.toFixed(2)),
          confidence: new Prisma.Decimal(confidence.toFixed(2)),
          reasons: reasons as any,
          providerCount: agg.providers.size,
          engineVersion: ENGINE_VERSION,
          riskLevel: confidenceToRisk(confidence) as any,
        };
        const existingCase = await this.prisma.underdeclarationCase.findUnique({
          where: { taxpayerId_year: { taxpayerId, year } },
          select: { id: true, assignedToId: true },
        });

        // Auto-route to the owning analyst (provider > type > sector). Only assign
        // if the case is new or currently unassigned — never override a manual one.
        let assignedToId = existingCase?.assignedToId ?? null;
        let newlyAssignedTo: string | null = null;
        if (!assignedToId) {
          const owner = await this.portfolios.resolveOwner(taxpayerId);
          if (owner) { assignedToId = owner; newlyAssignedTo = owner; }
        }

        const savedCase = await this.prisma.underdeclarationCase.upsert({
          where: { taxpayerId_year: { taxpayerId, year } },
          // Keep the existing status if an officer has already moved it past OPEN
          update: { ...caseData, ...(assignedToId ? { assignedToId } : {}) },
          create: { taxpayerId, year, status: 'OPEN', assignedToId, ...caseData },
        });

        // Notify the analyst a case landed in their portfolio.
        if (newlyAssignedTo) {
          const tp = await this.prisma.taxpayer.findUnique({
            where: { id: taxpayerId },
            select: { businessName: true, firstName: true, lastName: true },
          });
          const name = tp?.businessName || [tp?.firstName, tp?.lastName].filter(Boolean).join(' ') || 'A taxpayer';
          await this.prisma.notification.create({
            data: {
              type: 'CASE_ASSIGNED',
              severity: confidence >= 0.7 ? 'CRITICAL' : 'WARNING',
              title: `New case assigned: ${name}`,
              message: `${name} was flagged (est. tax ₦${Math.round(estimatedTaxDue).toLocaleString()}) and routed to your portfolio.`,
              entity: 'UnderdeclarationCase',
              entityId: savedCase.id,
              targetUserId: newlyAssignedTo,
            },
          }).catch(() => { /* non-fatal */ });
        }

        // 5. Update taxpayer risk from the case confidence
        const newScore = Math.max(0, Math.round(100 - confidence * 80));
        await this.prisma.taxpayer.update({
          where: { id: taxpayerId },
          data: {
            riskScore: newScore,
            riskLevel: confidenceToRisk(confidence) as any,
            riskComputedAt: new Date(),
          },
        });
        void existing; // status preservation handled at the case-update layer (track 3)
      }

      await this.prisma.underdeclarationScan.update({
        where: { id: scanId },
        data: {
          totalScanned: byTaxpayer.size,
          totalFlagged,
          totalEstimatedTax: new Prisma.Decimal(totalEstimatedTax.toFixed(2)),
          engineVersion: ENGINE_VERSION,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `Scan ${scanId} complete — scanned: ${byTaxpayer.size}, flagged: ${totalFlagged}, est. tax: ₦${totalEstimatedTax.toFixed(0)}`,
      );
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
