import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

/**
 * NDPA 2023 §§25-28 controls.
 *   §25 lawful processing / §26 purpose limitation — recorded in the processing
 *       register (purpose = NTAA 2025 §29 income verification).
 *   §27 accuracy — entity-resolution match confidence + officer review.
 *   §28 storage limitation — bank-report data is retained only for the statutory
 *       window (tenant.retentionYears, default 6) then purged. This service
 *       previews and executes that purge, and produces the DPO oversight report.
 */
@Injectable()
export class NdpaService {
  private readonly logger = new Logger(NdpaService.name);
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async retentionYears(): Promise<number> {
    const t = await this.prisma.tenant.findFirst({ select: { retentionYears: true } });
    return t?.retentionYears ?? 6;
  }

  private cutoff(years: number): Date {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d;
  }

  /** Count bank-report data past the retention horizon (no deletion). */
  async retentionPreview(overrideYears?: number) {
    const years = overrideYears ?? (await this.retentionYears());
    const cutoff = this.cutoff(years);
    const [records, submissions] = await Promise.all([
      this.prisma.dataRecord.count({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.dataSubmission.count({ where: { receivedAt: { lt: cutoff } } }),
    ]);
    return { retentionYears: years, cutoff, recordsPastRetention: records, submissionsPastRetention: submissions };
  }

  /** §28 purge: delete bank-report data older than the retention window. */
  async purge(staffId?: string, overrideYears?: number) {
    const years = overrideYears ?? (await this.retentionYears());
    const cutoff = this.cutoff(years);
    const records = await this.prisma.dataRecord.deleteMany({ where: { createdAt: { lt: cutoff } } });
    const submissions = await this.prisma.dataSubmission.deleteMany({
      where: { receivedAt: { lt: cutoff }, records: { none: {} } },
    });
    await this.audit.log({
      actorType: staffId ? 'STAFF' : 'SYSTEM', actorId: staffId, staffId,
      action: 'RETENTION_PURGE', entity: 'DataRecord',
      afterJson: { retentionYears: years, cutoff: cutoff.toISOString(), recordsPurged: records.count, submissionsPurged: submissions.count },
    });
    this.logger.log(`Retention purge: ${records.count} records, ${submissions.count} submissions older than ${years}y`);
    return { retentionYears: years, cutoff, recordsPurged: records.count, submissionsPurged: submissions.count };
  }

  /** DPO oversight report: access events, retention status, control posture. */
  async dpoReport() {
    const [piiAccess, evidenceExports, retentionPurges, totalAudit, retention] = await Promise.all([
      this.prisma.auditLog.count({ where: { action: 'PII_ACCESS' } }),
      this.prisma.auditLog.count({ where: { action: 'EVIDENCE_EXPORT' } }),
      this.prisma.auditLog.count({ where: { action: 'RETENTION_PURGE' } }),
      this.prisma.auditLog.count(),
      this.retentionPreview(),
    ]);
    return {
      lawfulBasis: 'NTAA 2025 §29 — statutory income verification (NDPA §25 lawful processing)',
      purposeLimitation: 'Bank-report data processed solely for tax verification; no secondary use.',
      dataMinimisation: 'Only §29-mandated fields ingested; sensitive identifiers (BVN/NIN/account) encrypted at rest.',
      encryptionAtRest: 'AES-256-GCM field-level + blind-index for BVN/NIN/TIN/account',
      accessOversight: { piiAccessEvents: piiAccess, evidenceExports, totalAuditEvents: totalAudit },
      storageLimitation: { ...retention, purgesRun: retentionPurges },
      generatedAt: new Date().toISOString(),
    };
  }

  /** Monthly storage-limitation sweep (ScheduleModule is global). */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT, { name: 'ndpa-retention' })
  async scheduledPurge() {
    if (process.env.SCHEDULER_ENABLED === 'false') return;
    await this.purge();
  }
}
