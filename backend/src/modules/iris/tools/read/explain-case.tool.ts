import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentTool, ToolContext } from '../tool.types';

const num = (d: Prisma.Decimal | null | undefined): number => (d == null ? 0 : Number(d));

/** READ: deep explanation of one case — the reason codes, figures, confidence,
 *  AI corroboration, and §35/§41 dates. Never reveals BVN/NIN/account. */
@Injectable()
export class ExplainCaseTool implements AgentTool {
  readonly name = 'explain_case';
  readonly sensitivity = 'READ' as const;
  readonly requiredRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDIT_OFFICER', 'DPO', 'READONLY'];
  readonly description =
    'Explain one underdeclaration case in depth: the reason codes behind the flag, ' +
    'observed vs declared income, discrepancy %, detection confidence, AI corroboration, ' +
    'risk level, status, and any §35 assessment / §41 objection dates. Use after list_cases ' +
    'or when the user asks about a specific case.';
  readonly inputSchema = {
    type: 'object',
    properties: { caseId: { type: 'string', description: 'The underdeclaration case id.' } },
    required: ['caseId'],
  };

  constructor(private prisma: PrismaService) {}

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
    const caseId = typeof args.caseId === 'string' ? args.caseId : '';
    if (!caseId) throw new Error('A caseId is required.');
    const c = await this.prisma.underdeclarationCase.findUnique({
      where: { id: caseId },
      include: { taxpayer: { select: { businessName: true, firstName: true, lastName: true, type: true, sector: true } } },
    });
    if (!c) throw new Error(`Case ${caseId} not found.`);

    return {
      caseId: c.id,
      taxpayer: c.taxpayer.businessName || [c.taxpayer.firstName, c.taxpayer.lastName].filter(Boolean).join(' ') || '(unnamed)',
      taxpayerType: c.taxpayer.type,
      sector: c.taxpayer.sector,
      year: c.year,
      observedIncome: num(c.observedIncome),
      declaredIncome: num(c.declaredIncome),
      discrepancyAmount: num(c.discrepancyAmount),
      discrepancyPct: Math.round(num(c.discrepancyPct) * 100),
      estimatedTaxDue: num(c.estimatedTaxDue),
      detectionConfidencePct: Math.round(num(c.confidence) * 100),
      aiCorroborationPct: c.agentScore != null ? Math.round(num(c.agentScore) * 100) : null,
      riskLevel: c.riskLevel,
      providerCount: c.providerCount,
      engineVersion: c.engineVersion,
      reasonCodes: c.reasons ?? [],
      status: c.status,
      assessedTax: num(c.assessedTax),
      penaltyAmount: num(c.penaltyAmount),
      assessedTotal: num(c.assessedTotal),
      demandNoticeRef: c.demandNoticeRef,
      noticeIssuedAt: c.noticeIssuedAt,
      objectionDueAt: c.objectionDueAt,
      authorityResponseDueAt: c.authorityResponseDueAt,
      recoveredAmount: num(c.recoveredAmount),
    };
  }
}
