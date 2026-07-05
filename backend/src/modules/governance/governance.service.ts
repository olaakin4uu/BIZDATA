import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { AuditService } from '../../common/services/audit.service';

/**
 * Governance reporting + bank MoU onboarding. (Stub — implemented by the
 * feature-fleet workflow.) report(year) should assemble a steering/Minister
 * pack: revenue at risk & recovered, cases by status, agent-signal counts, and
 * a provider-compliance summary. MoU methods manage the §7 onboarding record.
 */
@Injectable()
export class GovernanceService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private audit: AuditService,
  ) {}

  /** PII-encryption key-rotation status (for the DPO / governance view). */
  keyStatus() {
    return this.crypto.rotationStatus();
  }

  /**
   * Complete a key rotation by re-encrypting any PII still stored under an old
   * (or legacy) key so it moves to the active key. Idempotent — rows already on
   * the active key are skipped. Processes in bounded batches to stay memory-flat.
   */
  async reencryptPii(staffId?: string) {
    let migrated = 0, scanned = 0;

    // Taxpayers: ninEnc / bvnEnc / tinEnc.
    const TP_BATCH = 500;
    for (let skip = 0; ; skip += TP_BATCH) {
      const rows = await this.prisma.taxpayer.findMany({
        select: { id: true, ninEnc: true, bvnEnc: true, tinEnc: true },
        orderBy: { id: 'asc' }, skip, take: TP_BATCH,
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        scanned++;
        const patch: Record<string, string | null> = {};
        for (const col of ['ninEnc', 'bvnEnc', 'tinEnc'] as const) {
          if (this.crypto.needsReencrypt(r[col])) patch[col] = this.crypto.reencrypt(r[col]);
        }
        if (Object.keys(patch).length) { await this.prisma.taxpayer.update({ where: { id: r.id }, data: patch }); migrated++; }
      }
      if (rows.length < TP_BATCH) break;
    }

    // Data records: accountNumber / bvn / nin / phoneNumber (all ciphertext).
    const DR_BATCH = 500;
    for (let skip = 0; ; skip += DR_BATCH) {
      const rows = await this.prisma.dataRecord.findMany({
        select: { id: true, accountNumber: true, bvn: true, nin: true, phoneNumber: true },
        orderBy: { id: 'asc' }, skip, take: DR_BATCH,
      });
      if (rows.length === 0) break;
      for (const r of rows) {
        scanned++;
        const patch: Record<string, string | null> = {};
        for (const col of ['accountNumber', 'bvn', 'nin', 'phoneNumber'] as const) {
          if (this.crypto.needsReencrypt(r[col])) patch[col] = this.crypto.reencrypt(r[col]);
        }
        if (Object.keys(patch).length) { await this.prisma.dataRecord.update({ where: { id: r.id }, data: patch }); migrated++; }
      }
      if (rows.length < DR_BATCH) break;
    }

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'PII_KEY_REENCRYPT', entity: 'CryptoKey', entityId: this.crypto.rotationStatus().activeKeyId,
      afterJson: { scanned, migrated },
    });
    return { scanned, migrated, activeKeyId: this.crypto.rotationStatus().activeKeyId };
  }

  async report(year: number): Promise<any> {
    const atRiskStatuses = [
      'OPEN',
      'UNDER_REVIEW',
      'NOTICE_ISSUED',
      'OBJECTION',
      'CONFIRMED',
      'SETTLED',
    ];
    const recoveredStatuses = ['RECOVERED', 'SETTLED'];

    const [
      revenueAtRiskAgg,
      recoveredAgg,
      groupedByStatus,
      totalCases,
      agentSignalCount,
      activeProviders,
      providersWithSubmissions,
      topCasesRaw,
    ] = await Promise.all([
      this.prisma.underdeclarationCase.aggregate({
        where: { year, status: { in: atRiskStatuses as any } },
        _sum: { estimatedTaxDue: true },
      }),
      this.prisma.underdeclarationCase.aggregate({
        where: { year, status: { in: recoveredStatuses as any } },
        _sum: { recoveredAmount: true },
      }),
      this.prisma.underdeclarationCase.groupBy({
        by: ['status'],
        where: { year },
        _count: { _all: true },
      }),
      this.prisma.underdeclarationCase.count({ where: { year } }),
      this.prisma.riskSignal.count({ where: { year } }),
      this.prisma.dataProvider.count({ where: { status: 'ACTIVE' as any } }),
      this.prisma.dataSubmission.findMany({
        where: { periodYear: year },
        select: { providerId: true },
        distinct: ['providerId'],
      }),
      this.prisma.underdeclarationCase.findMany({
        where: { year },
        orderBy: { estimatedTaxDue: 'desc' },
        take: 5,
        select: { id: true, year: true, estimatedTaxDue: true, status: true },
      }),
    ]);

    const casesByStatus = groupedByStatus.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topCases = topCasesRaw.map((c) => ({
      id: c.id,
      year: c.year,
      estimatedTaxDue: Number(c.estimatedTaxDue),
      status: c.status,
    }));

    return {
      year,
      revenueAtRisk: Number(revenueAtRiskAgg._sum.estimatedTaxDue ?? 0),
      recovered: Number(recoveredAgg._sum.recoveredAmount ?? 0),
      casesByStatus,
      totalCases,
      agentSignalCount,
      providers: {
        active: activeProviders,
        withSubmissions: providersWithSubmissions.length,
      },
      topCases,
    };
  }

  async listMou() {
    return this.prisma.bankMou.findMany({ include: { provider: { select: { name: true, providerType: true } } } });
  }

  async upsertMou(dto: any) {
    const { providerId, ...rest } = dto || {};
    return this.prisma.bankMou.upsert({
      where: { providerId },
      create: { providerId, ...rest },
      update: rest,
    });
  }
}
