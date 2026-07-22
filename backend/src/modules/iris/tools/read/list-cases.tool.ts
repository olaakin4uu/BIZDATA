import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ReportableService } from '../../../../common/services/reportable.service';
import { AgentTool, ToolContext } from '../tool.types';

const num = (d: Prisma.Decimal | null | undefined): number => (d == null ? 0 : Number(d));

/**
 * READ tool: list underdeclaration cases. Returns only non-gated fields
 * (taxpayer name + the case figures the detection engine already computed) —
 * never BVN/NIN/account numbers. Runs immediately (no confirm).
 */
@Injectable()
export class ListCasesTool implements AgentTool {
  readonly name = 'list_cases';
  readonly sensitivity = 'READ' as const;
  readonly requiredRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDIT_OFFICER', 'DPO', 'READONLY'];
  readonly description =
    'List underdeclaration cases (highest estimated recoverable tax first). ' +
    'Use to answer "top cases", "cases for year N", "open cases", etc. Returns ' +
    'the taxpayer name and the engine figures (observed vs declared, discrepancy %, ' +
    'confidence, estimated tax due, risk level, status). Does not reveal BVN/NIN/account.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      year: { type: 'integer', description: 'Assessment year, e.g. 2025. Omit for all years.' },
      status: {
        type: 'string',
        enum: ['OPEN', 'UNDER_REVIEW', 'NOTICE_ISSUED', 'OBJECTION', 'CONFIRMED', 'SETTLED', 'RECOVERED', 'DISMISSED', 'CLOSED'],
        description: 'Filter by case status. Omit for all.',
      },
      limit: { type: 'integer', description: 'Max rows returned in this page (default 20, cap 50). The response also carries the TRUE total matching the filter.' },
    },
  };

  constructor(
    private prisma: PrismaService,
    private reportable: ReportableService,
  ) {}

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<unknown> {
    const year = typeof args.year === 'number' ? args.year : undefined;
    const status = typeof args.status === 'string' ? args.status : undefined;
    const limit = Math.min(50, Math.max(1, typeof args.limit === 'number' ? args.limit : 20));

    // §29 gate: IRIS must count/list the same reportable cases the case list,
    // dashboard and tax-net show — never the raw pre-threshold population.
    const reportableIds = [...(await this.reportable.reportableTaxpayerIds(year ? { year } : {}))];
    const where: Prisma.UnderdeclarationCaseWhereInput = {
      taxpayerId: { in: reportableIds },
      ...(year ? { year } : {}),
      ...(status ? { status: status as Prisma.UnderdeclarationCaseWhereInput['status'] } : {}),
    };

    // The TRUE total matching the filter — so IRIS reports "6,855 cases", not
    // the page size. Returned separately from the (capped) page of rows below.
    const [total, cases] = await this.prisma.$transaction([
      this.prisma.underdeclarationCase.count({ where }),
      this.prisma.underdeclarationCase.findMany({
        where,
        orderBy: { estimatedTaxDue: 'desc' },
        take: limit,
        include: {
          taxpayer: { select: { businessName: true, firstName: true, lastName: true, type: true, sector: true } },
        },
      }),
    ]);

    return {
      total, // total cases matching the filter (authoritative count for "how many")
      returned: cases.length, // rows in this page (≤ limit)
      truncated: total > cases.length,
      cases: cases.map((c) => ({
        caseId: c.id,
        taxpayerId: c.taxpayerId,
        taxpayer:
          c.taxpayer.businessName ||
          [c.taxpayer.firstName, c.taxpayer.lastName].filter(Boolean).join(' ') ||
          '(unnamed)',
        taxpayerType: c.taxpayer.type,
        sector: c.taxpayer.sector,
        year: c.year,
        observedIncome: num(c.observedIncome),
        declaredIncome: num(c.declaredIncome),
        discrepancyPct: num(c.discrepancyPct),
        estimatedTaxDue: num(c.estimatedTaxDue),
        confidence: num(c.confidence),
        riskLevel: c.riskLevel,
        status: c.status,
        providerCount: c.providerCount,
      })),
    };
  }
}
