import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';
import { PiiAccessService } from '../../common/services/pii-access.service';

/**
 * Taxpayer 360 + cross-record search. (Stub — implemented by the feature-fleet
 * workflow.) profile(id) should assemble: taxpayer (PII masked unless allowed),
 * declared incomes, data records grouped by year/provider, underdeclaration
 * cases, AI risk signals, and a risk timeline. search(q) finds taxpayers by
 * name / TIN / NIN / BVN (identifiers via crypto.blindIndex) or CAC number.
 */
@Injectable()
export class Taxpayer360Service {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private pii: PiiAccessService,
  ) {}

  async profile(id: string): Promise<any> {
    const tp = await this.prisma.taxpayer.findUnique({ where: { id } });
    if (!tp) throw new NotFoundException('Taxpayer not found');

    const allowClear = await this.pii.canRevealPii();

    // Decrypt identifiers, then mask unless the viewer holds a reveal grant.
    const nin = this.pii.reveal(this.crypto.decrypt(tp.ninEnc), 'nin', allowClear);
    const bvn = this.pii.reveal(this.crypto.decrypt(tp.bvnEnc), 'bvn', allowClear);
    // TIN is a public-facing identifier and may be shown in the clear.
    const tin = this.crypto.decrypt(tp.tinEnc);

    const [declaredIncomes, dataRecords, cases, riskSignals] = await Promise.all([
      this.prisma.declaredIncome.findMany({
        where: { taxpayerId: id },
        orderBy: { year: 'desc' },
      }),
      this.prisma.dataRecord.findMany({
        where: { taxpayerId: id },
        orderBy: { periodYear: 'desc' },
        include: { provider: { select: { name: true } } },
      }),
      this.prisma.underdeclarationCase.findMany({
        where: { taxpayerId: id },
        orderBy: { year: 'desc' },
      }),
      this.prisma.riskSignal.findMany({
        where: { taxpayerId: id },
        orderBy: [{ year: 'desc' }, { agentKey: 'asc' }],
      }),
    ]);

    return {
      taxpayer: {
        id: tp.id,
        type: tp.type,
        status: tp.status,
        firstName: tp.firstName,
        lastName: tp.lastName,
        middleName: tp.middleName,
        businessName: tp.businessName,
        name: this.displayName(tp),
        phone: tp.phone,
        email: tp.email,
        address: tp.address,
        stateOfResidence: tp.stateOfResidence,
        sector: tp.sector,
        cacRcNumber: tp.cacRcNumber,
        riskLevel: tp.riskLevel,
        riskScore: tp.riskScore,
        nin,
        bvn,
        tin,
      },
      declaredIncomes: declaredIncomes.map((d) => ({
        year: d.year,
        assessableIncome: Number(d.assessableIncome),
        source: d.source,
      })),
      dataRecordsByYear: this.groupRecordsByYear(dataRecords),
      underdeclarationCases: cases.map((c) => this.serializeCase(c)),
      riskSignals: riskSignals.map((s) => ({
        year: s.year,
        agentKey: s.agentKey,
        score: Number(s.score),
        severity: s.severity,
        summary: s.summary,
        details: s.details ?? null,
      })),
      riskTimeline: this.buildRiskTimeline(cases),
    };
  }

  async search(q: string): Promise<any[]> {
    const term = (q ?? '').trim();
    if (!term) return [];

    const allowClear = await this.pii.canRevealPii();
    const blind = this.crypto.blindIndex(term);

    const or: any[] = [
      { businessName: { contains: term, mode: 'insensitive' } },
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { cacRcNumber: { contains: term, mode: 'insensitive' } },
    ];
    if (blind) {
      or.push({ ninIndex: blind }, { tinIndex: blind }, { bvnIndex: blind });
    }

    const matches = await this.prisma.taxpayer.findMany({
      where: { OR: or },
      take: 25,
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((tp) => ({
      id: tp.id,
      name: this.displayName(tp),
      type: tp.type,
      riskLevel: tp.riskLevel,
      tin: this.pii.reveal(this.crypto.decrypt(tp.tinEnc), 'account', allowClear),
    }));
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private displayName(tp: {
    businessName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }): string {
    if (tp.businessName) return tp.businessName;
    const parts = [tp.firstName, tp.lastName].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Unknown';
  }

  private groupRecordsByYear(
    records: Array<{
      periodYear: number;
      periodLabel: string;
      accountName: string | null;
      matchMethod: string | null;
      totalInflow: any;
      provider?: { name: string } | null;
    }>,
  ): Array<{
    year: number;
    records: Array<{
      provider: string | null;
      periodLabel: string;
      accountName: string | null;
      matchMethod: string | null;
      totalInflow: number;
    }>;
  }> {
    const byYear = new Map<number, any[]>();
    for (const r of records) {
      const entry = {
        provider: r.provider?.name ?? null,
        periodLabel: r.periodLabel,
        accountName: r.accountName,
        matchMethod: r.matchMethod,
        totalInflow: Number(r.totalInflow ?? 0),
      };
      const bucket = byYear.get(r.periodYear);
      if (bucket) bucket.push(entry);
      else byYear.set(r.periodYear, [entry]);
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, recs]) => ({ year, records: recs }));
  }

  private serializeCase(c: any) {
    return {
      id: c.id,
      year: c.year,
      status: c.status,
      riskLevel: c.riskLevel,
      observedIncome: Number(c.observedIncome),
      declaredIncome: Number(c.declaredIncome),
      discrepancyAmount: Number(c.discrepancyAmount),
      estimatedTaxDue: Number(c.estimatedTaxDue),
      confidence: Number(c.confidence),
      agentScore: c.agentScore == null ? null : Number(c.agentScore),
      assessedTotal: c.assessedTotal == null ? null : Number(c.assessedTotal),
      recoveredAmount: c.recoveredAmount == null ? null : Number(c.recoveredAmount),
      demandNoticeRef: c.demandNoticeRef ?? null,
      objectionDueAt: c.objectionDueAt ?? null,
      authorityResponseDueAt: c.authorityResponseDueAt ?? null,
    };
  }

  private buildRiskTimeline(
    cases: Array<{
      year: number;
      createdAt: Date;
      noticeIssuedAt: Date | null;
      resolvedAt: Date | null;
      demandNoticeRef: string | null;
    }>,
  ): Array<{ date: Date; event: string }> {
    const timeline: Array<{ date: Date; event: string }> = [];
    for (const c of cases) {
      if (c.createdAt) {
        timeline.push({ date: c.createdAt, event: `Underdeclaration case opened (${c.year})` });
      }
      if (c.noticeIssuedAt) {
        const ref = c.demandNoticeRef ? ` ${c.demandNoticeRef}` : '';
        timeline.push({ date: c.noticeIssuedAt, event: `Demand notice issued${ref} (${c.year})` });
      }
      if (c.resolvedAt) {
        timeline.push({ date: c.resolvedAt, event: `Case resolved (${c.year})` });
      }
    }
    return timeline.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
