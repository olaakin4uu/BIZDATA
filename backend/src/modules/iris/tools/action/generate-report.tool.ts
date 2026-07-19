import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ExportService } from '../../export/export.service';
import { DraftProposer } from '../../approval/draft-proposer';
import { ActionTool, CommitResult } from '../../approval/action.types';
import { ToolContext } from '../tool.types';

const num = (d: Prisma.Decimal | null | undefined): number => (d == null ? 0 : Number(d));
const REPORT_CAP = 1000;

/**
 * EXPORT_PII: propose a downloadable report of underdeclaration cases. commit()
 * builds the data and hands it to ExportService, which ENCRYPTS the artifact.
 * The report carries taxpayer names + engine figures (never BVN/NIN/account).
 */
@Injectable()
export class GenerateReportTool implements ActionTool {
  readonly name = 'generate_report';
  readonly kind = 'report';
  readonly sensitivity = 'EXPORT_PII' as const;
  readonly requiredRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDIT_OFFICER'];
  readonly description =
    'Propose generating a downloadable, ENCRYPTED report of underdeclaration cases (pdf, xlsx, or csv). ' +
    'This PREPARES A DRAFT the officer must confirm — it does NOT create the file itself. ' +
    'Only the requesting officer can download the encrypted result.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['pdf', 'xlsx', 'csv'], description: 'Output format.' },
      year: { type: 'integer', description: 'Filter by assessment year. Omit for all.' },
      status: { type: 'string', description: 'Filter by case status. Omit for all.' },
    },
    required: ['format'],
  };

  constructor(
    private proposer: DraftProposer,
    private prisma: PrismaService,
    private exports: ExportService,
  ) {}

  private where(payload: Record<string, unknown>): Prisma.UnderdeclarationCaseWhereInput {
    const year = typeof payload.year === 'number' ? payload.year : undefined;
    const status = typeof payload.status === 'string' ? payload.status : undefined;
    return {
      ...(year ? { year } : {}),
      ...(status ? { status: status as Prisma.UnderdeclarationCaseWhereInput['status'] } : {}),
    };
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const format = (typeof args.format === 'string' ? args.format : 'pdf') as 'pdf' | 'xlsx' | 'csv';
    const count = await this.prisma.underdeclarationCase.count({ where: this.where(args) });
    const scope = args.year ? `${args.year}` : 'all years';
    return this.proposer.propose(ctx, {
      kind: this.kind,
      title: `Generate ${format.toUpperCase()} case report`,
      summary: `Generate an encrypted ${format.toUpperCase()} report of ${Math.min(count, REPORT_CAP)} underdeclaration case(s) (${scope}${args.status ? `, status ${args.status}` : ''}). Only you will be able to download it.`,
      payload: { format, year: args.year ?? null, status: args.status ?? null },
      details: { format, matchingCases: count, capped: count > REPORT_CAP ? REPORT_CAP : count },
    });
  }

  async commit(payload: Record<string, unknown>, ctx: ToolContext): Promise<CommitResult> {
    const format = (typeof payload.format === 'string' ? payload.format : 'pdf') as 'pdf' | 'xlsx' | 'csv';
    const cases = await this.prisma.underdeclarationCase.findMany({
      where: this.where(payload),
      orderBy: { estimatedTaxDue: 'desc' },
      take: REPORT_CAP,
      include: { taxpayer: { select: { businessName: true, firstName: true, lastName: true, type: true } } },
    });

    const rows = cases.map((c) => ({
      taxpayer: c.taxpayer.businessName || [c.taxpayer.firstName, c.taxpayer.lastName].filter(Boolean).join(' ') || '(unnamed)',
      type: c.taxpayer.type,
      year: c.year,
      observed: num(c.observedIncome),
      declared: num(c.declaredIncome),
      discrepancyPct: Math.round(num(c.discrepancyPct) * 100),
      estimatedTax: num(c.estimatedTaxDue),
      confidencePct: Math.round(num(c.confidence) * 100),
      risk: c.riskLevel,
      status: c.status,
    }));

    const result = await this.exports.generate(ctx, {
      format,
      fileName: `iris-cases-${payload.year ?? 'all'}`,
      title: 'Underdeclaration Cases',
      subtitle: `${payload.year ?? 'All years'}${payload.status ? ` · ${payload.status}` : ''} · ${rows.length} cases · CONFIDENTIAL`,
      columns: [
        { key: 'taxpayer', header: 'Taxpayer' },
        { key: 'type', header: 'Type' },
        { key: 'year', header: 'Year' },
        { key: 'observed', header: 'Observed (₦)' },
        { key: 'declared', header: 'Declared (₦)' },
        { key: 'discrepancyPct', header: 'Gap %' },
        { key: 'estimatedTax', header: 'Est. Tax (₦)' },
        { key: 'confidencePct', header: 'Conf %' },
        { key: 'risk', header: 'Risk' },
        { key: 'status', header: 'Status' },
      ],
      rows,
    });

    return {
      message: `Encrypted report ready: ${result.fileName} (${result.rowCount} rows). Download it from the card.`,
      resultRef: result.exportId,
      download: { exportId: result.exportId, fileName: result.fileName },
    };
  }
}
