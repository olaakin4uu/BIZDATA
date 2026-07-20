import { Injectable } from '@nestjs/common';
import { Prisma, CaseStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CasesService } from '../../../cases/cases.service';
import { DraftProposer } from '../../approval/draft-proposer';
import { ActionTool, CommitResult } from '../../approval/action.types';
import { ToolContext } from '../tool.types';

const num = (d: Prisma.Decimal | null | undefined): number => (d == null ? 0 : Number(d));

/**
 * CROSS_ORG: propose issuing a §35 Best-of-Judgement assessment notice on a case.
 * execute() prepares a draft showing the engine's figures; commit() calls
 * CasesService.transition(→ NOTICE_ISSUED), which computes the binding assessment
 * (tax + 10% penalty, 30-day objection window). The LLM never composes the figures.
 */
@Injectable()
export class DraftNoticeTool implements ActionTool {
  readonly name = 'draft_notice';
  readonly kind = 'notice';
  readonly sensitivity = 'CROSS_ORG' as const;
  readonly requiredRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];
  readonly description =
    'Propose issuing a §35 Best-of-Judgement assessment notice on an underdeclaration case. ' +
    'This PREPARES A DRAFT the officer must confirm — it does NOT issue the notice. ' +
    'The binding assessment (tax + penalty) is computed by the engine, not by you. ' +
    'The case must be in UNDER_REVIEW to issue a notice. ' +
    'You MAY draft a short, professional cover narrative in coverText for the officer to review — ' +
    'but do NOT state any tax amounts, penalties, or figures in it; the engine fills those in.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      caseId: { type: 'string', description: 'The underdeclaration case id to issue a §35 notice on.' },
      coverText: {
        type: 'string',
        description: 'Optional professional cover narrative for the notice (no figures — the engine computes those). The officer reviews it before issuing.',
      },
    },
    required: ['caseId'],
  };

  constructor(
    private proposer: DraftProposer,
    private prisma: PrismaService,
    private cases: CasesService,
  ) {}

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const caseId = typeof args.caseId === 'string' ? args.caseId : '';
    if (!caseId) throw new Error('A caseId is required.');
    const c = await this.prisma.underdeclarationCase.findUnique({
      where: { id: caseId },
      include: { taxpayer: { select: { businessName: true, firstName: true, lastName: true } } },
    });
    if (!c) throw new Error(`Case ${caseId} not found.`);

    const taxpayer = c.taxpayer.businessName || [c.taxpayer.firstName, c.taxpayer.lastName].filter(Boolean).join(' ') || '(unnamed)';
    const readyNote = c.status === 'UNDER_REVIEW' ? '' : ` NOTE: the case is currently ${c.status}; it must be moved to UNDER_REVIEW before a notice can be issued.`;
    const coverText = typeof args.coverText === 'string' ? args.coverText.trim() : '';

    return this.proposer.propose(ctx, {
      kind: this.kind,
      title: `Issue §35 notice — ${taxpayer}`,
      summary:
        `Issue a §35 Best-of-Judgement assessment notice on ${taxpayer} (case ${c.id}, ${c.year}). ` +
        `Estimated tax due ₦${Math.round(num(c.estimatedTaxDue)).toLocaleString()}; a 10% late-payment penalty is added and a 30-day objection window opens on confirmation.` +
        readyNote,
      payload: { caseId: c.id, coverText },
      details: {
        taxpayer,
        year: c.year,
        estimatedTaxDue: num(c.estimatedTaxDue),
        confidencePct: Math.round(num(c.confidence) * 100),
        currentStatus: c.status,
        ...(coverText ? { coverNarrative: coverText } : {}),
      },
    });
  }

  async commit(payload: Record<string, unknown>, ctx: ToolContext): Promise<CommitResult> {
    const caseId = String(payload.caseId);
    const coverText = typeof payload.coverText === 'string' && payload.coverText.trim() ? payload.coverText.trim() : undefined;
    const updated = await this.cases.transition(caseId, { to: CaseStatus.NOTICE_ISSUED, notes: coverText }, ctx.staff.id);
    const ref = (updated as { demandNoticeRef?: string | null }).demandNoticeRef;
    return {
      message: `§35 notice issued on case ${caseId}${ref ? ` (ref ${ref})` : ''}. The taxpayer's 30-day objection window has started.`,
      resultRef: caseId,
    };
  }
}
