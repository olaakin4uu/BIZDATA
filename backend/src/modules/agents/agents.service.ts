import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { BenchmarkingService } from './benchmarking.service';
import { AGENTS } from './registry';
import { TaxpayerProfile, AgentContext, severityFor, clamp01 } from './agent.types';
import { aggregateAgentScore, compositeConfidence, confidenceToRisk } from '../scan/detection-engine';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private benchmarking: BenchmarkingService,
  ) {}

  /** Build one profile per taxpayer for the year from bank-report aggregates. */
  private async buildProfiles(year: number): Promise<TaxpayerProfile[]> {
    const records = await this.prisma.dataRecord.findMany({
      where: { periodYear: year, taxpayerId: { not: null } },
      select: {
        taxpayerId: true, providerId: true, providerType: true, periodLabel: true, periodYear: true,
        totalInflow: true, totalOutflow: true, openingBalance: true, closingBalance: true,
        transactionCount: true, matchConfidence: true, accountName: true, payload: true,
      },
    });
    const byTp = new Map<string, typeof records>();
    for (const r of records) {
      if (!r.taxpayerId) continue;
      (byTp.get(r.taxpayerId) ?? byTp.set(r.taxpayerId, []).get(r.taxpayerId)!).push(r);
    }
    if (byTp.size === 0) return [];

    const taxpayers = await this.prisma.taxpayer.findMany({
      where: { id: { in: [...byTp.keys()] } },
      select: {
        id: true, type: true, firstName: true, lastName: true, businessName: true,
        dateOfBirth: true, stateOfResidence: true, sector: true,
        declaredIncomes: { where: { year }, select: { assessableIncome: true } },
      },
    });

    return taxpayers.map((t) => {
      const recs = byTp.get(t.id) ?? [];
      const num = (d: Prisma.Decimal | null) => Number(d ?? 0);
      const declared = t.declaredIncomes[0] ? num(t.declaredIncomes[0].assessableIncome as any) : 0;
      return {
        taxpayerId: t.id,
        type: t.type as any,
        year,
        firstName: t.firstName,
        lastName: t.lastName,
        businessName: t.businessName,
        dateOfBirth: t.dateOfBirth ? t.dateOfBirth.toISOString().slice(0, 10) : null,
        stateOfResidence: t.stateOfResidence,
        sector: t.sector,
        records: recs.map((r) => ({
          providerId: r.providerId,
          providerType: r.providerType as string,
          periodLabel: r.periodLabel,
          periodYear: r.periodYear,
          totalInflow: num(r.totalInflow),
          totalOutflow: num(r.totalOutflow),
          openingBalance: num(r.openingBalance),
          closingBalance: num(r.closingBalance),
          transactionCount: r.transactionCount ?? 0,
          matchConfidence: r.matchConfidence != null ? Number(r.matchConfidence) : null,
          accountName: r.accountName,
          payload: (r.payload as any) ?? null,
        })),
        totalInflow: recs.reduce((s, r) => s + num(r.totalInflow), 0),
        totalOutflow: recs.reduce((s, r) => s + num(r.totalOutflow), 0),
        transactionCount: recs.reduce((s, r) => s + (r.transactionCount ?? 0), 0),
        providerCount: new Set(recs.map((r) => r.providerId)).size,
        declaredIncome: declared,
        hasDeclaration: !!t.declaredIncomes[0],
      };
    });
  }

  /** Run all six agents over the year and persist their signals. */
  async run(year: number, staffId?: string) {
    this.logger.log(`Running ${AGENTS.length} analytics agents for ${year}`);
    const profiles = await this.buildProfiles(year);
    const ctx: AgentContext = { benchmarks: this.benchmarking.build(profiles) };

    let written = 0;
    const perAgent: Record<string, number> = {};
    const signalsByTaxpayer = new Map<string, { score: number }[]>();
    for (const profile of profiles) {
      for (const agent of AGENTS) {
        let signal;
        try {
          signal = agent.analyze(profile, ctx);
        } catch (err: any) {
          this.logger.warn(`Agent ${agent.key} failed on ${profile.taxpayerId}: ${err.message}`);
          continue;
        }
        if (!signal) continue;
        const score = clamp01(signal.score);
        (signalsByTaxpayer.get(profile.taxpayerId) ?? signalsByTaxpayer.set(profile.taxpayerId, []).get(profile.taxpayerId)!).push({ score });
        await this.prisma.riskSignal.upsert({
          where: { taxpayerId_year_agentKey: { taxpayerId: profile.taxpayerId, year, agentKey: agent.key } },
          create: {
            taxpayerId: profile.taxpayerId, year, agentKey: agent.key,
            score: new Prisma.Decimal(score.toFixed(2)),
            severity: signal.severity ?? severityFor(score),
            summary: signal.summary, details: (signal.details as any) ?? Prisma.DbNull,
          },
          update: {
            score: new Prisma.Decimal(score.toFixed(2)),
            severity: signal.severity ?? severityFor(score),
            summary: signal.summary, details: (signal.details as any) ?? Prisma.DbNull,
          },
        });
        written++;
        perAgent[agent.key] = (perAgent[agent.key] ?? 0) + 1;
      }
    }

    // Multi-signal fusion: blend agent corroboration into each case's risk.
    let casesUpdated = 0;
    const yearCases = await this.prisma.underdeclarationCase.findMany({
      where: { year, taxpayerId: { in: [...signalsByTaxpayer.keys()] } },
      select: { id: true, taxpayerId: true, confidence: true },
    });
    for (const c of yearCases) {
      const sigs = signalsByTaxpayer.get(c.taxpayerId) ?? [];
      if (!sigs.length) continue;
      const agentScore = aggregateAgentScore(sigs);
      const composite = compositeConfidence(Number(c.confidence), agentScore);
      await this.prisma.underdeclarationCase.update({
        where: { id: c.id },
        data: {
          agentScore: new Prisma.Decimal(agentScore.toFixed(2)),
          riskLevel: confidenceToRisk(composite) as any,
        },
      });
      casesUpdated++;
    }

    if (staffId) {
      await this.audit.log({
        actorType: 'STAFF', actorId: staffId, staffId,
        action: 'RUN_AGENTS', entity: 'RiskSignal',
        afterJson: { year, profiles: profiles.length, signals: written, perAgent, casesUpdated },
      });
    }
    this.logger.log(`Agents complete — profiles: ${profiles.length}, signals: ${written}`);
    return { year, profiles: profiles.length, signals: written, perAgent, agents: AGENTS.map((a) => ({ key: a.key, name: a.name })) };
  }

  async signals(query: { year?: string; taxpayerId?: string; agentKey?: string }) {
    const where: Prisma.RiskSignalWhereInput = {
      ...(query.year ? { year: parseInt(query.year, 10) } : {}),
      ...(query.taxpayerId ? { taxpayerId: query.taxpayerId } : {}),
      ...(query.agentKey ? { agentKey: query.agentKey } : {}),
    };
    return this.prisma.riskSignal.findMany({ where, orderBy: [{ score: 'desc' }], take: 200 });
  }
}
