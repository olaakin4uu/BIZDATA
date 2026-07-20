import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentTool, ToolContext } from '../tool.types';

const num = (d: Prisma.Decimal | null | undefined): number => (d == null ? 0 : Number(d));

/** READ: a Taxpayer-360 style summary — declared income by year, cases, AI risk
 *  signals, and PAYE status. Lookup by id or by name. Never reveals BVN/NIN/account. */
@Injectable()
export class TaxpayerSummaryTool implements AgentTool {
  readonly name = 'taxpayer_summary';
  readonly sensitivity = 'READ' as const;
  readonly requiredRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDIT_OFFICER', 'DPO', 'READONLY'];
  readonly description =
    'Summarise one taxpayer: declared income by year, their underdeclaration cases, ' +
    'AI risk signals, risk score, and PAYE registration status. Look up by taxpayerId ' +
    '(from a case) or by name. If a name matches several taxpayers, they are listed for you to pick.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      taxpayerId: { type: 'string', description: 'Exact taxpayer id (preferred).' },
      name: { type: 'string', description: 'Business or person name to search (used if no id).' },
    },
  };

  constructor(private prisma: PrismaService) {}

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
    const id = typeof args.taxpayerId === 'string' ? args.taxpayerId : '';
    const name = typeof args.name === 'string' ? args.name.trim() : '';

    let taxpayerId = id;
    if (!taxpayerId) {
      if (!name) throw new Error('Provide a taxpayerId or a name.');
      const matches = await this.prisma.taxpayer.findMany({
        where: {
          OR: [
            { businessName: { contains: name, mode: 'insensitive' } },
            { firstName: { contains: name, mode: 'insensitive' } },
            { lastName: { contains: name, mode: 'insensitive' } },
          ],
        },
        select: { id: true, businessName: true, firstName: true, lastName: true, type: true },
        take: 6,
      });
      if (matches.length === 0) return { found: false, message: `No taxpayer matches "${name}".` };
      if (matches.length > 1) {
        return {
          found: false,
          ambiguous: true,
          message: `Several taxpayers match "${name}" — ask the user which one, then call again with the taxpayerId.`,
          candidates: matches.map((m) => ({
            taxpayerId: m.id,
            taxpayer: m.businessName || [m.firstName, m.lastName].filter(Boolean).join(' ') || '(unnamed)',
            type: m.type,
          })),
        };
      }
      taxpayerId = matches[0].id;
    }

    const t = await this.prisma.taxpayer.findUnique({
      where: { id: taxpayerId },
      include: {
        declaredIncomes: { orderBy: { year: 'desc' }, take: 6 },
        cases: { orderBy: { year: 'desc' }, take: 10 },
        riskSignals: { orderBy: { score: 'desc' }, take: 8 },
      },
    });
    if (!t) return { found: false, message: `Taxpayer ${taxpayerId} not found.` };

    return {
      found: true,
      taxpayerId: t.id,
      taxpayer: t.businessName || [t.firstName, t.lastName].filter(Boolean).join(' ') || '(unnamed)',
      type: t.type,
      sector: t.sector,
      status: t.status,
      riskScore: t.riskScore,
      riskLevel: t.riskLevel,
      payeStatus: t.payeStatus,
      declaredIncome: t.declaredIncomes.map((d) => ({ year: d.year, assessableIncome: num(d.assessableIncome), source: d.source })),
      cases: t.cases.map((c) => ({
        caseId: c.id,
        year: c.year,
        estimatedTaxDue: num(c.estimatedTaxDue),
        confidencePct: Math.round(num(c.confidence) * 100),
        riskLevel: c.riskLevel,
        status: c.status,
      })),
      aiSignals: t.riskSignals.map((s) => ({ agent: s.agentKey, year: s.year, score: Math.round(num(s.score) * 100), severity: s.severity, summary: s.summary })),
    };
  }
}
