import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { BenchmarkingService } from './benchmarking.service';
import { ReportableService } from '../../common/services/reportable.service';
import { AGENTS } from './registry';
import { TaxpayerProfile, AgentContext, severityFor, clamp01 } from './agent.types';
import { aggregateAgentScore, compositeConfidence, confidenceToRisk } from '../scan/detection-engine';
import { inferSector } from './implementations/sector-classification.agent';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private benchmarking: BenchmarkingService,
    private reportable: ReportableService,
  ) {}

  /** Build one profile per taxpayer for the year from bank-report aggregates. */
  private async buildProfiles(year: number): Promise<TaxpayerProfile[]> {
    // STATUTORY REPORTING THRESHOLD — agents only profile reportable taxpayers,
    // so no signal is ever raised for a below-threshold party. Compute this set
    // FIRST and scope the record query to it: at scale the data_records table has
    // millions of rows but only the reportable taxpayers' records are needed, so
    // fetching all-then-filtering would load the whole table into memory (OOM).
    const reportableIds = await this.reportable.reportableTaxpayerIds({ year });
    if (reportableIds.size === 0) return [];
    const records = await this.prisma.dataRecord.findMany({
      where: { periodYear: year, taxpayerId: { in: [...reportableIds] } },
      select: {
        taxpayerId: true, providerId: true, providerType: true, periodLabel: true, periodYear: true,
        totalInflow: true, totalOutflow: true, openingBalance: true, closingBalance: true,
        transactionCount: true, matchConfidence: true, accountName: true, accountNumber: true,
        bvn: true, payload: true,
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
          accountNumber: r.accountNumber ?? null,
          bvn: r.bvn ?? null,
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
    // §29 thresholds from the active StatutoryConfig (authoritative ₦50m/₦250m),
    // so structuring detection tracks the real statutory lines. GOVERNMENT reuses
    // the corporate line (it is not the target of §29 structuring).
    const t29 = await this.reportable.thresholds();
    const ctx: AgentContext = {
      benchmarks: this.benchmarking.build(profiles),
      section29Thresholds: {
        INDIVIDUAL: t29.individual,
        CORPORATE: t29.corporate,
        GOVERNMENT: t29.corporate,
      },
    };

    // Persist the inferred sector back to each taxpayer so sector-by-sector
    // analytics has data to work with. Runs for ALL profiles (not just those the
    // sector agent flags), guaranteeing full coverage. A provider-supplied sector
    // is authoritative, so we only fill in where the taxpayer has none yet.
    let sectorsWritten = 0;
    const needSector = await this.prisma.taxpayer.findMany({
      where: { sector: null, id: { in: profiles.map((p) => p.taxpayerId) } },
      select: { id: true },
    });
    const needSet = new Set(needSector.map((t) => t.id));
    for (const profile of profiles) {
      if (!needSet.has(profile.taxpayerId)) continue; // keep provider-supplied sector
      try {
        const { sector } = inferSector(profile);
        if (sector) {
          await this.prisma.taxpayer.update({
            where: { id: profile.taxpayerId },
            data: { sector },
          });
          sectorsWritten++;
        }
      } catch { /* skip taxpayers that fail inference */ }
    }
    this.logger.log(`Sectors persisted (inferred, only where empty): ${sectorsWritten}`);

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

  async signals(query: { year?: string; taxpayerId?: string; agentKey?: string; severity?: string; page?: string; limit?: string }) {
    const yr = query.year ? parseInt(query.year, 10) : undefined;
    // Reportable-gated WHERE built for raw SQL: the reportable id set is passed
    // as a single `= ANY($1::text[])` bind, not a Prisma `in` list (which trips
    // Postgres' ~32k parameter cap / P2029 once the reportable population is
    // large). A taxpayer-scoped request (e.g. their own 360 view) skips the gate.
    const conds: Prisma.Sql[] = [];
    if (yr) conds.push(Prisma.sql`s."year" = ${yr}`);
    if (query.agentKey) conds.push(Prisma.sql`s."agentKey" = ${String(query.agentKey)}`);
    if (query.severity) conds.push(Prisma.sql`s."severity"::text = ${String(query.severity)}`);
    if (query.taxpayerId) {
      conds.push(Prisma.sql`s."taxpayerId" = ${String(query.taxpayerId)}`);
    } else {
      const ids = [...(await this.reportable.reportableTaxpayerIds(yr ? { year: yr } : {}))];
      conds.push(Prisma.sql`s."taxpayerId" = ANY(${ids}::text[])`);
    }
    const whereSql = conds.length ? Prisma.join(conds, ' AND ') : Prisma.sql`TRUE`;

    // Back-compat: callers that don't request pagination (dashboard, case/360
    // views) get the plain array. Only the Agent Signals page passes page/limit
    // and receives the rich { signals, total, page, limit } shape.
    if (!query.page && !query.limit) {
      const idRows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT s."id" FROM risk_signals s WHERE ${whereSql} ORDER BY s."score" DESC LIMIT 200`,
      );
      const ids = idRows.map((r) => r.id);
      if (!ids.length) return [];
      return this.prisma.riskSignal.findMany({ where: { id: { in: ids } }, orderBy: [{ score: 'desc' }] });
    }

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));
    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT s."id" FROM risk_signals s WHERE ${whereSql} ORDER BY s."score" DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      ),
      this.prisma.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM risk_signals s WHERE ${whereSql}`,
      ),
    ]);
    const total = Number(countRows[0]?.count ?? 0);
    const pageIds = idRows.map((r) => r.id);
    const rows = pageIds.length
      ? await this.prisma.riskSignal.findMany({
          where: { id: { in: pageIds } },
          orderBy: [{ score: 'desc' }],
          include: {
            taxpayer: { select: { id: true, businessName: true, firstName: true, lastName: true, type: true, sector: true } },
          },
        })
      : [];
    const signals = rows.map((r) => ({
      id: r.id, taxpayerId: r.taxpayerId, year: r.year, agentKey: r.agentKey,
      score: r.score, severity: r.severity, summary: r.summary, createdAt: r.createdAt,
      taxpayerName: r.taxpayer.type === 'CORPORATE'
        ? (r.taxpayer.businessName ?? '—')
        : [r.taxpayer.firstName, r.taxpayer.lastName].filter(Boolean).join(' ') || '—',
      taxpayerType: r.taxpayer.type,
      sector: r.taxpayer.sector,
    }));
    return { signals, total, page, limit };
  }

  /** Signal counts by agent + severity, for the summary strip. */
  async signalSummary(year?: number) {
    // Reportable set as a single `= ANY($1::text[])` bind (Prisma `in` trips the
    // ~32k parameter cap / P2029 at scale — see signals()). Grouped in SQL.
    const ids = [...(await this.reportable.reportableTaxpayerIds(year ? { year } : {}))];
    const yrSql = year ? Prisma.sql` AND s."year" = ${year}` : Prisma.empty;
    const whereSql = Prisma.sql`s."taxpayerId" = ANY(${ids}::text[])${yrSql}`;
    const [byAgent, bySeverity] = await Promise.all([
      this.prisma.$queryRaw<{ agentKey: string; c: bigint }[]>(
        Prisma.sql`SELECT s."agentKey" AS "agentKey", COUNT(*)::bigint AS c FROM risk_signals s WHERE ${whereSql} GROUP BY s."agentKey"`,
      ),
      this.prisma.$queryRaw<{ severity: string; c: bigint }[]>(
        Prisma.sql`SELECT s."severity" AS severity, COUNT(*)::bigint AS c FROM risk_signals s WHERE ${whereSql} GROUP BY s."severity"`,
      ),
    ]);
    return {
      total: byAgent.reduce((s, a) => s + Number(a.c), 0),
      byAgent: byAgent.map((a) => ({ agentKey: a.agentKey, count: Number(a.c) })),
      bySeverity: bySeverity.map((s) => ({ severity: s.severity, count: Number(s.c) })),
    };
  }
}
