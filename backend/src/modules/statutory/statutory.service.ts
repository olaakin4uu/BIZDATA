import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

/**
 * Versioned statutory configuration. The legal parameters that drive
 * assessments live here, not as code constants, so a change in the law is a
 * settings change — recorded, attributable, and reversible. Editing creates a
 * new version; exactly one is active. Assessments stamp the version they used.
 */
export interface StatutoryValues {
  reportingDueDays: number;
  objectionWindowDays: number;
  authorityResponseDays: number;
  latePaymentPenaltyRate: number;
  citRate: number;
  citSmallCoThreshold: number;
  defaultScanThreshold: number;
}

// The current code defaults — seeded as version 1 on first run. These mirror the
// constants the services used before this feature existed.
const DEFAULTS: StatutoryValues = {
  reportingDueDays: 15,
  objectionWindowDays: 30,
  authorityResponseDays: 90,
  latePaymentPenaltyRate: 0.1,
  citRate: 0.3,
  citSmallCoThreshold: 50_000_000,
  defaultScanThreshold: 0.2,
};

@Injectable()
export class StatutoryService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** The active config as plain numbers — seeds version 1 the first time. */
  async active(): Promise<StatutoryValues & { version: number }> {
    let row = await this.prisma.statutoryConfig.findFirst({ where: { isActive: true } });
    if (!row) {
      row = await this.prisma.statutoryConfig.create({
        data: {
          version: 1, isActive: true, note: 'Initial defaults (seeded from code constants).',
          reportingDueDays: DEFAULTS.reportingDueDays,
          objectionWindowDays: DEFAULTS.objectionWindowDays,
          authorityResponseDays: DEFAULTS.authorityResponseDays,
          latePaymentPenaltyRate: DEFAULTS.latePaymentPenaltyRate,
          citRate: DEFAULTS.citRate,
          citSmallCoThreshold: DEFAULTS.citSmallCoThreshold,
          defaultScanThreshold: DEFAULTS.defaultScanThreshold,
        },
      });
    }
    return this.toValues(row);
  }

  /** Full version history, newest first. */
  async history() {
    const rows = await this.prisma.statutoryConfig.findMany({ orderBy: { version: 'desc' } });
    return rows.map((r) => ({ ...this.toValues(r), isActive: r.isActive, note: r.note, createdAt: r.createdAt }));
  }

  /**
   * Update = create a new version and make it active (never edit in place, so the
   * history and every case's stamped version stay valid). Only provided fields
   * change; the rest carry over from the current active config.
   */
  async update(patch: Partial<StatutoryValues>, note: string | undefined, staffId?: string) {
    const current = await this.active();
    const next: StatutoryValues = { ...current, ...sanitize(patch) };
    const nextVersion = (await this.prisma.statutoryConfig.aggregate({ _max: { version: true } }))._max.version! + 1;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.statutoryConfig.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.statutoryConfig.create({
        data: {
          version: nextVersion, isActive: true, note: note ?? null, createdById: staffId ?? null,
          reportingDueDays: next.reportingDueDays,
          objectionWindowDays: next.objectionWindowDays,
          authorityResponseDays: next.authorityResponseDays,
          latePaymentPenaltyRate: next.latePaymentPenaltyRate,
          citRate: next.citRate,
          citSmallCoThreshold: next.citSmallCoThreshold,
          defaultScanThreshold: next.defaultScanThreshold,
        },
      });
    });

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'UPDATE_STATUTORY_CONFIG', entity: 'StatutoryConfig', entityId: created.id,
      beforeJson: current, afterJson: { ...next, version: nextVersion, note },
    });

    return this.toValues(created);
  }

  private toValues(r: any): StatutoryValues & { version: number } {
    return {
      version: r.version,
      reportingDueDays: r.reportingDueDays,
      objectionWindowDays: r.objectionWindowDays,
      authorityResponseDays: r.authorityResponseDays,
      latePaymentPenaltyRate: Number(r.latePaymentPenaltyRate),
      citRate: Number(r.citRate),
      citSmallCoThreshold: Number(r.citSmallCoThreshold),
      defaultScanThreshold: Number(r.defaultScanThreshold),
    };
  }
}

/** Clamp incoming values to sane ranges so a fat-finger can't break assessments. */
function sanitize(p: Partial<StatutoryValues>): Partial<StatutoryValues> {
  const out: Partial<StatutoryValues> = {};
  const day = (n: any) => Math.max(1, Math.min(3650, Math.round(Number(n))));
  const rate = (n: any) => Math.max(0, Math.min(1, Number(n)));
  const money = (n: any) => Math.max(0, Number(n));
  if (p.reportingDueDays != null) out.reportingDueDays = day(p.reportingDueDays);
  if (p.objectionWindowDays != null) out.objectionWindowDays = day(p.objectionWindowDays);
  if (p.authorityResponseDays != null) out.authorityResponseDays = day(p.authorityResponseDays);
  if (p.latePaymentPenaltyRate != null) out.latePaymentPenaltyRate = rate(p.latePaymentPenaltyRate);
  if (p.citRate != null) out.citRate = rate(p.citRate);
  if (p.citSmallCoThreshold != null) out.citSmallCoThreshold = money(p.citSmallCoThreshold);
  if (p.defaultScanThreshold != null) out.defaultScanThreshold = rate(p.defaultScanThreshold);
  return out;
}
