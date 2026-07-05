import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';

/**
 * Analyst feedback loop + fairness gate.
 *
 * Every Clear/Confirm an officer makes on a flagged record is a labelled example:
 *   CONFIRMED = the flag was correct (true positive)
 *   CLEARED   = the flag was a false positive
 * Aggregating those per sector yields a real precision signal, which drives
 * per-sector threshold recommendations. Before any recommended change is applied,
 * a fairness gate checks it would not disproportionately affect one taxpayer
 * segment (disparate impact).
 */
@Injectable()
export class ModelFeedbackService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /**
   * Per-sector precision from analyst decisions on flagged records, plus a
   * threshold recommendation for each sector.
   */
  async feedback(year: number) {
    // Reviewed flagged records for the year, joined to the taxpayer's sector.
    const records = await this.prisma.dataRecord.findMany({
      where: { flaggedAsUnderdeclared: true, reviewStatus: { in: ['CLEARED', 'CONFIRMED'] }, periodYear: year },
      select: { reviewStatus: true, taxpayer: { select: { sector: true } } },
    });

    type Agg = { confirmed: number; cleared: number };
    const bySector = new Map<string, Agg>();
    for (const r of records) {
      const key = r.taxpayer?.sector ?? 'UNCLASSIFIED';
      const a = bySector.get(key) ?? { confirmed: 0, cleared: 0 };
      if (r.reviewStatus === 'CONFIRMED') a.confirmed++; else a.cleared++;
      bySector.set(key, a);
    }

    // Active per-sector overrides + the global default, for context.
    const overrides = await this.prisma.sectorThreshold.findMany();
    const overrideMap = new Map(overrides.map((o) => [o.sector, Number(o.threshold)]));

    const rows = [...bySector.entries()].map(([sector, a]) => {
      const reviewed = a.confirmed + a.cleared;
      const precision = reviewed > 0 ? a.confirmed / reviewed : null;
      const falsePositiveRate = reviewed > 0 ? a.cleared / reviewed : null;
      return {
        sector,
        reviewed, confirmed: a.confirmed, cleared: a.cleared,
        precision, falsePositiveRate,
        currentThreshold: overrideMap.get(sector) ?? null, // null = uses global default
        recommendation: this.recommend(precision, reviewed),
      };
    }).sort((x, y) => y.reviewed - x.reviewed);

    const totalReviewed = records.length;
    const totalConfirmed = records.filter((r) => r.reviewStatus === 'CONFIRMED').length;
    return {
      year,
      overallPrecision: totalReviewed > 0 ? totalConfirmed / totalReviewed : null,
      totalReviewed,
      sectors: rows,
    };
  }

  /**
   * Recommend a threshold move from a sector's precision. Low precision (many
   * false positives) → raise the threshold to flag fewer, higher-confidence
   * cases. High precision → the model is well-calibrated; hold or lower slightly.
   * Only recommends when there is enough reviewed evidence.
   */
  private recommend(precision: number | null, reviewed: number): { action: 'RAISE' | 'HOLD' | 'LOWER'; suggestedThreshold: number | null; rationale: string } {
    if (precision === null || reviewed < 10) {
      return { action: 'HOLD', suggestedThreshold: null, rationale: `Not enough reviewed evidence yet (${reviewed} decisions; need ≥10).` };
    }
    if (precision < 0.5) {
      return { action: 'RAISE', suggestedThreshold: 0.35, rationale: `Precision ${(precision * 100).toFixed(0)}% — over half of flags are being cleared. Raise the threshold to reduce false positives.` };
    }
    if (precision < 0.7) {
      return { action: 'RAISE', suggestedThreshold: 0.25, rationale: `Precision ${(precision * 100).toFixed(0)}% — moderate false-positive rate. A small raise would sharpen the flags.` };
    }
    if (precision >= 0.9) {
      return { action: 'LOWER', suggestedThreshold: 0.15, rationale: `Precision ${(precision * 100).toFixed(0)}% — flags are almost always confirmed; the model could safely catch more by lowering the threshold.` };
    }
    return { action: 'HOLD', suggestedThreshold: null, rationale: `Precision ${(precision * 100).toFixed(0)}% — well-calibrated. No change recommended.` };
  }

  /**
   * Fairness gate for a proposed per-sector threshold change. Lowering a
   * threshold flags MORE taxpayers; we check that the increase in flag rate does
   * not fall disproportionately on one taxpayer type vs another (a proxy for
   * disparate impact using the four-fifths / 80% rule).
   */
  async fairnessCheck(sector: string, proposedThreshold: number, year: number) {
    // How the proposed threshold would flag taxpayers in this sector, split by type.
    const records = await this.prisma.dataRecord.findMany({
      where: { periodYear: year, taxpayer: { sector } },
      select: { discrepancyPct: true, taxpayer: { select: { id: true, type: true } } },
    });

    const byType = new Map<string, { total: Set<string>; flagged: Set<string> }>();
    for (const r of records) {
      const t = r.taxpayer?.type ?? 'UNKNOWN';
      const id = r.taxpayer?.id;
      if (!id) continue;
      const a = byType.get(t) ?? { total: new Set(), flagged: new Set() };
      a.total.add(id);
      if (Number(r.discrepancyPct ?? 0) > proposedThreshold) a.flagged.add(id);
      byType.set(t, a);
    }

    const rates = [...byType.entries()].map(([type, a]) => ({
      type,
      taxpayers: a.total.size,
      flagRate: a.total.size > 0 ? a.flagged.size / a.total.size : 0,
    })).filter((r) => r.taxpayers >= 5); // ignore tiny groups

    // Four-fifths rule: min flag rate / max flag rate should be ≥ 0.8.
    const maxRate = Math.max(0, ...rates.map((r) => r.flagRate));
    const minRate = Math.min(1, ...rates.map((r) => r.flagRate));
    const impactRatio = maxRate > 0 ? minRate / maxRate : 1;
    const passes = rates.length < 2 || impactRatio >= 0.8;

    return {
      sector, proposedThreshold,
      rates,
      impactRatio: Number(impactRatio.toFixed(2)),
      passes,
      verdict: passes
        ? 'No disparate impact detected (four-fifths rule satisfied).'
        : `Disparate impact risk: flag rates differ by more than 20% across taxpayer types (ratio ${impactRatio.toFixed(2)} < 0.80). Review before applying.`,
    };
  }

  /** Apply a per-sector threshold override — only after the fairness gate passes. */
  async applyOverride(sector: string, threshold: number, year: number, staffId?: string, force = false) {
    if (threshold <= 0 || threshold >= 1) throw new BadRequestException('Threshold must be between 0 and 1.');
    const fairness = await this.fairnessCheck(sector, threshold, year);
    if (!fairness.passes && !force) {
      throw new BadRequestException(`Blocked by fairness gate: ${fairness.verdict}`);
    }

    const rec = await this.prisma.sectorThreshold.upsert({
      where: { sector },
      update: { threshold, updatedById: staffId ?? null, fairnessPassed: fairness.passes },
      create: { sector, threshold, updatedById: staffId ?? null, fairnessPassed: fairness.passes },
    });

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'APPLY_SECTOR_THRESHOLD', entity: 'SectorThreshold', entityId: rec.id,
      afterJson: { sector, threshold, fairnessPassed: fairness.passes, forced: force && !fairness.passes },
    });
    return { sector, threshold, fairness };
  }

  async listOverrides() {
    const rows = await this.prisma.sectorThreshold.findMany({ orderBy: { sector: 'asc' } });
    return rows.map((r) => ({ sector: r.sector, threshold: Number(r.threshold), fairnessPassed: r.fairnessPassed, updatedAt: r.updatedAt }));
  }

  async removeOverride(sector: string, staffId?: string) {
    await this.prisma.sectorThreshold.delete({ where: { sector } }).catch(() => {});
    await this.audit.log({ actorType: 'STAFF', actorId: staffId, staffId, action: 'REMOVE_SECTOR_THRESHOLD', entity: 'SectorThreshold', entityId: sector });
    return { success: true };
  }
}
