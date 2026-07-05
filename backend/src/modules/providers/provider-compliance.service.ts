import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutoryService } from '../statutory/statutory.service';

export type PeriodStatus = 'ON_TIME' | 'LATE' | 'MISSING' | 'PENDING';

/**
 * §29 / §6.6 obligation tracking: for each provider, derive the periods it is
 * obliged to report (per its reporting frequency), the statutory due date
 * (period end + the configured reporting-due days), and whether a compliant
 * submission arrived in time — plus per-provider data quality (rejection rate).
 */
@Injectable()
export class ProviderComplianceService {
  constructor(private prisma: PrismaService, private statutory: StatutoryService) {}

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
    const dueDays = (await this.statutory.active()).reportingDueDays;
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
        return { period: e.label, dueAt: e.due, status, receivedAt: first?.receivedAt ?? null };
      });

      const counts = (st: PeriodStatus) => periods.filter((x) => x.status === st).length;
      const totalRecords = mine.reduce((s, x) => s + x.recordCount, 0);
      const totalRejected = mine.reduce((s, x) => s + x.rejectedCount, 0);
      const due = periods.filter((x) => x.status !== 'PENDING').length;
      const onTime = counts('ON_TIME');

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
        periods,
      };
    });
  }

  async summary(year: number) {
    const rows = await this.forYear(year);
    const totalMissing = rows.reduce((s, r) => s + r.missing, 0);
    const totalLate = rows.reduce((s, r) => s + r.late, 0);
    const avgCompliance = rows.length ? Math.round(rows.reduce((s, r) => s + r.complianceRate, 0) / rows.length) : 100;
    return {
      year,
      providers: rows.length,
      avgCompliance,
      totalMissing,
      totalLate,
      atRisk: rows.filter((r) => r.missing > 0).map((r) => ({ id: r.provider.id, name: r.provider.name, missing: r.missing })),
    };
  }
}
