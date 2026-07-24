import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import { StatutoryService } from '../statutory/statutory.service';
import { ReportableService } from '../../common/services/reportable.service';
import {
  ENGINE_VERSION,
  normalizeInflow,
  estimateAdditionalTax,
  isLlcName,
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
    private statutory: StatutoryService,
    private reportable: ReportableService,
  ) {}

  async create(dto: { year: number; threshold?: number; providerTypes?: string[] }, staffId: string) {
    if (!dto.year) throw new Error('year required');
    // Default the flagging threshold from the active statutory config when the
    // caller doesn't specify one.
    const threshold = dto.threshold ?? (await this.statutory.active()).defaultScanThreshold;
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
      // Scope to reportable taxpayers FIRST, then load only their records. The
      // data_records table has millions of rows; loading all of them to aggregate
      // in-memory OOMs at scale. Only reportable parties can be flagged anyway, so
      // restricting the read to reportable taxpayer ids is both correct and bounded.
      // (Account-opening rows carry ₦0 and never affect the sums.)
      const reportableIds = await this.reportable.reportableTaxpayerIds({ year });
      // whereRecord is used ONLY for the per-taxpayer updateMany below (which adds a
      // specific taxpayerId, so it never ships a large IN list). Keep it minimal.
      const whereRecord: Prisma.DataRecordWhereInput = {
        periodYear: year,
        taxpayerId: { not: null },
        ...(providerTypes?.length ? { providerType: { in: providerTypes as any[] } } : {}),
      };

      // Aggregate per taxpayer IN THE DATABASE — never load every reportable row into
      // memory (that OOMs at scale), and pass the reportable set as a single
      // `= ANY($2::text[])` array bind, NOT a Prisma `in` list (which expands to one
      // parameter per id and trips Postgres' ~32k bind cap / P2029 once the reportable
      // population is large, e.g. after a bulk provider upload).
      const reportableArr = [...reportableIds];
      const provClause = providerTypes?.length ? `AND "providerType" = ANY($3::text[])` : '';
      const aggRows = reportableArr.length === 0 ? [] : await this.prisma.$queryRawUnsafe<Array<{
        taxpayerId: string; inflow: string; outflow: string; providers: bigint; avgconf: string | null;
      }>>(
        `SELECT "taxpayerId",
                COALESCE(SUM("totalInflow"), 0)  AS inflow,
                COALESCE(SUM("totalOutflow"), 0) AS outflow,
                COUNT(DISTINCT "providerId")     AS providers,
                AVG("matchConfidence")           AS avgconf
           FROM data_records
          WHERE "periodYear" = $1 AND "taxpayerId" = ANY($2::text[]) ${provClause}
          GROUP BY "taxpayerId"`,
        ...(providerTypes?.length ? [year, reportableArr, providerTypes] : [year, reportableArr]),
      );

      type Agg = { inflow: number; outflow: number; providerCount: number; avgConf: number | null };
      const byTaxpayer = new Map<string, Agg>();
      for (const r of aggRows) {
        byTaxpayer.set(r.taxpayerId, {
          inflow: Number(r.inflow),
          outflow: Number(r.outflow),
          providerCount: Number(r.providers),
          avgConf: r.avgconf != null ? Number(r.avgconf) : null,
        });
      }

      let totalFlagged = 0;
      let totalEstimatedTax = 0;

      // STATUTORY REPORTING THRESHOLD — reportableIds was already computed above
      // (and used to bound the record read). Only these taxpayers may be flagged.

      // Per-sector threshold overrides from the analyst feedback loop (fairness-gated).
      const sectorOverrides = new Map(
        (await this.prisma.sectorThreshold.findMany()).map((o) => [o.sector, Number(o.threshold)]),
      );

      // Active statutory config — supplies the configurable flat comparison rate
      // (seeded from citRate) that the graduated NTA estimate is checked against.
      const cfg = await this.statutory.active();

      for (const [taxpayerId, agg] of byTaxpayer) {
        if (!reportableIds.has(taxpayerId)) continue; // below statutory reporting threshold
        const taxpayer = await this.prisma.taxpayer.findUnique({
          where: { id: taxpayerId },
          select: { type: true, sector: true, businessName: true, isLimitedLiability: true },
        });
        if (!taxpayer) continue;

        // Limited-liability companies (LTD/Limited/PLC) are not income-assessed by
        // a State IRS — CIT is federal. Trust a stored/staff-set flag first, else
        // fall back to the business-name suffix. Such parties raise NO income case;
        // they are pursued on the PAYE/remittance track (Tax Net), so we skip them
        // here entirely (no estimate, no case) rather than assert a naira figure.
        const isLlc = taxpayer.isLimitedLiability || isLlcName(taxpayer.businessName);
        if (isLlc) continue;

        // A per-sector override (if any) wins over the scan's global threshold.
        const effectiveThreshold = (taxpayer.sector && sectorOverrides.get(taxpayer.sector)) ?? threshold;

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
        const shouldFlag = discrepancy > 0 && discrepancyPct > effectiveThreshold;

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
        const avgMatchConfidence = agg.avgConf ?? 0.5;
        const { confidence, reasons } = scoreCase({
          discrepancyPct,
          providerCount: agg.providerCount,
          avgMatchConfidence,
          passThroughDiscount,
          hasDeclaration,
        });
        // Graduated Nigeria Tax Act estimate + flat-rate comparison (CIT-seeded).
        // LLCs were already skipped above, so this always assesses here.
        const estimate = estimateAdditionalTax({
          taxpayerType: taxpayer.type as any,
          declaredIncome: declaredAmount,
          observedIncome,
          isLimitedLiability: false,
          flatRate: cfg.citRate,
        });
        const estimatedTaxDue = estimate.tax;

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
          taxBasis: estimate.basis,
          altTaxRate: estimate.flatRate != null ? new Prisma.Decimal(estimate.flatRate.toFixed(4)) : null,
          altTaxDue: estimate.flatTax != null ? new Prisma.Decimal(estimate.flatTax.toFixed(2)) : null,
          confidence: new Prisma.Decimal(confidence.toFixed(2)),
          reasons: reasons as any,
          providerCount: agg.providerCount,
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
