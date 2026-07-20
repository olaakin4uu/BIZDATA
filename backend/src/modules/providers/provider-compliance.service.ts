import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { randomBytes } from 'crypto';
import { StatutoryService } from '../statutory/statutory.service';

export type PeriodStatus = 'ON_TIME' | 'LATE' | 'MISSING' | 'PENDING';

/**
 * Whole months a filing is in default, counted from its due date to the
 * reference date (the filing date for LATE, "now" for MISSING). Always ≥ 1 once
 * in default — the first month of default is month 1 (NTAA s.101 counts the
 * "first month of default" as a discrete unit, not a pro-rata slice).
 */
export function monthsInDefault(dueAt: Date, asOf: Date): number {
  if (asOf <= dueAt) return 0;
  const ms = asOf.getTime() - dueAt.getTime();
  return Math.max(1, Math.ceil(ms / (30 * 86_400_000)));
}

/**
 * NTAA 2025 s.101 penalty for a return in default: a fixed fine for the first
 * month plus a further fixed fine for each subsequent month it continues.
 *   months=1 → first only; months=3 → first + 2 × perMonth.
 */
export function s101Penalty(months: number, firstMonth: number, perMonth: number): number {
  if (months <= 0) return 0;
  return firstMonth + Math.max(0, months - 1) * perMonth;
}

/**
 * §29 / §6.6 obligation tracking: for each provider, derive the periods it is
 * obliged to report (per its reporting frequency), the statutory due date
 * (period end + the configured reporting-due days), and whether a compliant
 * submission arrived in time — plus per-provider data quality (rejection rate).
 */
@Injectable()
export class ProviderComplianceService {
  constructor(
    private prisma: PrismaService,
    private statutory: StatutoryService,
    private audit: AuditService,
  ) {}

  /** N days after the last day of a quarter (dueDays from active StatutoryConfig). */
  private quarterDue(year: number, q: number, dueDays: number): Date {
    // First day of the month AFTER the quarter ends, then subtract to the last
    // day of the quarter, then add dueDays.
    const endMonthExclusive: Record<number, [number, number]> = {
      1: [year, 3],       // quarter ends 31 Mar → month-start Apr
      2: [year, 6],       // 30 Jun → Jul
      3: [year, 9],       // 30 Sep → Oct
      4: [year + 1, 0],   // 31 Dec → Jan next year
    };
    const [y, m] = endMonthExclusive[q];
    const periodEnd = new Date(Date.UTC(y, m, 0)); // day 0 = last day of prior month
    return this.addDays(periodEnd, dueDays);
  }
  private monthDue(year: number, m: number, dueDays: number): Date {
    const periodEnd = new Date(Date.UTC(year, m, 0)); // last day of month m (1-based)
    return this.addDays(periodEnd, dueDays);
  }
  private addDays(d: Date, days: number): Date {
    return new Date(d.getTime() + days * 86_400_000);
  }

  private expectedPeriods(year: number, frequency: string | null, dueDays: number): { label: string; due: Date }[] {
    const freq = (frequency || 'QUARTERLY').toUpperCase();
    if (freq === 'MONTHLY') {
      return Array.from({ length: 12 }, (_, i) => ({
        label: `${year}-${String(i + 1).padStart(2, '0')}`,
        due: this.monthDue(year, i + 1, dueDays),
      }));
    }
    if (freq === 'ANNUAL') {
      return [{ label: `${year}`, due: this.addDays(new Date(Date.UTC(year, 11, 31)), dueDays) }];
    }
    return [1, 2, 3, 4].map((q) => ({ label: `${year}-Q${q}`, due: this.quarterDue(year, q, dueDays) }));
  }

  async forYear(year: number, providerId?: string) {
    const now = new Date();
    const cfg = await this.statutory.active();
    const dueDays = cfg.reportingDueDays;
    const pFirst = cfg.providerPenaltyFirstMonth;
    const pPer = cfg.providerPenaltyPerMonth;
    const providers = await this.prisma.dataProvider.findMany({
      where: { ...(providerId ? { id: providerId } : { status: 'ACTIVE' }) },
      select: { id: true, name: true, providerType: true, reportingFrequency: true, status: true },
      orderBy: { name: 'asc' },
    });

    const subs = await this.prisma.dataSubmission.findMany({
      where: { periodYear: year, ...(providerId ? { providerId } : {}) },
      select: { providerId: true, periodLabel: true, status: true, receivedAt: true, recordCount: true, acceptedCount: true, rejectedCount: true },
      orderBy: { receivedAt: 'asc' },
    });

    return providers.map((p) => {
      const mine = subs.filter((s) => s.providerId === p.id);
      const expected = this.expectedPeriods(year, p.reportingFrequency, dueDays);
      const periods = expected.map((e) => {
        const forPeriod = mine.filter((s) => s.periodLabel === e.label && s.status !== 'REJECTED');
        const first = forPeriod[0];
        let status: PeriodStatus;
        if (first) status = first.receivedAt <= e.due ? 'ON_TIME' : 'LATE';
        else status = e.due < now ? 'MISSING' : 'PENDING';
        // NTAA s.101 penalty for a period in default. LATE accrues to the filing
        // date; MISSING keeps accruing to today. ON_TIME/PENDING → no penalty.
        const asOf = status === 'LATE' ? first!.receivedAt : now;
        const months = status === 'LATE' || status === 'MISSING' ? monthsInDefault(e.due, asOf) : 0;
        const penalty = s101Penalty(months, pFirst, pPer);
        return {
          period: e.label, dueAt: e.due, status, receivedAt: first?.receivedAt ?? null,
          monthsInDefault: months, penalty,
        };
      });

      const counts = (st: PeriodStatus) => periods.filter((x) => x.status === st).length;
      const totalRecords = mine.reduce((s, x) => s + x.recordCount, 0);
      const totalRejected = mine.reduce((s, x) => s + x.rejectedCount, 0);
      const due = periods.filter((x) => x.status !== 'PENDING').length;
      const onTime = counts('ON_TIME');
      const penaltyTotal = periods.reduce((s, x) => s + x.penalty, 0);

      return {
        provider: { id: p.id, name: p.name, providerType: p.providerType, status: p.status, reportingFrequency: p.reportingFrequency || 'QUARTERLY' },
        expected: expected.length,
        onTime,
        late: counts('LATE'),
        missing: counts('MISSING'),
        pending: counts('PENDING'),
        complianceRate: due > 0 ? Math.round((onTime / due) * 100) : 100,
        submissions: mine.length,
        rejectionRate: totalRecords > 0 ? Math.round((totalRejected / totalRecords) * 100) : 0,
        penaltyTotal, // NTAA s.101 — total across all late/missing periods this year
        periods,
      };
    });
  }

  async summary(year: number) {
    const rows = await this.forYear(year);
    const totalMissing = rows.reduce((s, r) => s + r.missing, 0);
    const totalLate = rows.reduce((s, r) => s + r.late, 0);
    const totalPenalty = rows.reduce((s, r) => s + r.penaltyTotal, 0);
    const avgCompliance = rows.length ? Math.round(rows.reduce((s, r) => s + r.complianceRate, 0) / rows.length) : 100;
    return {
      year,
      providers: rows.length,
      avgCompliance,
      totalMissing,
      totalLate,
      totalPenalty, // NTAA s.101 — aggregate exposure across all providers this year
      atRisk: rows.filter((r) => r.missing > 0).map((r) => ({ id: r.provider.id, name: r.provider.name, missing: r.missing })),
    };
  }

  // ─── Formal penalty records (NTAA s.101) ────────────────────────────────────

  /**
   * Raise a formal, auditable penalty for ONE provider period that is LATE or
   * MISSING. Idempotent per provider/period (re-issuing refreshes the figures on
   * the currently active statutory config). ON_TIME / PENDING periods are
   * rejected — nothing is owed. A WAIVED or PAID record is left untouched.
   */
  async issuePenalty(providerId: string, periodLabel: string, staffId?: string) {
    const provider = await this.prisma.dataProvider.findUnique({ where: { id: providerId }, select: { id: true, name: true } });
    if (!provider) throw new NotFoundException('Provider not found');

    // Recompute this exact period from the source of truth.
    const yearFromLabel = parseInt(periodLabel.slice(0, 4), 10);
    const rows = await this.forYear(yearFromLabel, providerId);
    const period = rows[0]?.periods.find((p) => p.period === periodLabel);
    if (!period) throw new NotFoundException(`Period ${periodLabel} not expected for this provider.`);
    if (period.status !== 'LATE' && period.status !== 'MISSING') {
      throw new NotFoundException(`Period ${periodLabel} is ${period.status} — no penalty is due.`);
    }

    const existing = await this.prisma.providerPenalty.findUnique({
      where: { providerId_periodLabel: { providerId, periodLabel } },
      select: { id: true, status: true },
    });
    if (existing && (existing.status === 'WAIVED' || existing.status === 'PAID')) {
      return existing; // a resolved penalty is not re-computed/reopened by a rescan
    }

    const cfg = await this.statutory.active();
    const basis = {
      statute: 'NTAA 2025 s.101 (failure/late filing of returns)',
      statutoryVersion: cfg.version,
      reason: period.status,
      dueAt: period.dueAt.toISOString(),
      monthsInDefault: period.monthsInDefault,
      firstMonthAmount: cfg.providerPenaltyFirstMonth,
      perMonthAmount: cfg.providerPenaltyPerMonth,
      formula: 'first + (months - 1) × perMonth',
      amount: period.penalty,
    };
    const data = {
      providerId, periodLabel, periodYear: yearFromLabel, dueAt: period.dueAt,
      reason: period.status, monthsInDefault: period.monthsInDefault,
      firstMonthAmount: new Prisma.Decimal(cfg.providerPenaltyFirstMonth.toFixed(2)),
      perMonthAmount: new Prisma.Decimal(cfg.providerPenaltyPerMonth.toFixed(2)),
      amount: new Prisma.Decimal(period.penalty.toFixed(2)),
      basis: basis as any, statutoryVersion: cfg.version,
      noticeRef: `PPN-${periodLabel}-${randomBytes(3).toString('hex').toUpperCase()}`,
    };

    const saved = await this.prisma.providerPenalty.upsert({
      where: { providerId_periodLabel: { providerId, periodLabel } },
      update: data,        // refresh figures (e.g. a MISSING period accruing further)
      create: { ...data, status: 'ASSESSED' },
    });

    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'ISSUE_PROVIDER_PENALTY', entity: 'ProviderPenalty', entityId: saved.id,
      afterJson: { providerId, periodLabel, amount: period.penalty, reason: period.status, months: period.monthsInDefault },
    });

    return saved;
  }

  /** Issue penalties for every LATE/MISSING period across all providers in a year. */
  async issueAllForYear(year: number, staffId?: string) {
    const rows = await this.forYear(year);
    let issued = 0;
    const results: { providerId: string; period: string; amount: number }[] = [];
    for (const r of rows) {
      for (const p of r.periods) {
        if (p.status !== 'LATE' && p.status !== 'MISSING') continue;
        try {
          await this.issuePenalty(r.provider.id, p.period, staffId);
          results.push({ providerId: r.provider.id, period: p.period, amount: p.penalty });
          issued += 1;
        } catch { /* skip a period that raced to ON_TIME, etc. */ }
      }
    }
    await this.audit.log({
      actorType: 'STAFF', actorId: staffId, staffId,
      action: 'ISSUE_PROVIDER_PENALTIES_BATCH', entity: 'ProviderPenalty',
      afterJson: { year, issued },
    });
    return { year, issued, results };
  }

  /** List issued penalties (optionally scoped to a provider or year). */
  async listPenalties(opts: { providerId?: string; year?: number; status?: string } = {}) {
    return this.prisma.providerPenalty.findMany({
      where: {
        ...(opts.providerId ? { providerId: opts.providerId } : {}),
        ...(opts.year ? { periodYear: opts.year } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: { provider: { select: { id: true, name: true, providerType: true } } },
      orderBy: [{ periodYear: 'desc' }, { amount: 'desc' }],
    });
  }
}
