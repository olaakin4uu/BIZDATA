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
