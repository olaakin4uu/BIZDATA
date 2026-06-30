import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type PeriodStatus = 'ON_TIME' | 'LATE' | 'MISSING' | 'PENDING';

/**
 * §29 / §6.6 obligation tracking: for each provider, derive the periods it is
 * obliged to report (per its reporting frequency), the statutory due date
 * (15 days after period end), and whether a compliant submission arrived in
 * time — plus per-provider data quality (rejection rate).
 */
@Injectable()
export class ProviderComplianceService {
  constructor(private prisma: PrismaService) {}

  // 15 days after the period ends (§6.6). Quarters end Mar/Jun/Sep/Dec.
  private quarterDue(year: number, q: number): Date {
    const map: Record<number, [number, number]> = {
      1: [3, 15], // Q1 (Jan–Mar) → 15 Apr
      2: [6, 15], // Q2 → 15 Jul
      3: [9, 15], // Q3 → 15 Oct
      4: [0, 15], // Q4 → 15 Jan next year
    };
    const [monthIdx, day] = map[q];
    const y = q === 4 ? year + 1 : year;
    return new Date(Date.UTC(y, monthIdx, day));
  }
  private monthDue(year: number, m: number): Date {
    // 15th of the following month
    return new Date(Date.UTC(m === 12 ? year + 1 : year, m % 12, 15));
  }

  private expectedPeriods(year: number, frequency: string | null): { label: string; due: Date }[] {
    const freq = (frequency || 'QUARTERLY').toUpperCase();
    if (freq === 'MONTHLY') {
      return Array.from({ length: 12 }, (_, i) => ({
        label: `${year}-${String(i + 1).padStart(2, '0')}`,
        due: this.monthDue(year, i + 1),
      }));
    }
    if (freq === 'ANNUAL') {
      return [{ label: `${year}`, due: new Date(Date.UTC(year + 1, 0, 15)) }];
    }
    return [1, 2, 3, 4].map((q) => ({ label: `${year}-Q${q}`, due: this.quarterDue(year, q) }));
  }

  async forYear(year: number, providerId?: string) {
    const now = new Date();
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
      const expected = this.expectedPeriods(year, p.reportingFrequency);
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
