import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { CaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CasesService } from '../cases/cases.service';
import { LlmFactory } from '../iris/llm/llm.factory';

/**
 * IRIS Case Triage. For a set of cases it gathers the real facts DETERMINISTICALLY
 * (figures + presence flags only — never the taxpayer's name or identifiers), asks
 * Claude for a structured recommendation, and records it. An officer approves a
 * recommendation to execute the case transition through the UNCHANGED path, so
 * the engine still computes every assessment and every state change is audited.
 * The model recommends the ACTION and writes the rationale — never the figures.
 */

type Action = 'ADVANCE_REVIEW' | 'DISMISS' | 'REQUEST_DATA' | 'ISSUE_NOTICE' | 'HOLD';
const ACTIONS: Action[] = ['ADVANCE_REVIEW', 'DISMISS', 'REQUEST_DATA', 'ISSUE_NOTICE', 'HOLD'];

/** Actions valid to RECOMMEND for a given current status. */
const ALLOWED: Record<string, Action[]> = {
  OPEN: ['ADVANCE_REVIEW', 'DISMISS', 'REQUEST_DATA', 'HOLD'],
  UNDER_REVIEW: ['ISSUE_NOTICE', 'DISMISS', 'REQUEST_DATA', 'HOLD'],
};
/** Actions that map to an executable transition. */
const APPLY_TO: Partial<Record<Action, CaseStatus>> = {
  ADVANCE_REVIEW: CaseStatus.UNDER_REVIEW,
  DISMISS: CaseStatus.DISMISSED,
  ISSUE_NOTICE: CaseStatus.NOTICE_ISSUED,
};

const TRIAGE_SYSTEM =
  'You are IRIS Case Triage, an enforcement analyst for a Nigerian revenue authority (FinData) operating under NTAA 2025. ' +
  'For one underdeclaration case you recommend the single best NEXT ACTION for the officer, given the figures provided. ' +
  'You NEVER compute or invent figures — the engine already did; you reason over what you are given. ' +
  'Actions: ADVANCE_REVIEW (move an OPEN case to officer review when the discrepancy warrants scrutiny); ' +
  'DISMISS (close a weak case — low confidence and/or a small discrepancy); ' +
  'REQUEST_DATA (evidence is too thin to act — e.g. a single provider, or missing taxpayer identity); ' +
  'ISSUE_NOTICE (only for a case ALREADY under review with strong, well-corroborated evidence — recommend a §35 Best-of-Judgement assessment); ' +
  'HOLD (unclear — leave for the officer). ' +
  'Only choose from the ALLOWED actions listed for the case. Be conservative: never DISMISS a high-confidence, large-gap case, and never recommend ISSUE_NOTICE on thin or single-provider evidence. ' +
  'A human officer approves before anything happens — your job is a well-reasoned recommendation, not an action.';

const RECOMMENDATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ACTIONS },
    confidence: { type: 'number' },
    priority: { type: 'number' },
    rationale: { type: 'string' },
    keyEvidence: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    statutoryNotes: { type: 'string' },
  },
  required: ['action', 'confidence', 'priority', 'rationale', 'keyEvidence', 'risks', 'statutoryNotes'],
} as const;

interface CaseRow {
  id: string;
  year: number;
  status: string;
  riskLevel: string;
  confidence: Prisma.Decimal | null;
  agentScore: Prisma.Decimal | null;
  observedIncome: Prisma.Decimal | null;
  declaredIncome: Prisma.Decimal | null;
  discrepancyAmount: Prisma.Decimal | null;
  discrepancyPct: Prisma.Decimal | null;
  estimatedTaxDue: Prisma.Decimal | null;
  altTaxDue: Prisma.Decimal | null;
  taxBasis: string | null;
  providerCount: number;
  reasons: unknown;
  createdAt: Date;
  taxpayerId: string;
  taxpayer?: { businessName: string | null; firstName: string | null; lastName: string | null; type: string; stateOfResidence: string | null; tin: string | null; nin: string | null } | null;
}

interface Scope {
  status?: CaseStatus;
  riskLevel?: string;
  year?: number;
  assignedToMe?: boolean;
  limit?: number;
  /** Exclude cases that already have an outstanding (pending) or skipped
   *  recommendation — lets repeated runs work through the whole backlog. */
  skipTriaged?: boolean;
}

const num = (d: Prisma.Decimal | null | undefined): number => (d == null ? 0 : Number(d));
const naira = (d: Prisma.Decimal | null | undefined): string => `₦${Math.round(num(d)).toLocaleString('en-NG')}`;
const pct = (d: Prisma.Decimal | null | undefined): string => `${Math.round(num(d) * 100)}%`;

function displayName(t?: CaseRow['taxpayer']): string {
  if (!t) return '(unnamed)';
  return t.businessName || [t.firstName, t.lastName].filter(Boolean).join(' ') || '(unnamed)';
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private cases: CasesService,
    private llm: LlmFactory,
  ) {}

  private allowedFor(status: string): Action[] {
    return ALLOWED[status] ?? ['HOLD'];
  }

  /** Facts sent to the model — figures + presence flags only, ZERO PII. */
  private buildFacts(c: CaseRow, priorCases: number): string {
    const t = c.taxpayer;
    const reasons = Array.isArray(c.reasons)
      ? (c.reasons as { code?: string; label?: string; weight?: number }[])
          .map((r) => `  - ${r.label ?? r.code ?? 'signal'} (weight ${r.weight ?? 0})`)
          .join('\n')
      : '  (none recorded)';
    const days = Math.round((Date.now() - new Date(c.createdAt).getTime()) / 86_400_000);
    const lines = [
      `Current status: ${c.status}`,
      `Allowed actions: ${this.allowedFor(c.status).join(', ')}`,
      `Tax year: ${c.year}`,
      `Taxpayer type: ${t?.type ?? 'unknown'}; state: ${t?.stateOfResidence ?? 'unknown'}`,
      `Identity on file: TIN ${t?.tin ? 'yes' : 'no'}, NIN ${t?.nin ? 'yes' : 'no'}`,
      `Observed income: ${naira(c.observedIncome)}`,
      `Declared income: ${naira(c.declaredIncome)}`,
      `Discrepancy: ${naira(c.discrepancyAmount)} (${pct(c.discrepancyPct)} of observed)`,
      `Estimated tax due: ${naira(c.estimatedTaxDue)}${c.altTaxDue ? ` (alt basis ${naira(c.altTaxDue)})` : ''}; basis ${c.taxBasis ?? 'PIT_GRADUATED'}`,
      `Detection confidence: ${pct(c.confidence)}${c.agentScore != null ? `; agent score ${pct(c.agentScore)}` : ''}`,
      `Risk level: ${c.riskLevel}`,
      `Corroborating providers: ${c.providerCount}`,
      `Prior cases for this taxpayer: ${priorCases}`,
      `Days since detected: ${days}`,
      `Detection reasons:\n${reasons}`,
    ];
    return lines.join('\n');
  }

  private heuristic(c: CaseRow): { action: Action; confidence: number; priority: number; rationale: string; keyEvidence: string[]; risks: string[]; statutoryNotes: string } {
    const conf = num(c.confidence);
    const gap = num(c.discrepancyPct);
    const allowed = this.allowedFor(c.status);
    let action: Action = 'HOLD';
    if (c.providerCount <= 1 || !c.taxpayer?.nin) action = 'REQUEST_DATA';
    else if (conf < 0.4 || gap < 0.2) action = 'DISMISS';
    else if (c.status === 'UNDER_REVIEW' && conf >= 0.75 && gap >= 0.3) action = 'ISSUE_NOTICE';
    else if (c.status === 'OPEN') action = 'ADVANCE_REVIEW';
    if (!allowed.includes(action)) action = 'HOLD';
    return {
      action,
      confidence: conf,
      priority: Math.round(conf * 100),
      rationale: 'Rule-based recommendation (AI offline): based on detection confidence, discrepancy size, provider corroboration and identity coverage.',
      keyEvidence: [`Discrepancy ${pct(c.discrepancyPct)}`, `Confidence ${pct(c.confidence)}`, `${c.providerCount} provider(s)`],
      risks: c.providerCount <= 1 ? ['Single-provider evidence — corroboration is thin.'] : [],
      statutoryNotes: 'Figures are engine-computed under NTAA 2025 §35. Verify before issuing any notice.',
    };
  }

  private async recommendFor(c: CaseRow, priorCases: number): Promise<Omit<ReturnType<TriageService['heuristic']>, never>> {
    const allowed = this.allowedFor(c.status);
    if (!this.llm.enabled) return this.clampAction(this.heuristic(c), allowed);
    try {
      const client = this.llm.create();
      const req = {
        model: this.llm.model,
        max_tokens: 1200,
        system: TRIAGE_SYSTEM,
        messages: [{ role: 'user', content: `Case facts:\n${this.buildFacts(c, priorCases)}\n\nReturn one recommendation as JSON.` }],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low', format: { type: 'json_schema', schema: RECOMMENDATION_SCHEMA } },
      } as unknown as Anthropic.MessageCreateParamsNonStreaming;
      const res = await client.messages.create(req);
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const p = JSON.parse(text);
      const rec = {
        action: (ACTIONS.includes(p.action) ? p.action : 'HOLD') as Action,
        confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : num(c.confidence),
        priority: typeof p.priority === 'number' ? Math.max(0, Math.min(100, Math.round(p.priority))) : Math.round(num(c.confidence) * 100),
        rationale: String(p.rationale ?? '').slice(0, 4000),
        keyEvidence: Array.isArray(p.keyEvidence) ? p.keyEvidence.map(String).slice(0, 8) : [],
        risks: Array.isArray(p.risks) ? p.risks.map(String).slice(0, 8) : [],
        statutoryNotes: String(p.statutoryNotes ?? '').slice(0, 1000),
      };
      return this.clampAction(rec, allowed);
    } catch (e) {
      this.logger.warn(`Triage fell back to heuristic for case ${c.id}: ${(e as Error).message}`);
      return this.clampAction(this.heuristic(c), allowed);
    }
  }

  /** Never recommend an action the case's status doesn't permit. */
  private clampAction(rec: ReturnType<TriageService['heuristic']>, allowed: Action[]): ReturnType<TriageService['heuristic']> {
    if (allowed.includes(rec.action)) return rec;
    // A model that suggested ISSUE_NOTICE on an OPEN case really means "advance it".
    const fallback: Action = rec.action === 'ISSUE_NOTICE' && allowed.includes('ADVANCE_REVIEW') ? 'ADVANCE_REVIEW' : 'HOLD';
    return { ...rec, action: fallback, risks: [...rec.risks, `Original suggestion "${rec.action}" is not valid from status; using "${fallback}".`] };
  }

  private async persist(c: CaseRow, staffId: string, runId: string | null, rec: ReturnType<TriageService['heuristic']>) {
    // Supersede any prior pending recommendation for this case.
    await this.prisma.triageRecommendation.updateMany({ where: { caseId: c.id, status: 'PENDING' }, data: { status: 'SUPERSEDED' } });
    return this.prisma.triageRecommendation.create({
      data: {
        runId,
        caseId: c.id,
        staffId,
        action: rec.action,
        confidence: rec.confidence,
        priority: rec.priority,
        rationale: rec.rationale,
        keyEvidence: rec.keyEvidence as unknown as Prisma.InputJsonValue,
        risks: rec.risks as unknown as Prisma.InputJsonValue,
        statutoryNotes: rec.statutoryNotes,
        model: this.llm.enabled ? this.llm.model : 'heuristic',
        status: 'PENDING',
      },
    });
  }

  private snapshot(c: CaseRow) {
    return {
      caseId: c.id,
      taxpayer: displayName(c.taxpayer),
      year: c.year,
      status: c.status,
      riskLevel: c.riskLevel,
      estimatedTaxDue: num(c.estimatedTaxDue),
      discrepancyPct: num(c.discrepancyPct),
      confidence: num(c.confidence),
    };
  }

  private caseSelect() {
    return {
      id: true, year: true, status: true, riskLevel: true, confidence: true, agentScore: true,
      observedIncome: true, declaredIncome: true, discrepancyAmount: true, discrepancyPct: true,
      estimatedTaxDue: true, altTaxDue: true, taxBasis: true, providerCount: true, reasons: true,
      createdAt: true, taxpayerId: true,
      taxpayer: { select: { businessName: true, firstName: true, lastName: true, type: true, stateOfResidence: true, tin: true, nin: true } },
    } as const;
  }

  private async priorCountsFor(taxpayerIds: string[]): Promise<Map<string, number>> {
    if (taxpayerIds.length === 0) return new Map();
    const grouped = await this.prisma.underdeclarationCase.groupBy({ by: ['taxpayerId'], where: { taxpayerId: { in: taxpayerIds } }, _count: { _all: true } });
    return new Map(grouped.map((g) => [g.taxpayerId, g._count._all]));
  }

  /** Batch triage a caseload → ranked recommendations. */
  async run(staffId: string, scope: Scope) {
    const limit = Math.min(Math.max(scope.limit ?? 20, 1), 40);
    const where: Prisma.UnderdeclarationCaseWhereInput = {
      status: scope.status ? scope.status : { in: [CaseStatus.OPEN, CaseStatus.UNDER_REVIEW] },
      ...(scope.riskLevel ? { riskLevel: scope.riskLevel as any } : {}),
      ...(scope.year ? { year: scope.year } : {}),
      ...(scope.assignedToMe ? { assignedToId: staffId } : {}),
    };
    // Incremental coverage: skip cases already carrying a decision-pending or
    // officer-skipped recommendation, so a sweep converges on the whole backlog.
    if (scope.skipTriaged) {
      const triaged = await this.prisma.triageRecommendation.findMany({
        where: { status: { in: ['PENDING', 'SKIPPED'] } },
        select: { caseId: true },
        distinct: ['caseId'],
      });
      if (triaged.length) where.id = { notIn: triaged.map((t) => t.caseId) };
    }
    const rows = (await this.prisma.underdeclarationCase.findMany({
      where,
      orderBy: { estimatedTaxDue: 'desc' },
      take: limit,
      select: this.caseSelect(),
    })) as unknown as CaseRow[];
    if (rows.length === 0) return { runId: null, count: 0, recommendations: [] };

    const priors = await this.priorCountsFor(rows.map((r) => r.taxpayerId));
    const runId = randomUUID();

    // Bounded concurrency so a big batch stays responsive without hammering the LLM.
    const CONC = 5;
    const out: { rec: any; row: CaseRow }[] = [];
    for (let i = 0; i < rows.length; i += CONC) {
      const slice = rows.slice(i, i + CONC);
      const done = await Promise.all(
        slice.map(async (row) => {
          const rec = await this.recommendFor(row, priors.get(row.taxpayerId) ?? 0);
          const saved = await this.persist(row, staffId, runId, rec);
          return { rec: { ...saved, keyEvidence: rec.keyEvidence, risks: rec.risks, caseSnapshot: this.snapshot(row) }, row };
        }),
      );
      out.push(...done);
    }
    out.sort((a, b) => b.rec.priority - a.rec.priority);
    return { runId, count: out.length, recommendations: out.map((o) => o.rec) };
  }

  /** Single-case deep-dive. */
  async investigate(staffId: string, caseId: string) {
    const row = (await this.prisma.underdeclarationCase.findUnique({ where: { id: caseId }, select: this.caseSelect() })) as unknown as CaseRow | null;
    if (!row) throw new NotFoundException('Case not found.');
    const priors = (await this.priorCountsFor([row.taxpayerId])).get(row.taxpayerId) ?? 0;
    const rec = await this.recommendFor(row, priors);
    const saved = await this.persist(row, staffId, null, rec);
    return { ...saved, keyEvidence: rec.keyEvidence, risks: rec.risks, caseSnapshot: this.snapshot(row) };
  }

  async list(query: { status?: string; runId?: string; caseId?: string }) {
    const recs = await this.prisma.triageRecommendation.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.runId ? { runId: query.runId } : {}),
        ...(query.caseId ? { caseId: query.caseId } : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    const rows = (await this.prisma.underdeclarationCase.findMany({ where: { id: { in: recs.map((r) => r.caseId) } }, select: this.caseSelect() })) as unknown as CaseRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return recs.map((r) => ({ ...r, caseSnapshot: byId.get(r.caseId) ? this.snapshot(byId.get(r.caseId)!) : null }));
  }

  /** Officer approves → execute the transition through the normal, audited path. */
  async apply(staff: { id: string }, recId: string) {
    const rec = await this.prisma.triageRecommendation.findUnique({ where: { id: recId } });
    if (!rec) throw new NotFoundException('Recommendation not found.');
    if (rec.status !== 'PENDING') throw new BadRequestException(`This recommendation is already ${rec.status.toLowerCase()}.`);
    const target = APPLY_TO[rec.action as Action];
    if (!target) throw new BadRequestException('This recommendation has no automatic action — handle it manually.');

    const notes = rec.action === 'ISSUE_NOTICE' ? rec.rationale : `IRIS triage — ${rec.action.replace(/_/g, ' ').toLowerCase()}`;
    const updatedCase = await this.cases.transition(rec.caseId, { to: target, notes }, staff.id);

    const updatedRec = await this.prisma.triageRecommendation.update({
      where: { id: rec.id },
      data: { status: 'APPLIED', appliedTo: target, appliedById: staff.id },
    });
    await this.audit.log({
      actorType: 'STAFF',
      staffId: staff.id,
      action: 'TRIAGE_APPLIED',
      entity: 'UnderdeclarationCase',
      entityId: rec.caseId,
      afterJson: { recommendationId: rec.id, recommendedAction: rec.action, appliedTo: target },
    });
    return { recommendation: updatedRec, case: updatedCase };
  }

  async skip(staff: { id: string }, recId: string) {
    const rec = await this.prisma.triageRecommendation.findUnique({ where: { id: recId } });
    if (!rec) throw new NotFoundException('Recommendation not found.');
    if (rec.status !== 'PENDING') return { status: rec.status };
    await this.prisma.triageRecommendation.update({ where: { id: rec.id }, data: { status: 'SKIPPED' } });
    return { status: 'SKIPPED' };
  }
}
