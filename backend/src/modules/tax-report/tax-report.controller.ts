import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TaxReportService } from './tax-report.service';
import { renderTaxReportHtml } from './tax-report.html';
import { StaffAuthGuard } from '../../common/guards/staff-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStaff } from '../../common/decorators/current-staff.decorator';
import { ApiKeyGuard } from '../integration/api-key.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessAssignmentService } from '../access/access-assignment.service';
import { AccessGrantTokenService } from '../access/access-grant-token.service';
import { ExportService } from '../iris/export/export.service';

// Staff-facing: the per-customer tax report + manual payment entry.
@ApiTags('Tax Report')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RolesGuard)
@Controller()
export class TaxReportController {
  constructor(
    private svc: TaxReportService,
    private prisma: PrismaService,
    private access: AccessAssignmentService,
    private grant: AccessGrantTokenService,
    private exportSvc: ExportService,
  ) {}

  @Get('taxpayers/:id/tax-report')
  @ApiOperation({ summary: 'AI tax report for a taxpayer (income, per-type tax cards, cross-provider breakdown, agent signals)' })
  byTaxpayer(@Param('id') id: string, @Query('year') year?: string) {
    return this.svc.taxReport(id, { year: year ? parseInt(year, 10) : undefined });
  }

  @Get('cases/:id/tax-report')
  @ApiOperation({ summary: 'AI tax report for the taxpayer behind a case' })
  async byCase(@Param('id') id: string, @Query('year') year?: string) {
    const c = await this.prisma.underdeclarationCase.findUnique({ where: { id }, select: { taxpayerId: true, year: true } });
    if (!c) return { error: 'Case not found' };
    return this.svc.taxReport(c.taxpayerId, { year: year ? parseInt(year, 10) : c.year });
  }

  @Get('cases/:id/tax-report.html')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Printable HTML of the case tax report (→ PDF)' })
  async byCaseHtml(@Param('id') id: string, @Query('year') year: string | undefined, @CurrentStaff() u: any, @Res() res: Response) {
    const c = await this.prisma.underdeclarationCase.findUnique({ where: { id }, select: { taxpayerId: true, year: true } });
    if (!c) { res.status(404).send('Case not found'); return; }
    // Need-to-know: printable report reveals the taxpayer's identity — require an
    // active case-level assignment.
    await this.access.assertCaseAccess({ id: u.id, role: u.role }, id);
    await this.grant.assertActiveSession(u.id, { caseId: id });
    const report = await this.svc.taxReport(c.taxpayerId, { year: year ? parseInt(year, 10) : c.year });
    const tenant = await this.prisma.tenant.findFirst({ select: { shortName: true } });
    const officerName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(renderTaxReportHtml(report, { orgShort: tenant?.shortName || undefined, officerName }));
  }

  @Get('cases/:id/tax-report.xlsx')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Excel export of the case tax report — one worksheet per table, watermarked' })
  async byCaseXlsx(@Param('id') id: string, @Query('year') year: string | undefined, @CurrentStaff() u: any, @Res() res: Response) {
    const c = await this.prisma.underdeclarationCase.findUnique({ where: { id }, select: { taxpayerId: true, year: true } });
    if (!c) { res.status(404).send('Case not found'); return; }
    await this.access.assertCaseAccess({ id: u.id, role: u.role }, id);
    await this.grant.assertActiveSession(u.id, { caseId: id });
    const r: any = await this.svc.taxReport(c.taxpayerId, { year: year ? parseInt(year, 10) : c.year });

    const providerTxRows = r.providerBreakdown.flatMap((p: any) =>
      p.transactions.map((x: any) => ({
        provider: p.providerName, providerType: p.providerType, period: x.period,
        accountName: x.accountName ?? '', accountNumber: x.accountNumber ?? '',
        matchMethod: x.matchMethod ?? '', matchConfidence: x.matchConfidence ?? '',
        inflow: Number(x.inflow ?? 0), outflow: Number(x.outflow ?? 0),
      })),
    );

    const { fileName, mimeType, buffer } = await this.exportSvc.renderMultiSheetXlsx(
      { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName },
      {
        fileName: `tax-report-${id.slice(0, 8)}`,
        sheets: [
          {
            name: 'Income', title: `Income — ${r.taxpayer.name}`,
            columns: [
              { key: 'year', header: 'Year' }, { key: 'observedIncome', header: 'Observed' },
              { key: 'declaredIncome', header: 'Declared' }, { key: 'undeclaredIncome', header: 'Undeclared' },
              { key: 'discrepancyPct', header: 'Discrepancy %' },
            ],
            rows: r.income,
          },
          {
            name: 'Tax Cards', title: 'Tax cards — paid vs assessed',
            columns: [{ key: 'taxType', header: 'Tax' }, { key: 'paid', header: 'Paid (Tax app)' }, { key: 'assessed', header: 'Assessed (FinData)' }],
            rows: r.taxCards,
          },
          {
            name: 'Transactions', title: 'Cross-provider transactions',
            columns: [
              { key: 'provider', header: 'Provider' }, { key: 'providerType', header: 'Type' },
              { key: 'period', header: 'Period' }, { key: 'accountName', header: 'Account Name' },
              { key: 'accountNumber', header: 'Account #' }, { key: 'matchMethod', header: 'Match' },
              { key: 'matchConfidence', header: 'Confidence' }, { key: 'inflow', header: 'Inflow' }, { key: 'outflow', header: 'Outflow' },
            ],
            rows: providerTxRows,
          },
          {
            name: 'AI Signals', title: 'AI analytics signals',
            columns: [{ key: 'agentKey', header: 'Agent' }, { key: 'severity', header: 'Severity' }, { key: 'score', header: 'Score' }, { key: 'summary', header: 'Finding' }],
            rows: r.signals,
          },
          {
            name: 'Cases', title: 'Cases',
            columns: [
              { key: 'year', header: 'Year' }, { key: 'status', header: 'Status' }, { key: 'riskLevel', header: 'Risk' },
              { key: 'observedIncome', header: 'Observed' }, { key: 'declaredIncome', header: 'Declared' }, { key: 'estimatedTaxDue', header: 'Est. Tax Due' },
            ],
            rows: r.cases,
          },
        ],
      },
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post('taxpayers/:id/tax-payment')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'ANALYST')
  @ApiOperation({ summary: 'Manually record a tax payment (PAYE/WHT/CGT/CIT/VAT) for a taxpayer' })
  addPayment(@Param('id') id: string, @Body() dto: any, @CurrentStaff() u: any) {
    return this.svc.addPaymentManual(id, dto, u.id);
  }
}

// Partner: the KIRS Tax app pushes tax PAYMENTS by type into BIZDATA.
@ApiTags('Integration (partner)')
@ApiHeader({ name: 'x-api-key', description: 'Partner platform API key' })
@UseGuards(ApiKeyGuard)
@Controller('integration/tax-payments')
export class IntegrationTaxPaymentsController {
  constructor(private svc: TaxReportService) {}

  @Post()
  @ApiOperation({ summary: 'Push tax-payment records (JSON array). ?dryRun=true validates without writing.' })
  sync(@Body() body: any, @Query('dryRun') dryRun: string | undefined, @Req() req: any) {
    return this.svc.syncPayments(body, { dryRun: dryRun === 'true' || dryRun === '1', partnerName: req.partner?.name });
  }
}
